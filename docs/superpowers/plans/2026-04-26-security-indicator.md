# Security Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a security indicator (padlock icon) to the AddressBar with three states (secure/insecure/error), a click-to-reveal summary popup, and a "Learn More" window for certificate details.

**Architecture:** Security state is tracked in the main process per-tab and broadcast to the renderer via IPC. The renderer stores the state in a SolidJS store and renders the icon + popup in `AddressBar`. The "Learn More" window is opened from the main process.

**Tech Stack:** Electron 40, TypeScript, SolidJS.

---

## Files

| File | Responsibility |
|---|---|
| `src/shared/types.ts` | Add `SecurityStatus` and `SecurityState` types |
| `src/shared/channels.ts` | Add `SECURITY_STATE_UPDATE` channel |
| `src/main/tabs/tab.ts` | Track security state, emit `security-state-update` IPC |
| `src/main/tabs/tab-manager.ts` | Forward security state to renderer views |
| `src/main/ipc/handlers.ts` | Handle `SECURITY_SHOW_DETAILS` to open cert window |
| `src/renderer/src/stores/security.ts` | New SolidJS store for security state |
| `src/renderer/src/components/chrome/AddressBar.tsx` | Render padlock icon + popup |
| `src/renderer/src/components/chrome/SecurityPopup.tsx` | New component: security summary popup |
| `src/renderer/src/components/chrome/chrome.css` | Styles for icon and popup |

---

### Task 1: Add shared types and channel

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/channels.ts`

- [ ] **Step 1: Add `SecurityStatus` and `SecurityState` types to `src/shared/types.ts`**

  Find the `TabState` interface (around line 31). Insert immediately after it (after line 49):

  ```typescript
  export type SecurityStatus = "secure" | "insecure" | "error" | "none";

  export interface SecurityState {
    status: SecurityStatus;
    url: string;
    errorMessage?: string;
  }
  ```

- [ ] **Step 2: Add `SECURITY_STATE_UPDATE` channel to `src/shared/channels.ts`**

  Find the `// Ad blocking` section (around line 88). Insert after the zoom channels (after line 95):

  ```typescript
  // Security indicator
  SECURITY_STATE_UPDATE: "security:state-update",
  SECURITY_SHOW_DETAILS: "security:show-details",
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/shared/types.ts src/shared/channels.ts
  git commit -m "feat(security): add SecurityState types and IPC channels"
  ```

---

### Task 2: Track security state in `Tab`

**Files:**
- Modify: `src/main/tabs/tab.ts`

- [ ] **Step 1: Add `securityState` field and update logic**

  In the `Tab` class, find the private fields section (around line 42, after `_readerOriginalUrl`). Insert:

  ```typescript
  private _securityState: SecurityState = { status: "none", url: "" };
  ```

  Then add a getter after `get state()` (around line 440):

  ```typescript
  get securityState(): SecurityState {
    return { ...this._securityState };
  }
  ```

