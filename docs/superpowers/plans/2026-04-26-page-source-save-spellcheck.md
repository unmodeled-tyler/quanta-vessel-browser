# View Page Source, Save Page As, and Disable Spellcheck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three missing browser features: view page source in a new window, save page as MHTML/HTML, and globally disable Chromium spellcheck.

**Architecture:** All changes are in the main process. No renderer IPC or UI components needed. View source fetches outerHTML via `executeJavaScript` and opens a plain `BrowserWindow`. Save page uses `dialog.showSaveDialog` + `webContents.savePage`. Spellcheck is disabled via `spellcheck: false` in all `WebContentsView` constructors.

**Tech Stack:** Electron 40, TypeScript.

---

## Files

| File | Responsibility |
|---|---|
| `src/main/tabs/tab.ts` | `viewSource()` method; `onSavePage` callback; context-menu items; `Ctrl+U` not needed (app menu handles it) |
| `src/main/tabs/tab-manager.ts` | `savePage()` method; `sanitizePageFilename` helper; wire `onSavePage` callback in `createTab()` |
| `src/main/startup/menu.ts` | App menu items: "Save Page As..." (`Ctrl+S`) and "View Page Source" (`Ctrl+U`) |
| `src/main/index.ts` | Wire new menu handlers to `tabManager` |
| `src/main/window.ts` | Add `spellcheck: false` to chrome, sidebar, and devtools panel `webPreferences` |

---

### Task 1: Add `viewSource()` to `Tab`

**Files:**
- Modify: `src/main/tabs/tab.ts` (imports, new method)

- [ ] **Step 1: Run impact analysis on `Tab.viewSource`**

  ```bash
  npx gitnexus analyze
  ```

  Then run:

  ```bash
  # Use gitnexus impact tool or read from CLI:
  npx gitnexus impact --target Tab --direction upstream
  ```

  Expected: LOW risk — only `TabManager` constructs `Tab` directly.

- [ ] **Step 2: Add `BrowserWindow` to imports**

  ```typescript
  import {
    BaseWindow,
    BrowserWindow,
    clipboard,
    Menu,
    MenuItem,
    session,
    WebContentsView,
    type WebContents,
  } from "electron";
  ```

- [ ] **Step 3: Add `viewSource()` method to `Tab` class**

  Insert after `zoomReset()` (around line 530):

  ```typescript
  async viewSource(): Promise<void> {
    const wc = this.view.webContents;
    try {
      const html = await wc.executeJavaScript("document.documentElement.outerHTML");
      const url = wc.getURL();
      const escaped = String(html)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const sourceHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>view-source:${url}</title>
  <style>
    body { background: #1a1a1e; color: #e0e0e0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.5; padding: 16px; margin: 0; }
    pre { white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body><pre>${escaped}</pre></body>
</html>`;

      const win = new BrowserWindow({
        width: 960,
        height: 700,
        title: `view-source:${url}`,
        backgroundColor: "#1a1a1e",
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      });
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(sourceHtml)}`);
    } catch (err) {
      logger.warn("Failed to view page source:", err);
    }
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/tabs/tab.ts
  git commit -m "feat(tabs): add viewSource() to open raw HTML in new window"
  ```

---

### Task 2: Add `savePage()` to `TabManager`

**Files:**
- Modify: `src/main/tabs/tab-manager.ts`

- [ ] **Step 1: Run impact analysis on `TabManager.savePage`**

  ```bash
  npx gitnexus impact --target TabManager --direction upstream
  ```

  Expected: LOW risk — only `index.ts` constructs `TabManager`.

- [ ] **Step 2: Add `sanitizePageFilename` helper**

  Insert after `sanitizePdfFilename` (around line 39):

  ```typescript
  function sanitizePageFilename(title: string, ext: string): string {
    const clean = title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const base = (clean || "Vessel Page").replace(new RegExp(`\\.${ext}$`, "i"), "");
    return `${base}.${ext}`;
  }
  ```

- [ ] **Step 3: Add `savePage()` method to `TabManager`**

  Insert after `saveTabAsPdf()` (around line 324):

  ```typescript
  async savePage(
    id: string,
    format: "MHTML" | "HTMLComplete" = "MHTML",
  ): Promise<string | null> {
    const tab = this.tabs.get(id);
    if (!tab) return null;

    const ext = format === "MHTML" ? "mhtml" : "html";
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save Page As",
      defaultPath: sanitizePageFilename(tab.state.title || "Vessel Page", ext),
      filters: [
        { name: format === "MHTML" ? "MHTML" : "HTML", extensions: [ext] },
      ],
    });
    if (canceled || !filePath) return null;

    await tab.view.webContents.savePage(filePath, format);
    return filePath;
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/tabs/tab-manager.ts
  git commit -m "feat(tabs): add savePage() to TabManager for MHTML/HTML save"
  ```

---

### Task 3: Wire `onSavePage` callback and add context-menu items

**Files:**
- Modify: `src/main/tabs/tab.ts` (options, callback field, context menu)
- Modify: `src/main/tabs/tab-manager.ts` (wire callback in `createTab`)

- [ ] **Step 1: Add `onSavePage` to `Tab` constructor options**

  In the `OpenUrlRequest` interface area (around line 20), add to the `options` parameter type:

  ```typescript
  onSavePage?: () => void;
  ```

  In the private fields section (around line 33), add:

  ```typescript
  private onSavePage?: () => void;
  ```

  In the constructor body (around line 110), add:

  ```typescript
  this.onSavePage = options?.onSavePage;
  ```

