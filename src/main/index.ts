import { app, dialog, Menu } from "electron";
import fs from "node:fs";
import path from "path";
import { createMainWindow, layoutViews } from "./window";
import { registerIpcHandlers } from "./ipc/handlers";
import { Channels } from "../shared/channels";
import {
  getSettingsLoadIssues,
  getSettingsPath,
  loadSettings,
} from "./config/settings";
import { startMcpServer, stopMcpServer } from "./mcp/server";
import { AgentRuntime } from "./agent/runtime";
import { installAdBlocking } from "./network/ad-blocking";
import * as bookmarkManager from "./bookmarks/manager";
import * as highlightsManager from "./highlights/manager";
import { highlightOnPage } from "./highlights/inject";
import {
  getRuntimeHealth,
  initializeRuntimeHealth,
  setStartupIssues,
} from "./health/runtime-health";
import type { RuntimeHealthIssue, VesselSettings } from "../shared/types";

function rendererUrlFor(view: "chrome" | "sidebar"): string | null {
  if (!process.env.ELECTRON_RENDERER_URL) return null;
  const url = new URL(process.env.ELECTRON_RENDERER_URL);
  url.searchParams.set("view", view);
  return url.toString();
}

function checkWritableUserData(userDataPath: string): RuntimeHealthIssue[] {
  const issues: RuntimeHealthIssue[] = [];
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    const probePath = path.join(
      userDataPath,
      `.vessel-write-test-${process.pid}-${Date.now()}.tmp`,
    );
    fs.writeFileSync(probePath, "ok");
    fs.unlinkSync(probePath);
  } catch (error) {
    issues.push({
      code: "user-data-not-writable",
      severity: "error",
      title: "Vessel cannot write to its data directory",
      detail:
        error instanceof Error ? error.message : "Unknown filesystem error.",
      action: `Check permissions for ${userDataPath}.`,
    });
  }
  return issues;
}

function collectStartupIssues(
  settings: VesselSettings,
  userDataPath: string,
): RuntimeHealthIssue[] {
  const issues = [
    ...getSettingsLoadIssues(),
    ...checkWritableUserData(userDataPath),
  ];

  if (
    settings.obsidianVaultPath.trim() &&
    !fs.existsSync(settings.obsidianVaultPath)
  ) {
    issues.push({
      code: "obsidian-vault-missing",
      severity: "warning",
      title: "Configured Obsidian vault path was not found",
      detail: settings.obsidianVaultPath,
      action: "Update the vault path in Settings or create the directory.",
    });
  }

  return issues;
}

function formatIssue(issue: RuntimeHealthIssue): string {
  const action = issue.action ? `\nAction: ${issue.action}` : "";
  return `${issue.title}\n${issue.detail}${action}`;
}

async function maybeShowStartupHealthDialog(
  windowState: ReturnType<typeof createMainWindow>,
): Promise<void> {
  const health = getRuntimeHealth();
  const hasIssues =
    health.startupIssues.length > 0 || health.mcp.status === "error";
  if (!hasIssues) return;

  const lines = health.startupIssues.map(formatIssue);
  if (health.mcp.status === "error") {
    lines.push(
      `MCP server issue\n${health.mcp.message}\nAction: Open Settings (Ctrl+,) to choose a different port, then save to restart the MCP server.`,
    );
  }

  await dialog.showMessageBox(windowState.mainWindow, {
    type:
      health.startupIssues.some((issue) => issue.severity === "error") ||
      health.mcp.status === "error"
        ? "warning"
        : "info",
    title: "Vessel Startup Checks",
    message: "Vessel launched with runtime warnings.",
    detail: lines.join("\n\n"),
  });
}