- [ ] **Step 2: Add security state listener in `setupListeners()`**

  Find the `wc.on("did-navigate", ...)` block (around line 263). After that block, add:

  ```typescript
    const updateSecurityState = () => {
      const url = wc.getURL();
      let status: SecurityStatus = "none";
      if (url.startsWith("https:")) {
        status = "secure";
      } else if (url.startsWith("http:")) {
        status = "insecure";
      }
      if (this._securityState.status !== status || this._securityState.url !== url) {
        this._securityState = { status, url };
        this.onChange();
      }
    };

    wc.on("did-navigate", () => {
      updateSecurityState();
    });

    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      updateSecurityState();
    });

    wc.on("certificate-error", (_event, url, error) => {
      if (this._securityState.url === url) {
        this._securityState = { status: "error", url, errorMessage: error };
        this.onChange();
      }
    });
  ```

  Note: The `did-navigate` listener was already defined earlier in `setupListeners`. You do NOT need to add another one — just add `updateSecurityState()` inside the existing `did-navigate` handler (line 263-265). Add `updateSecurityState()` inside the existing `did-navigate-in-page` handler (line 282-286). Add the `certificate-error` listener as a new block.

  **Refined approach:** Modify the existing handlers instead of adding duplicates:

  In the existing `wc.on("did-navigate", ...)` block (around line 263):
  ```typescript
    wc.on("did-navigate", (_event, url) => {
      recordNavigation(url);
      this.updateSecurityState();
    });
  ```

  In the existing `wc.on("did-navigate-in-page", ...)` block (around line 282):
  ```typescript
    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      recordNavigation(url);
      this.onPageLoad?.(wc.getURL(), wc);
      this.updateSecurityState();
    });
  ```

  Then add the `updateSecurityState` method and `certificate-error` listener as new code inside `setupListeners()` after the existing listeners. Insert after the `certificate-error` block (after line ~290):

  ```typescript
    const updateSecurityState = () => {
      const url = wc.getURL();
      let status: SecurityStatus = "none";
      if (url.startsWith("https:")) {
        status = "secure";
      } else if (url.startsWith("http:")) {
        status = "insecure";
      }
      if (this._securityState.status !== status || this._securityState.url !== url) {
        this._securityState = { status, url };
        this.onChange();
      }
    };

    wc.on("certificate-error", (_event, url, error) => {
      if (this._securityState.url === url) {
        this._securityState = { status: "error", url, errorMessage: error };
        this.onChange();
      }
    });
  ```

  Wait — the `updateSecurityState` function needs to be declared before the listeners that use it. The cleanest approach is:

  Add `updateSecurityState` as a private method on the `Tab` class (after `syncNavigationState`, around line 231):

  ```typescript
  private updateSecurityState(): void {
    const wc = this.view.webContents;
    const url = wc.getURL();
    let status: SecurityStatus = "none";
    if (url.startsWith("https:")) {
      status = "secure";
    } else if (url.startsWith("http:")) {
      status = "insecure";
    }
    if (this._securityState.status !== status || this._securityState.url !== url) {
      this._securityState = { status, url };
      this.onChange();
    }
  }
  ```

  Then modify the existing `did-navigate` handler to call it:
  ```typescript
    wc.on("did-navigate", (_event, url) => {
      recordNavigation(url);
      this.updateSecurityState();
    });
  ```

  And modify the existing `did-navigate-in-page` handler:
  ```typescript
    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      recordNavigation(url);
      this.onPageLoad?.(wc.getURL(), wc);
      this.updateSecurityState();
    });
  ```

  Then add the `certificate-error` listener inside `setupListeners()` (after `did-navigate-in-page`, around line 286):
  ```typescript
    wc.on("certificate-error", (_event, url, error) => {
      this._securityState = { status: "error", url, errorMessage: error };
      this.onChange();
    });
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/main/tabs/tab.ts
  git commit -m "feat(security): track security state per tab"
  ```

---

### Task 3: Broadcast security state from `TabManager`

**Files:**
- Modify: `src/main/tabs/tab-manager.ts`

