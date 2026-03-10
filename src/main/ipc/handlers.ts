import { ipcMain } from "electron";
import { Channels } from "../../shared/channels";
import { extractContent } from "../content/extractor";
import { generateReaderHTML } from "../content/reader-mode";
import { loadSettings, setSetting } from "../config/settings";
import { layoutViews, type WindowState } from "../window";
import type {
  ApprovalMode,
  AgentRuntimeState,
  SessionSnapshot,
} from "../../shared/types";
import type { AgentRuntime } from "../agent/runtime";
import * as bookmarkManager from "../bookmarks/manager";

export function registerIpcHandlers(
  windowState: WindowState,
  runtime: AgentRuntime,
): void {
  const { tabManager, chromeView, sidebarView, mainWindow } = windowState;

  const sendToRendererViews = (channel: string, ...args: unknown[]) => {
    chromeView.webContents.send(channel, ...args);
    sidebarView.webContents.send(channel, ...args);
  };

  runtime.setUpdateListener((state: AgentRuntimeState) => {
    sendToRendererViews(Channels.AGENT_RUNTIME_UPDATE, state);
  });

  // --- Tab handlers ---

  ipcMain.handle(Channels.TAB_CREATE, (_, url?: string) => {
    const id = tabManager.createTab(url || loadSettings().defaultUrl);
    layoutViews(windowState);
    return id;
  });

  ipcMain.handle(Channels.TAB_CLOSE, (_, id: string) => {
    tabManager.closeTab(id);
    layoutViews(windowState);
  });

  ipcMain.handle(Channels.TAB_SWITCH, (_, id: string) => {
    tabManager.switchTab(id);
    layoutViews(windowState);
  });

  ipcMain.handle(Channels.TAB_NAVIGATE, (_, id: string, url: string) => {
    tabManager.navigateTab(id, url);
  });

  ipcMain.handle(Channels.TAB_BACK, (_, id: string) => {
    tabManager.goBack(id);
  });

  ipcMain.handle(Channels.TAB_FORWARD, (_, id: string) => {
    tabManager.goForward(id);
  });

  ipcMain.handle(Channels.TAB_RELOAD, (_, id: string) => {
    tabManager.reloadTab(id);
  });

  // --- AI handlers ---

  ipcMain.handle(Channels.AI_QUERY, async (_, query: string) => {
    sendToRendererViews(Channels.AI_STREAM_START, query);
    sendToRendererViews(
      Channels.AI_STREAM_CHUNK,
      [
        "Vessel does not run a locally configured model.",
        "Control it through an external agent harness such as Hermes Agent or OpenClaw.",
        "Use the sidebar here for runtime visibility, approvals, checkpoints, and bookmarks.",
      ].join("\n\n"),
    );
    sendToRendererViews(Channels.AI_STREAM_END);
  });

  ipcMain.handle(Channels.AI_CANCEL, () => undefined);

  // --- Content handlers ---

  ipcMain.handle(Channels.CONTENT_EXTRACT, async () => {
    const activeTab = tabManager.getActiveTab();
    if (!activeTab) return null;
    return extractContent(activeTab.view.webContents);
  });

  ipcMain.handle(Channels.READER_MODE_TOGGLE, async () => {
    const activeTab = tabManager.getActiveTab();
    if (!activeTab) return;

    const content = await extractContent(activeTab.view.webContents);
    const html = generateReaderHTML(content);
    activeTab.view.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
  });

  // --- UI handlers ---

  ipcMain.handle(Channels.SIDEBAR_TOGGLE, () => {
    windowState.uiState.sidebarOpen = !windowState.uiState.sidebarOpen;
    layoutViews(windowState);
    return {
      open: windowState.uiState.sidebarOpen,
      width: windowState.uiState.sidebarWidth,
    };
  });

  ipcMain.handle(Channels.SIDEBAR_RESIZE, (_, width: number) => {
    const clamped = Math.max(240, Math.min(800, Math.round(width)));
    windowState.uiState.sidebarWidth = clamped;
    setSetting("sidebarWidth", clamped);
    layoutViews(windowState);
    return clamped;
  });

  ipcMain.handle(Channels.FOCUS_MODE_TOGGLE, () => {
    windowState.uiState.focusMode = !windowState.uiState.focusMode;
    layoutViews(windowState);
    return windowState.uiState.focusMode;
  });

  ipcMain.handle(Channels.SETTINGS_VISIBILITY, (_, open: boolean) => {
    windowState.uiState.settingsOpen = open;
    layoutViews(windowState);
    return windowState.uiState.settingsOpen;
  });

  // --- Settings handlers ---

  ipcMain.handle(Channels.SETTINGS_GET, () => {
    return loadSettings();
  });

  ipcMain.handle(Channels.SETTINGS_SET, (_, key: string, value: any) => {
    setSetting(key as any, value);
    if (key === "approvalMode") {
      runtime.setApprovalMode(value as ApprovalMode);
    }
  });

  // --- Agent runtime handlers ---

  ipcMain.handle(Channels.AGENT_RUNTIME_GET, () => runtime.getState());

  ipcMain.handle(Channels.AGENT_PAUSE, () => runtime.pause());

  ipcMain.handle(Channels.AGENT_RESUME, () => runtime.resume());

  ipcMain.handle(
    Channels.AGENT_SET_APPROVAL_MODE,
    (_, mode: ApprovalMode): AgentRuntimeState => {
      setSetting("approvalMode", mode);
      return runtime.setApprovalMode(mode);
    },
  );

  ipcMain.handle(
    Channels.AGENT_APPROVAL_RESOLVE,
    (_, approvalId: string, approved: boolean) =>
      runtime.resolveApproval(approvalId, approved),
  );

  ipcMain.handle(
    Channels.AGENT_CHECKPOINT_CREATE,
    (_, name?: string, note?: string) => runtime.createCheckpoint(name, note),
  );

  ipcMain.handle(Channels.AGENT_CHECKPOINT_RESTORE, (_, checkpointId: string) =>
    runtime.restoreCheckpoint(checkpointId),
  );

  ipcMain.handle(Channels.AGENT_SESSION_CAPTURE, (_, note?: string) =>
    runtime.captureSession(note),
  );

  ipcMain.handle(
    Channels.AGENT_SESSION_RESTORE,
    (_, snapshot?: SessionSnapshot | null) => runtime.restoreSession(snapshot),
  );

  // --- Bookmark handlers ---

  ipcMain.handle(Channels.BOOKMARKS_GET, () => {
    return bookmarkManager.getState();
  });

  ipcMain.handle(Channels.FOLDER_CREATE, (_, name: string) => {
    return bookmarkManager.createFolder(name);
  });

  ipcMain.handle(
    Channels.BOOKMARK_SAVE,
    (_, url: string, title: string, folderId?: string, note?: string) =>
      bookmarkManager.saveBookmark(url, title, folderId, note),
  );

  ipcMain.handle(Channels.BOOKMARK_REMOVE, (_, id: string) => {
    return bookmarkManager.removeBookmark(id);
  });

  ipcMain.handle(Channels.FOLDER_REMOVE, (_, id: string) => {
    return bookmarkManager.removeFolder(id);
  });

  ipcMain.handle(Channels.FOLDER_RENAME, (_, id: string, newName: string) => {
    return bookmarkManager.renameFolder(id, newName);
  });

  // --- Window controls ---

  ipcMain.handle(Channels.WINDOW_MINIMIZE, () => {
    mainWindow.minimize();
  });

  ipcMain.handle(Channels.WINDOW_MAXIMIZE, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle(Channels.WINDOW_CLOSE, () => {
    mainWindow.close();
  });
}