- [ ] **Step 2: Add context-menu items in `buildContextMenu()`**

  In `buildContextMenu()`, after the `"Copy Link"` block (around line 431) and before `menu.popup()`:

  ```typescript
  menu.append(new MenuItem({ type: "separator" }));

  menu.append(
    new MenuItem({
      label: "Save Page As...",
      click: () => this.onSavePage?.(),
    }),
  );

  menu.append(
    new MenuItem({
      label: "View Page Source",
      click: () => void this.viewSource(),
    }),
  );
  ```

- [ ] **Step 3: Wire `onSavePage` in `TabManager.createTab()`**

  In `createTab()` (around line 97), inside the `new Tab(...)` options object, add:

  ```typescript
  onSavePage: () => {
    void this.savePage(id);
  },
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/tabs/tab.ts src/main/tabs/tab-manager.ts
  git commit -m "feat(tabs): add View Source and Save Page As context menu items"
  ```

---

### Task 4: Update app menu with View Source and Save Page As

**Files:**
- Modify: `src/main/startup/menu.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update `AppMenuHandlers` interface in `menu.ts`**

  Add two new handlers (around line 7):

  ```typescript
  viewPageSource: () => void;
  savePageAs: () => void;
  ```

- [ ] **Step 2: Add menu items in `setupAppMenu()`**

  Under **File** submenu, after "New Window" (around line 21), add:

  ```typescript
  {
    label: "Save Page As...",
    accelerator: "CommandOrControl+S",
    click: handlers.savePageAs,
  },
  ```

  Under **View** submenu, after "Actual Size" (around line 58), add:

  ```typescript
  { type: "separator" },
  {
    label: "View Page Source",
    accelerator: "CommandOrControl+U",
    click: handlers.viewPageSource,
  },
  ```

- [ ] **Step 3: Wire handlers in `index.ts`**

  In the `setupAppMenu({...})` call (around line 216), add after `zoomReset`:

  ```typescript
  viewPageSource: () => {
    const activeTab = tabManager.getActiveTab();
    if (activeTab) activeTab.viewSource();
  },
  savePageAs: () => {
    const activeTabId = tabManager.getActiveTabId();
    if (activeTabId) {
      void tabManager.savePage(activeTabId);
    }
  },
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/startup/menu.ts src/main/index.ts
  git commit -m "feat(menu): add View Page Source (Ctrl+U) and Save Page As (Ctrl+S) to app menu"
  ```

---

### Task 5: Disable spellcheck globally

**Files:**
- Modify: `src/main/window.ts`
- Modify: `src/main/tabs/tab.ts`

- [ ] **Step 1: Add `spellcheck: false` to chrome, sidebar, and devtools views**

  In `createMainWindow()`, update the `webPreferences` for `chromeView`, `sidebarView`, and `devtoolsPanelView`. Each currently has:

  ```typescript
  webPreferences: {
    preload: path.join(__dirname, "../preload/index.js"),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
  ```

  Add `spellcheck: false,` to all three objects (around lines 215, 227, 243).

- [ ] **Step 2: Add `spellcheck: false` to tab `webPreferences`**

  In `Tab` constructor (around line 116), update:

  ```typescript
  const webPreferences: Electron.WebPreferences = {
    preload: path.join(__dirname, "../preload/content-script.js"),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    spellcheck: false,
  };
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/main/window.ts src/main/tabs/tab.ts
  git commit -m "feat(browser): disable spellcheck globally in all WebContentsViews"
  ```

---

### Task 6: Final verification

- [ ] **Step 1: Run TypeScript typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 2: Run gitnexus detect_changes**

  ```bash
  npx gitnexus detect-changes --scope all
  ```

  Expected: only the 4 files above are modified.

- [ ] **Step 3: Manual smoke test**

  1. Start the app: `npm run dev`
  2. Navigate to any website.
  3. Press `Ctrl+U` — a new window titled `view-source:...` opens with raw HTML.
  4. Right-click on the page → "Save Page As..." → choose location → verify `.mhtml` file is written.
  5. Click **File** → **Save Page As...** → same behavior.
  6. Type in any `<input>` field in the chrome or on a webpage — no red squiggles appear.

- [ ] **Step 4: Final commit if any fixes needed**

  ```bash
  git add -A
  git commit -m "fix: address typecheck/smoke-test findings"
  ```

---

## Self-Review

### Spec coverage
- View Page Source in new window → Task 1 + Task 3 + Task 4
- Save Page As (MHTML) → Task 2 + Task 3 + Task 4
- Spellcheck disabled globally → Task 5
- App menu integration → Task 4
- Context menu integration → Task 3

### Placeholder scan
- No TBD, TODO, or "implement later" found.
- Every step contains exact file paths and complete code.
- No vague instructions like "handle errors appropriately."

### Type consistency
- `Tab.viewSource()` → `Promise<void>`
- `TabManager.savePage(id, format)` → `Promise<string | null>`
- `onSavePage` callback → `() => void`
- `AppMenuHandlers` adds `viewPageSource` and `savePageAs` as `() => void`
- `dialog.showSaveDialog` called without parent window (type-safe in Electron 40)
- `webContents.savePage` format values: `"MHTML"` and `"HTMLComplete"` — correct per Electron API

All consistent. No gaps found.
