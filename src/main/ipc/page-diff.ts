import { ipcMain } from "electron";
import { Channels } from "../../shared/channels";
import { getLatestPageDiff } from "../content/page-diff-monitor";
import type { WindowState } from "../window";

export function registerPageDiffHandlers(windowState: WindowState): void {
  ipcMain.handle(Channels.PAGE_DIFF_GET, () => {
    const activeTab = windowState.tabManager.getActiveTab();
    const wc = activeTab?.view.webContents;
    if (!wc) return null;
    return getLatestPageDiff(wc.getURL());
  });
}
