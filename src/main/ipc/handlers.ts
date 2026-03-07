import { ipcMain } from 'electron';
import { Channels } from '../../shared/channels';
import type { AIProvider } from '../ai/provider';
import { createProvider } from '../ai/provider';
import { PROVIDERS } from '../ai/providers';
import { handleAIQuery } from '../ai/commands';
import { extractContent } from '../content/extractor';
import { generateReaderHTML } from '../content/reader-mode';
import { loadSettings, setSetting } from '../config/settings';
import { layoutViews, type WindowState } from '../window';
import type { ProviderConfig } from '../../shared/types';

export function registerIpcHandlers(windowState: WindowState): void {
  const { tabManager, chromeView, mainWindow } = windowState;

  // Initialize AI provider from saved settings
  let provider: AIProvider | null = null;
  const settings = loadSettings();
  if (settings.provider.apiKey || !PROVIDERS[settings.provider.id]?.requiresApiKey) {
    try {
      provider = createProvider(settings.provider);
    } catch {
      // Invalid config — leave null
    }
  }

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
    if (!provider) {
      chromeView.webContents.send(
        Channels.AI_STREAM_CHUNK,
        'No AI provider configured. Open settings (Ctrl+,) to set one up.',
      );
      chromeView.webContents.send(Channels.AI_STREAM_END);
      return;
    }

    const activeTab = tabManager.getActiveTab();
    const activeWebContents = activeTab?.view.webContents;

    await handleAIQuery(
      query,
      provider,
      activeWebContents,
      (chunk) => chromeView.webContents.send(Channels.AI_STREAM_CHUNK, chunk),
      () => chromeView.webContents.send(Channels.AI_STREAM_END),
    );
  });

  ipcMain.handle(Channels.AI_CANCEL, () => {
    provider?.cancel();
  });

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
    setSetting('sidebarWidth', clamped);
    layoutViews(windowState);
    return clamped;
  });

  ipcMain.handle(Channels.FOCUS_MODE_TOGGLE, () => {
    windowState.uiState.focusMode = !windowState.uiState.focusMode;
    layoutViews(windowState);
    return windowState.uiState.focusMode;
  });

  // --- Settings handlers ---

  ipcMain.handle(Channels.SETTINGS_GET, () => {
    return loadSettings();
  });

  ipcMain.handle(Channels.SETTINGS_SET, (_, key: string, value: any) => {
    setSetting(key as any, value);
    // Recreate provider when provider config changes
    if (key === 'provider') {
      const config = value as ProviderConfig;
      if (config.apiKey || !PROVIDERS[config.id]?.requiresApiKey) {
        try {
          provider = createProvider(config);
        } catch {
          provider = null;
        }
      } else {
        provider = null;
      }
    }
  });

  // --- Provider handlers ---

  ipcMain.handle(Channels.PROVIDER_LIST, () => {
    return PROVIDERS;
  });

  ipcMain.handle(Channels.PROVIDER_UPDATE, (_, config: ProviderConfig) => {
    setSetting('provider', config);
    if (config.apiKey || !PROVIDERS[config.id]?.requiresApiKey) {
      try {
        provider = createProvider(config);
      } catch {
        provider = null;
      }
    } else {
      provider = null;
    }
    return { ok: true };
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
