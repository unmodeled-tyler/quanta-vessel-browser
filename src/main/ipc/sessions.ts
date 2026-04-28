import { ipcMain } from "electron";
import { Channels } from "../../shared/channels";
import {
  listNamedSessions,
  saveNamedSession,
  loadNamedSession,
  deleteNamedSession,
} from "../sessions/manager";
import { assertString } from "./common";
import type { TabManager } from "../tabs/tab-manager";

export function registerSessionHandlers(tabManager: TabManager): void {
  ipcMain.handle(Channels.SESSION_LIST, () => {
    return listNamedSessions();
  });

  ipcMain.handle(Channels.SESSION_SAVE, async (_, name: string) => {
    assertString(name, "name");
    return await saveNamedSession(tabManager, name);
  });

  ipcMain.handle(Channels.SESSION_LOAD, async (_, name: string) => {
    assertString(name, "name");
    return await loadNamedSession(tabManager, name);
  });

  ipcMain.handle(Channels.SESSION_DELETE, (_, name: string) => {
    assertString(name, "name");
    return deleteNamedSession(name);
  });
}