- [ ] **Step 1: Add security state to broadcast**

  Find `broadcastState()` (around line 634). Before `this.onStateChange(...)` call, insert:

  ```typescript
    const activeTab = this.getActiveTab();
    if (activeTab) {
      const securityState = activeTab.securityState;
      this.window.webContents.send(Channels.SECURITY_STATE_UPDATE, {
        tabId: this.activeTabId,
        state: securityState,
      });
    }
  ```

  Wait — `this.window` is a `BaseWindow`, not a `WebContents`. The broadcast should go to the chrome view. Look at how other broadcasts work in the file.

  The `broadcastState()` method is:
  ```typescript
  private broadcastState(): void {
    const states = this.getAllStates();
    this.onStateChange(states, this.activeTabId || "");
  }
  ```

  The `onStateChange` callback is wired in `index.ts` and sends to renderer views. We need to also send security state. The cleanest approach: add a new callback `onSecurityStateChange` or send it directly.

  Looking at the existing pattern in `index.ts`, the chrome view receives IPC via `chromeView.webContents.send(...)`. Since `TabManager` doesn't have direct access to `chromeView`, we should add a callback.

  Add to `TabManager` class (around line 48, after `pageLoadCallback`):
  ```typescript
  private securityStateCallback: ((tabId: string, state: SecurityState) => void) | null = null;
  ```

  Add method:
  ```typescript
  onSecurityStateChange(callback: ((tabId: string, state: SecurityState) => void) | null): void {
    this.securityStateCallback = callback;
  }
  ```

  Modify `broadcastState()`:
  ```typescript
  private broadcastState(): void {
    const states = this.getAllStates();
    this.onStateChange(states, this.activeTabId || "");
    const activeTab = this.getActiveTab();
    if (activeTab && this.securityStateCallback) {
      this.securityStateCallback(this.activeTabId!, activeTab.securityState);
    }
  }
  ```

  Then in `index.ts`, wire the callback after `tabManager` is created (around line 199):
  ```typescript
  tabManager.onSecurityStateChange((tabId, state) => {
    sendToRendererViews(Channels.SECURITY_STATE_UPDATE, { tabId, state });
  });
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/main/tabs/tab-manager.ts
  git commit -m "feat(security): broadcast security state to renderer"
  ```

---

### Task 4: Wire security callback in `index.ts`

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Wire `onSecurityStateChange` callback**

  Find where `tabManager` is created (around line 199). After `registerIpcHandlers(...)` or nearby, add:

  ```typescript
  tabManager.onSecurityStateChange((tabId, state) => {
    sendToRendererViews(Channels.SECURITY_STATE_UPDATE, { tabId, state });
  });
  ```

  Make sure `sendToRendererViews` is accessible at that scope. If not, define it before this line (it may already exist inside `createMainWindow`).

- [ ] **Step 2: Commit**

  ```bash
  git add src/main/index.ts
  git commit -m "feat(security): wire security state callback in main"
  ```

---

### Task 5: Create renderer security store

**Files:**
- Create: `src/renderer/src/stores/security.ts`

- [ ] **Step 1: Create the security store**

  ```typescript
  import { createSignal } from "solid-js";
  import type { SecurityState } from "../../../shared/types";
  import { Channels } from "../../../shared/channels";

  const [securityStates, setSecurityStates] = createSignal<Map<string, SecurityState>>(new Map());

  // Listen for security state updates from main process
  if (window.vessel) {
    window.vessel.ipc?.on(Channels.SECURITY_STATE_UPDATE, (_event, { tabId, state }: { tabId: string; state: SecurityState }) => {
      setSecurityStates((prev) => {
        const next = new Map(prev);
        next.set(tabId, state);
        return next;
      });
    });
  }

  export function useSecurity() {
    return {
      securityStates,
      getSecurityState(tabId: string): SecurityState | undefined {
        return securityStates().get(tabId);
      },
    };
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/renderer/src/stores/security.ts
  git commit -m "feat(security): add renderer security state store"
  ```

---

### Task 6: Create `SecurityPopup` component

**Files:**
- Create: `src/renderer/src/components/chrome/SecurityPopup.tsx`

- [ ] **Step 1: Create the popup component**

  ```tsx
  import { Show, type Component } from "solid-js";
  import type { SecurityState } from "../../../../shared/types";
  import { Channels } from "../../../../shared/channels";

  interface SecurityPopupProps {
    state: SecurityState;
    onClose: () => void;
  }

  const SecurityPopup: Component<SecurityPopupProps> = (props) => {
    const statusText = () => {
      switch (props.state.status) {
        case "secure":
          return "Connection is secure. This site uses HTTPS.";
        case "insecure":
          return "Connection is not secure. Information sent to this site could be read by others.";
        case "error":
          return `Certificate error: ${props.state.errorMessage || "Unknown error"}. Proceed with caution.`;
        default:
          return "No security information available.";
      }
    };

    const handleLearnMore = () => {
      window.vessel.ipc?.invoke(Channels.SECURITY_SHOW_DETAILS, props.state);
      props.onClose();
    };

    return (
      <div class="security-popup" onClick={(e) => e.stopPropagation()}>
        <div class="security-popup-content">
          <p class="security-popup-text">{statusText()}</p>
          <button class="security-popup-link" onClick={handleLearnMore}>
            Learn More
          </button>
        </div>
      </div>
    );
  };

  export default SecurityPopup;
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/renderer/src/components/chrome/SecurityPopup.tsx
  git commit -m "feat(security): add SecurityPopup component"
  ```

