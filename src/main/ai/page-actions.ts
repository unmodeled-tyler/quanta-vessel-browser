import type { WebContents } from "electron";
import type { TabManager } from "../tabs/tab-manager";
import { extractContent } from "../content/extractor";
import { buildStructuredContext } from "./context-builder";

export interface ActionContext {
  tabManager: TabManager;
}

function waitForLoad(wc: WebContents, timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (!wc.isLoading()) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeout);
    wc.once("did-finish-load", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function resolveSelector(
  wc: WebContents,
  index?: number,
  selector?: string,
): Promise<string | null> {
  if (selector) return selector;
  if (index == null) return null;
  return wc.executeJavaScript(
    `window.__vessel?.getElementSelector?.(${index}) || null`,
  );
}

export async function executeAction(
  name: string,
  args: Record<string, any>,
  ctx: ActionContext,
): Promise<string> {
  const tab = ctx.tabManager.getActiveTab();
  if (!tab) return "Error: No active tab";
  const wc = tab.view.webContents;
  const tabId = ctx.tabManager.getActiveTabId()!;

  switch (name) {
    case "navigate": {
      ctx.tabManager.navigateTab(tabId, args.url);
      await waitForLoad(wc);
      return `Navigated to ${wc.getURL()}`;
    }

    case "go_back": {
      ctx.tabManager.goBack(tabId);
      await waitForLoad(wc);
      return `Went back to ${wc.getURL()}`;
    }

    case "go_forward": {
      ctx.tabManager.goForward(tabId);
      await waitForLoad(wc);
      return `Went forward to ${wc.getURL()}`;
    }

    case "reload": {
      ctx.tabManager.reloadTab(tabId);
      await waitForLoad(wc);
      return `Reloaded ${wc.getURL()}`;
    }

    case "click": {
      const selector = await resolveSelector(wc, args.index, args.selector);
      if (!selector) return "Error: No element index or selector provided";
      try {
        const result = await wc.executeJavaScript(`
          (function() {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return 'Element not found with selector: ${selector.replace(/'/g, "\\'")}';
            el.click();
            return 'Clicked: ' + (el.textContent || el.tagName).trim().slice(0, 100);
          })()
        `);
        await new Promise((r) => setTimeout(r, 150));
        return result;
      } catch (err: any) {
        return `Error clicking element: ${err.message}`;
      }
    }

    case "type_text": {
      const selector = await resolveSelector(wc, args.index, args.selector);
      if (!selector) return "Error: No element index or selector provided";
      try {
        const result = await wc.executeJavaScript(`
          (function() {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return 'Element not found';
            el.focus();
            el.value = ${JSON.stringify(args.text || "")};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Typed into: ' + (el.getAttribute('aria-label') || el.placeholder || el.name || 'input');
          })()
        `);
        return result;
      } catch (err: any) {
        return `Error typing: ${err.message}`;
      }
    }

    case "scroll": {
      const pixels = args.amount || 500;
      const dir = args.direction === "up" ? -pixels : pixels;
      await wc.executeJavaScript(`window.scrollBy(0, ${dir})`);
      return `Scrolled ${args.direction} by ${pixels}px`;
    }

    case "read_page": {
      try {
        const content = await extractContent(wc);
        const structured = buildStructuredContext(content);
        const truncated =
          content.content.length > 20000
            ? content.content.slice(0, 20000) + "\n[Content truncated...]"
            : content.content;
        return `${structured}\n\n## PAGE CONTENT\n\n${truncated}`;
      } catch (err: any) {
        return `Error reading page: ${err.message}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
