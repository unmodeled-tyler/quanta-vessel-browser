import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { TabManager } from "../tabs/tab-manager";
import { extractContent } from "../content/extractor";
import { buildStructuredContext } from "../ai/context-builder";

let httpServer: http.Server | null = null;

function registerTools(server: McpServer, tabManager: TabManager): void {
  // --- Navigation ---

  server.registerTool("vessel_navigate", {
    title: "Navigate",
    description: "Navigate the active browser tab to a URL.",
    inputSchema: { url: z.string().describe("The URL to navigate to") },
  }, async ({ url }) => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };
    const id = tabManager.getActiveTabId()!;
    tabManager.navigateTab(id, url);
    await waitForLoad(tab.view.webContents);
    return { content: [{ type: "text", text: `Navigated to ${tab.view.webContents.getURL()}` }] };
  });

  server.registerTool("vessel_go_back", {
    title: "Go Back",
    description: "Go back in browser history.",
  }, async () => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };
    tabManager.goBack(tabManager.getActiveTabId()!);
    await waitForLoad(tab.view.webContents);
    return { content: [{ type: "text", text: `Went back to ${tab.view.webContents.getURL()}` }] };
  });

  server.registerTool("vessel_go_forward", {
    title: "Go Forward",
    description: "Go forward in browser history.",
  }, async () => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };
    tabManager.goForward(tabManager.getActiveTabId()!);
    await waitForLoad(tab.view.webContents);
    return { content: [{ type: "text", text: `Went forward to ${tab.view.webContents.getURL()}` }] };
  });

  server.registerTool("vessel_reload", {
    title: "Reload",
    description: "Reload the current page.",
  }, async () => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };
    tabManager.reloadTab(tabManager.getActiveTabId()!);
    await waitForLoad(tab.view.webContents);
    return { content: [{ type: "text", text: `Reloaded ${tab.view.webContents.getURL()}` }] };
  });

  // --- Page Interaction ---

  server.registerTool("vessel_click", {
    title: "Click Element",
    description:
      "Click an element on the page by its index number (from vessel_extract_content) or CSS selector.",
    inputSchema: {
      index: z.number().optional().describe("Element index from the page content listing"),
      selector: z.string().optional().describe("CSS selector as fallback"),
    },
  }, async ({ index, selector }) => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };
    const wc = tab.view.webContents;

    const resolvedSelector = await resolveSelector(wc, index, selector);
    if (!resolvedSelector) return { content: [{ type: "text", text: "Error: No index or selector provided" }] };

    try {
      const result = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(resolvedSelector)});
          if (!el) return 'Element not found';
          el.click();
          return 'Clicked: ' + (el.textContent || el.tagName).trim().slice(0, 100);
        })()
      `);
      await new Promise((r) => setTimeout(r, 500));
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  });

  server.registerTool("vessel_type", {
    title: "Type Text",
    description: "Type text into an input field or textarea. Clears existing content first.",
    inputSchema: {
      index: z.number().optional().describe("Element index from the page content listing"),
      selector: z.string().optional().describe("CSS selector as fallback"),
      text: z.string().describe("The text to type"),
    },
  }, async ({ index, selector, text }) => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };
    const wc = tab.view.webContents;

    const resolvedSelector = await resolveSelector(wc, index, selector);
    if (!resolvedSelector) return { content: [{ type: "text", text: "Error: No index or selector provided" }] };

    try {
      const result = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(resolvedSelector)});
          if (!el) return 'Element not found';
          el.focus();
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 'Typed into: ' + (el.getAttribute('aria-label') || el.placeholder || el.name || 'input');
        })()
      `);
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  });

  server.registerTool("vessel_scroll", {
    title: "Scroll Page",
    description: "Scroll the page up or down.",
    inputSchema: {
      direction: z.enum(["up", "down"]).describe("Scroll direction"),
      amount: z.number().optional().describe("Pixels to scroll (default 500)"),
    },
  }, async ({ direction, amount }) => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };
    const pixels = amount || 500;
    const dir = direction === "up" ? -pixels : pixels;
    await tab.view.webContents.executeJavaScript(`window.scrollBy(0, ${dir})`);
    return { content: [{ type: "text", text: `Scrolled ${direction} by ${pixels}px` }] };
  });

  // --- Content Extraction ---

  server.registerTool("vessel_extract_content", {
    title: "Extract Page Content",
    description:
      "Extract the full structured content of the current page including text, headings, interactive elements with indices, forms, and navigation. Use element indices with vessel_click and vessel_type.",
  }, async () => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };

    try {
      const pageContent = await extractContent(tab.view.webContents);
      const structured = buildStructuredContext(pageContent);
      const truncated =
        pageContent.content.length > 30000
          ? pageContent.content.slice(0, 30000) + "\n[Content truncated...]"
          : pageContent.content;
      return { content: [{ type: "text", text: `${structured}\n\n## PAGE CONTENT\n\n${truncated}` }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error extracting content: ${err.message}` }] };
    }
  });

  // --- Tab Management ---

  server.registerTool("vessel_list_tabs", {
    title: "List Tabs",
    description: "List all open browser tabs with their IDs, titles, and URLs.",
  }, async () => {
    const states = tabManager.getAllStates();
    const activeId = tabManager.getActiveTabId();
    const lines = states.map(
      (t) => `${t.id === activeId ? "→ " : "  "}[${t.id}] ${t.title} — ${t.url}`,
    );
    return { content: [{ type: "text", text: lines.join("\n") || "No tabs open" }] };
  });

  server.registerTool("vessel_create_tab", {
    title: "Create Tab",
    description: "Open a new browser tab, optionally navigating to a URL.",
    inputSchema: {
      url: z.string().optional().describe("URL to open (defaults to about:blank)"),
    },
  }, async ({ url }) => {
    const id = tabManager.createTab(url || "about:blank");
    return { content: [{ type: "text", text: `Created tab ${id}` }] };
  });

  server.registerTool("vessel_switch_tab", {
    title: "Switch Tab",
    description: "Switch to a different browser tab by its ID.",
    inputSchema: {
      tabId: z.string().describe("The tab ID to switch to"),
    },
  }, async ({ tabId }) => {
    tabManager.switchTab(tabId);
    return { content: [{ type: "text", text: `Switched to tab ${tabId}` }] };
  });

  server.registerTool("vessel_close_tab", {
    title: "Close Tab",
    description: "Close a browser tab by its ID.",
    inputSchema: {
      tabId: z.string().describe("The tab ID to close"),
    },
  }, async ({ tabId }) => {
    tabManager.closeTab(tabId);
    return { content: [{ type: "text", text: `Closed tab ${tabId}` }] };
  });

  // --- Screenshot ---

  server.registerTool("vessel_screenshot", {
    title: "Screenshot",
    description: "Capture a screenshot of the current page. Returns a base64-encoded PNG image.",
  }, async () => {
    const tab = tabManager.getActiveTab();
    if (!tab) return { content: [{ type: "text", text: "Error: No active tab" }] };

    try {
      const image = await tab.view.webContents.capturePage();
      const png = image.toPNG();
      const base64 = png.toString("base64");
      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType: "image/png",
          },
        ],
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error capturing screenshot: ${err.message}` }] };
    }
  });
}

