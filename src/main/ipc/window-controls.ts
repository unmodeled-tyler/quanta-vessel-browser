import { ipcMain } from "electron";
import { Channels } from "../../shared/channels";
import type { BaseWindow } from "electron";

export function registerWindowControlHandlers(mainWindow: BaseWindow): void {
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
