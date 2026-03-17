import {
  createSignal,
  createEffect,
  onCleanup,
  For,
  Show,
  type Component,
} from "solid-js";
import "./devtools.css";

interface ConsoleEntry {
  id: number;
  timestamp: string;
  level: string;
  text: string;
  url?: string;
  line?: number;
}

interface NetworkEntry {
  id: number;
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  resourceType?: string;
  status?: number;
  timing?: { durationMs?: number };
  error?: string;
}

interface ErrorEntry {
  id: number;
  timestamp: string;
  type: string;
  message: string;
  description?: string;
}

interface ActivityEntry {
  id: number;
  timestamp: string;
  tool: string;
  args: string;
  result: string;
  durationMs: number;
  status: "running" | "completed" | "failed";
}

interface PanelState {
  console: ConsoleEntry[];
  network: NetworkEntry[];
  errors: ErrorEntry[];
  activity: ActivityEntry[];
}

type PanelTab = "console" | "network" | "activity";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function statusClass(status?: number): string {
  if (status == null) return "pending";
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirect";
  return "error";
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function shortenSource(url?: string, line?: number): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const file = u.pathname.split("/").pop() || u.pathname;
    return line != null ? `${file}:${line}` : file;
  } catch {
    return url;
  }
}

const ConsoleView: Component<{ entries: ConsoleEntry[] }> = (props) => {
  let scrollRef: HTMLDivElement | undefined;
  let autoScroll = true;

  const onScroll = () => {
    if (!scrollRef) return;
    const atBottom =
      scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight < 30;
    autoScroll = atBottom;
  };

  createEffect(() => {
    // Re-run when entries change
    props.entries.length;
    if (autoScroll && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  return (
    <Show
      when={props.entries.length > 0}
      fallback={
        <div class="devtools-empty">
          Waiting for console output... Console monitoring activates when an
          agent uses devtools.
        </div>
      }
    >
      <div class="devtools-console" ref={scrollRef} onScroll={onScroll}>
        <For each={props.entries}>
          {(entry) => (
            <div class={`console-entry level-${entry.level}`}>
              <span class={`console-level ${entry.level}`}>{entry.level}</span>
              <span class="console-time">{formatTime(entry.timestamp)}</span>
              <span class="console-text">{entry.text}</span>
              <span class="console-source">
                {shortenSource(entry.url, entry.line)}
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};

const NetworkView: Component<{ entries: NetworkEntry[] }> = (props) => {
  let scrollRef: HTMLDivElement | undefined;
  let autoScroll = true;

  const onScroll = () => {
    if (!scrollRef) return;
    const atBottom =
      scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight < 30;
    autoScroll = atBottom;
  };

  createEffect(() => {
    props.entries.length;
    if (autoScroll && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  return (
    <Show
      when={props.entries.length > 0}
      fallback={
        <div class="devtools-empty">
          Waiting for network requests... Network monitoring activates when an
          agent uses devtools.
        </div>
      }
    >
      <div class="devtools-network" ref={scrollRef} onScroll={onScroll}>
        <div class="network-header">
          <span>Method</span>
          <span>URL</span>
          <span>Status</span>
          <span>Type</span>
          <span>Time</span>
        </div>
        <For each={props.entries}>
          {(entry) => (
            <div
              class={`network-entry ${entry.error || (entry.status && entry.status >= 400) ? "error" : ""}`}
            >
              <span class="network-method">{entry.method}</span>
              <span class="network-url" title={entry.url}>
                {shortenUrl(entry.url)}
              </span>
              <span class={`network-status ${statusClass(entry.status)}`}>
                {entry.error
                  ? "ERR"
                  : entry.status != null
                    ? entry.status
                    : "..."}
              </span>
              <span class="network-type">
                {entry.resourceType || "—"}
              </span>
              <span class="network-duration">
                {entry.timing?.durationMs != null
                  ? `${entry.timing.durationMs}ms`
                  : "—"}
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};

const ActivityView: Component<{ entries: ActivityEntry[] }> = (props) => {
  let scrollRef: HTMLDivElement | undefined;
  let autoScroll = true;

  const onScroll = () => {
    if (!scrollRef) return;
    const atBottom =
      scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight < 30;
    autoScroll = atBottom;
  };

  createEffect(() => {
    props.entries.length;
    if (autoScroll && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  return (
    <Show
      when={props.entries.length > 0}
      fallback={
        <div class="devtools-empty">
          Waiting for agent devtools activity...
        </div>
      }
    >
      <div class="devtools-activity" ref={scrollRef} onScroll={onScroll}>
        <For each={props.entries}>
          {(entry) => (
            <div class="activity-entry">
              <span class="activity-time">
                {formatTime(entry.timestamp)}
              </span>
              <span class="activity-tool">
                {entry.tool.replace("devtools_", "")}
              </span>
              <span class="activity-args" title={entry.args}>
                {entry.args}
              </span>
              <span class={`activity-status ${entry.status}`}>
                {entry.status === "running"
                  ? "running..."
                  : entry.status}
              </span>
              <span class="activity-duration">
                {entry.durationMs > 0 ? `${entry.durationMs}ms` : "—"}
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};

const DevToolsPanel: Component = () => {
  const [activeTab, setActiveTab] = createSignal<PanelTab>("console");
  const [state, setState] = createSignal<PanelState>({
    console: [],
    network: [],
    errors: [],
    activity: [],
  });

  createEffect(() => {
    const cleanup = window.vessel.devtoolsPanel.onStateUpdate(
      (newState: PanelState) => {
        setState(newState);
      },
    );
    onCleanup(cleanup);
  });

  const errorCount = () => state().errors.length;
  const networkCount = () => state().network.length;
  const activityRunning = () =>
    state().activity.filter((a) => a.status === "running").length;

  const close = () => {
    window.vessel.devtoolsPanel.toggle();
  };

  return (
    <div class="devtools-panel">
      <div class="devtools-tabs">
        <button
          class={`devtools-tab ${activeTab() === "console" ? "active" : ""}`}
          onClick={() => setActiveTab("console")}
        >
          Console
          <Show when={errorCount() > 0}>
            <span class="devtools-tab-badge error">{errorCount()}</span>
          </Show>
        </button>
        <button
          class={`devtools-tab ${activeTab() === "network" ? "active" : ""}`}
          onClick={() => setActiveTab("network")}
        >
          Network
          <Show when={networkCount() > 0}>
            <span class="devtools-tab-badge count">{networkCount()}</span>
          </Show>
        </button>
        <button
          class={`devtools-tab ${activeTab() === "activity" ? "active" : ""}`}
          onClick={() => setActiveTab("activity")}
        >
          Activity
          <Show when={activityRunning() > 0}>
            <span class="devtools-tab-badge count">{activityRunning()}</span>
          </Show>
        </button>
        <div class="devtools-tab-spacer" />
        <button class="devtools-close-btn" onClick={close} title="Close DevTools">
          ×
        </button>
      </div>
      <div class="devtools-content">
        <Show when={activeTab() === "console"}>
          <ConsoleView entries={state().console} />
        </Show>
        <Show when={activeTab() === "network"}>
          <NetworkView entries={state().network} />
        </Show>
        <Show when={activeTab() === "activity"}>
          <ActivityView entries={state().activity} />
        </Show>
      </div>
    </div>
  );
};

export default DevToolsPanel;