async function bootstrap(): Promise<void> {
  const settings = loadSettings();
  const userDataPath = app.getPath("userData");
  initializeRuntimeHealth({
    userDataPath,
    settingsPath: getSettingsPath(),
    configuredPort: settings.mcpPort,
  });
  setStartupIssues(collectStartupIssues(settings, userDataPath));
  if (settings.clearBookmarksOnLaunch) {
    bookmarkManager.clearAll();
  }
  let runtime: AgentRuntime | null = null;

  const windowState = createMainWindow((tabs, activeId) => {
    windowState.chromeView.webContents.send(
      Channels.TAB_STATE_UPDATE,
      tabs,
      activeId,
    );
    layoutViews(windowState);
    runtime?.onTabStateChanged();
  });

  const { chromeView, sidebarView, tabManager } = windowState;
  runtime = new AgentRuntime(tabManager);
  installAdBlocking(tabManager);

  registerIpcHandlers(windowState, runtime);

  // Application-level keyboard shortcuts via Menu accelerators.
  // This ensures shortcuts work regardless of which WebContentsView has focus.
  const appMenu = Menu.buildFromTemplate([
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Highlights",
      submenu: [
        {
          label: "Capture Highlight",
          accelerator: "CmdOrCtrl+H",
          click: () => {
            const activeTab = tabManager.getActiveTab();
            if (!activeTab) return;
            const wc = activeTab.view.webContents;
            if (wc.isDestroyed()) return;
            const url = wc.getURL();
            if (!url || url === "about:blank") return;

            void (async () => {
              try {
                const selectedText: string = await wc.executeJavaScript(`
                  (function() {
                    var sel = window.getSelection();
                    return sel ? sel.toString().trim() : '';
                  })()
                `);

                if (!selectedText) {
                  chromeView.webContents.send(Channels.HIGHLIGHT_CAPTURE_RESULT, {
                    success: false,
                    message: "No text selected — select text on the page first",
                  });
                  return;
                }

                const capped =
                  selectedText.length > 5000
                    ? selectedText.slice(0, 5000)
                    : selectedText;

                const highlight = highlightsManager.addHighlight(
                  url,
                  undefined,
                  capped,
                  undefined,
                  "yellow",
                  "user",
                );

                await highlightOnPage(
                  wc,
                  null,
                  capped,
                  undefined,
                  undefined,
                  "yellow",
                ).catch(() => {});

                if (!chromeView.webContents.isDestroyed()) {
                  chromeView.webContents.send(
                    Channels.HIGHLIGHT_CAPTURE_RESULT,
                    { success: true, text: capped, id: highlight.id },
                  );
                }
              } catch {
                if (!chromeView.webContents.isDestroyed()) {
                  chromeView.webContents.send(
                    Channels.HIGHLIGHT_CAPTURE_RESULT,
                    { success: false, message: "Could not capture selection" },
                  );
                }
              }
            })();
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);

  bookmarkManager.subscribe((state) => {
    chromeView.webContents.send(Channels.BOOKMARKS_UPDATE, state);
    sidebarView.webContents.send(Channels.BOOKMARKS_UPDATE, state);
  });

  // Load renderer
  const chromeUrl = rendererUrlFor("chrome");
  const sidebarUrl = rendererUrlFor("sidebar");

  if (chromeUrl && sidebarUrl) {
    chromeView.webContents.loadURL(chromeUrl);
    sidebarView.webContents.loadURL(sidebarUrl);
  } else {
    const rendererFile = path.join(__dirname, "../renderer/index.html");
    chromeView.webContents.loadFile(rendererFile, {
      query: { view: "chrome" },
    });
    sidebarView.webContents.loadFile(rendererFile, {
      query: { view: "sidebar" },
    });
  }

  // Start MCP server for external agent integration
  await startMcpServer(tabManager, runtime, settings.mcpPort);

  // Restore previous session, or open the default tab once chrome is ready
  chromeView.webContents.once("did-finish-load", () => {
    const savedSession = runtime.getState().session;
    if (settings.autoRestoreSession && savedSession?.tabs.length) {
      runtime.restoreSession(savedSession);
    } else {
      tabManager.createTab(settings.defaultUrl);
      runtime.captureSession("Initial session");
    }
    layoutViews(windowState);
    setImmediate(() => layoutViews(windowState));
    void maybeShowStartupHealthDialog(windowState);
  });
}

app.whenReady().then(bootstrap).catch((error) => {
  console.error("[Vessel] Failed to bootstrap application:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  void stopMcpServer().finally(() => {
    app.quit();
  });
});