// --- Helpers ---

function waitForLoad(
  wc: Electron.WebContents,
  timeout = 10000,
): Promise<void> {
  return new Promise((resolve) => {
    if (!wc.isLoading()) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeout);
    wc.once("did-stop-loading", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function resolveSelector(
  wc: Electron.WebContents,
  index?: number,
  selector?: string,
): Promise<string | null> {
  if (selector) return selector;
  if (index == null) return null;
  return wc.executeJavaScript(
    `window.__vessel?.getElementSelector?.(${index}) || null`,
  );
}

// --- HTTP Server ---

function createMcpServer(tabManager: TabManager): McpServer {
  const server = new McpServer({
    name: "vessel-browser",
    version: "0.1.0",
  });
  registerTools(server, tabManager);
  return server;
}

export function startMcpServer(tabManager: TabManager, port: number): void {
  httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    if (url.pathname !== "/mcp") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // CORS for local tools
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Stateless: fresh server + transport per request
      const mcpServer = createMcpServer(tabManager);
        const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err: any) {
      console.error("[Vessel MCP] Error handling request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`[Vessel MCP] Server listening on http://127.0.0.1:${port}/mcp`);
  });

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[Vessel MCP] Port ${port} is already in use. MCP server not started.`);
    } else {
      console.error("[Vessel MCP] Server error:", err);
    }
  });
}

export function stopMcpServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
    console.log("[Vessel MCP] Server stopped");
  }
}