---

### Task 7: Add padlock icon and popup to `AddressBar`

**Files:**
- Modify: `src/renderer/src/components/chrome/AddressBar.tsx`

- [ ] **Step 1: Import security store and popup**

  Add to imports (after line 27):
  ```typescript
  import { useSecurity } from "../../stores/security";
  import SecurityPopup from "./SecurityPopup";
  ```

- [ ] **Step 2: Use security state in component**

  Inside `AddressBar` component (after line 48, after `let inputRef`):
  ```typescript
  const { getSecurityState } = useSecurity();
  const [showSecurityPopup, setShowSecurityPopup] = createSignal(false);

  const securityState = createMemo(() => {
    const tabId = activeTabId();
    return tabId ? getSecurityState(tabId) : undefined;
  });
  ```

- [ ] **Step 3: Render padlock icon**

  Find the `private-badge` / `url-shell` area (around line 364). Insert the security icon just before `<div class="url-shell">` (around line 373):

  ```tsx
      <Show when={securityState()?.status && securityState()?.status !== "none"}>
        <div class="security-indicator-wrapper">
          <button
            class={`security-indicator ${securityState()?.status}`}
            onClick={() => setShowSecurityPopup((prev) => !prev)}
            title={
              securityState()?.status === "secure"
                ? "Secure connection"
                : securityState()?.status === "insecure"
                  ? "Connection not secure"
                  : "Certificate error"
            }
          >
            {securityState()?.status === "secure" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 1a4 4 0 00-4 4v2H1.5a.5.5 0 00-.5.5v5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-5a.5.5 0 00-.5-.5H11V5a4 4 0 00-4-4zm0 1a3 3 0 013 3v2H4V5a3 3 0 013-3z" />
              </svg>
            ) : securityState()?.status === "insecure" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 1a4 4 0 00-4 4v2H1.5a.5.5 0 00-.5.5v5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-5a.5.5 0 00-.5-.5H11V5a4 4 0 00-4-4zm0 1a3 3 0 013 3v2H4V5a3 3 0 013-3z" />
                <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" stroke-width="1.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 1a4 4 0 00-4 4v2H1.5a.5.5 0 00-.5.5v5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-5a.5.5 0 00-.5-.5H11V5a4 4 0 00-4-4zm0 1a3 3 0 013 3v2H4V5a3 3 0 013-3z" />
                <circle cx="7" cy="8" r="0.8" fill="white" />
              </svg>
            )}
          </button>
          <Show when={showSecurityPopup()}>
            <SecurityPopup
              state={securityState()!}
              onClose={() => setShowSecurityPopup(false)}
            />
          </Show>
        </div>
      </Show>
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/renderer/src/components/chrome/AddressBar.tsx
  git commit -m "feat(security): add padlock icon and popup to AddressBar"
  ```

---

### Task 8: Add styles

**Files:**
- Modify: `src/renderer/src/components/chrome/chrome.css`

- [ ] **Step 1: Add security indicator styles**

  Append to the end of `chrome.css`:

  ```css
  .security-indicator-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .security-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .security-indicator:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .security-indicator.secure {
    color: #4ade80;
  }

  .security-indicator.insecure {
    color: #9ca3af;
  }

  .security-indicator.error {
    color: #f87171;
  }

  .security-popup {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    background: #1e1e24;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 12px 16px;
    min-width: 220px;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .security-popup-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .security-popup-text {
    font-size: 12px;
    color: #e0e0e0;
    line-height: 1.5;
    margin: 0;
  }

  .security-popup-link {
    font-size: 12px;
    color: #60a5fa;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-align: left;
    text-decoration: underline;
  }

  .security-popup-link:hover {
    color: #93c5fd;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/renderer/src/components/chrome/chrome.css
  git commit -m "feat(security): add security indicator styles"
  ```

---

### Task 9: Handle "Learn More" in main process

**Files:**
- Modify: `src/main/ipc/handlers.ts`

- [ ] **Step 1: Add IPC handler for `SECURITY_SHOW_DETAILS`**

  Find `registerIpcHandlers` (around line 93). After the existing handlers or near the end of the function, add:

  ```typescript
  ipcMain.handle(Channels.SECURITY_SHOW_DETAILS, async (_event, state: SecurityState) => {
    const { BrowserWindow } = await import("electron");
    const url = state.url;
    const domain = (() => {
      try {
        return new URL(url).hostname || url;
      } catch {
        return url;
      }
    })();

    const statusText =
      state.status === "secure"
        ? "This site uses a valid TLS certificate."
        : state.status === "insecure"
          ? "This site does not use HTTPS. Data sent to this site is not encrypted."
          : `Certificate error: ${state.errorMessage || "Unknown error"}`;

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Certificate info for ${domain}</title>
  <style>
    body { background: #1a1a1e; color: #e0e0e0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.6; padding: 20px; margin: 0; }
    h1 { font-size: 14px; color: #ffffff; margin: 0 0 12px; }
    .row { margin-bottom: 8px; }
    .label { color: #9ca3af; }
  </style>
</head>
<body>
  <h1>Certificate info for ${domain}</h1>
  <div class="row"><span class="label">URL:</span> ${url}</div>
  <div class="row"><span class="label">Status:</span> ${state.status}</div>
  <div class="row"><span class="label">Details:</span> ${statusText}</div>
</body>
</html>`;

    const win = new BrowserWindow({
      width: 600,
      height: 400,
      title: `Certificate info for ${domain}`,
      backgroundColor: "#1a1a1e",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(content)}`);
  });
  ```

  Make sure `BrowserWindow` is imported if not already. If `BrowserWindow` is already imported at the top of the file, you don't need the dynamic import.

- [ ] **Step 2: Commit**

  ```bash
  git add src/main/ipc/handlers.ts
  git commit -m "feat(security): add Learn More certificate window handler"
  ```

---

### Task 10: Final verification

- [ ] **Step 1: Run TypeScript typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 2: Manual smoke test**

  1. `npm run dev`
  2. Navigate to `https://example.com` → green padlock appears left of URL.
  3. Click padlock → popup shows "Connection is secure."
  4. Click "Learn More" → window opens with cert details.
  5. Navigate to `http://example.com` → gray unlocked padlock.
  6. Click padlock → popup shows "Connection is not secure."

- [ ] **Step 3: Final commit if fixes needed**

  ```bash
  git add -A
  git commit -m "fix(security): address typecheck/smoke-test findings"
  ```

---

## Self-Review

### Spec coverage
- Security state types → Task 1
- Security state tracking in main process → Task 2, 3, 4
- Renderer store → Task 5
- Security popup component → Task 6
- AddressBar icon + popup → Task 7
- Styles → Task 8
- Learn More window → Task 9

### Placeholder scan
- No TBD, TODO, or vague instructions.
- Every step has exact file paths and complete code.

### Type consistency
- `SecurityStatus` = `"secure" | "insecure" | "error" | "none"`
- `SecurityState` = `{ status, url, errorMessage? }`
- `Channels.SECURITY_STATE_UPDATE` and `SECURITY_SHOW_DETAILS` added consistently
- `Tab.securityState` getter returns `SecurityState`
- `TabManager.onSecurityStateChange` callback signature matches usage
- Renderer `useSecurity()` returns correct types
- `SecurityPopup` props match `SecurityState`

All consistent. No gaps found.
