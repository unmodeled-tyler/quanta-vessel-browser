import {
  createMemo,
  createSignal,
  For,
  Show,
  onMount,
  type Component,
} from "solid-js";
import type {
  ProviderConfig,
  ProviderId,
  ProviderMeta,
  ProviderUpdateResult,
} from "../../../../shared/types";
import { useUI } from "../../stores/ui";

const DEFAULT_PROVIDER: ProviderConfig = {
  id: "anthropic",
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  baseUrl: "",
};

const Settings: Component = () => {
  const { settingsOpen, closeSettings } = useUI();
  const [providerMap, setProviderMap] = createSignal<
    Record<ProviderId, ProviderMeta>
  >({} as Record<ProviderId, ProviderMeta>);
  const [config, setConfig] = createSignal<ProviderConfig>(DEFAULT_PROVIDER);
  const [status, setStatus] = createSignal<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  onMount(async () => {
    const [settings, providers] = await Promise.all([
      window.vessel.settings.get(),
      window.vessel.provider.list(),
    ]);

    setProviderMap(providers as Record<ProviderId, ProviderMeta>);
    setConfig({
      ...DEFAULT_PROVIDER,
      ...settings.provider,
      baseUrl: settings.provider?.baseUrl || "",
    });
  });

  const providerEntries = createMemo(() => Object.values(providerMap()));
  const activeProvider = createMemo(() => providerMap()[config().id]);
  const showBaseUrl = createMemo(
    () => config().id === "custom" || Boolean(activeProvider()?.defaultBaseUrl),
  );

  const updateConfig = (patch: Partial<ProviderConfig>) => {
    setStatus(null);
    setConfig((current) => ({
      ...current,
      ...patch,
    }));
  };

  const handleProviderChange = (id: ProviderId) => {
    const meta = providerMap()[id];
    setStatus(null);
    setConfig({
      id,
      apiKey: "",
      model: meta?.defaultModel || "",
      baseUrl: meta?.defaultBaseUrl || "",
    });
  };

  const handleSave = async () => {
    const result = (await window.vessel.provider.update(
      config(),
    )) as ProviderUpdateResult;

    if (!result.ok) {
      setStatus({
        kind: "error",
        text: result.error || "Failed to save AI settings.",
      });
      return;
    }

    setStatus({ kind: "success", text: "Saved." });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeSettings();
  };

  return (
    <Show when={settingsOpen()}>
      <div class="command-bar-overlay" onClick={closeSettings}>
        <div
          class="settings-panel"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <h2 class="settings-title">AI Settings</h2>

          <div class="settings-field">
            <label class="settings-label" for="provider-select">
              Provider
            </label>
            <select
              id="provider-select"
              class="settings-input settings-select"
              value={config().id}
              onChange={(e) =>
                handleProviderChange(e.currentTarget.value as ProviderId)
              }
            >
              <For each={providerEntries()}>
                {(provider) => (
                  <option value={provider.id}>{provider.name}</option>
                )}
              </For>
            </select>
          </div>

          <div class="settings-field">
            <label class="settings-label" for="model-input">
              Model
            </label>
            <input
              id="model-input"
              class="settings-input"
              list="provider-models"
              value={config().model}
              onInput={(e) => updateConfig({ model: e.currentTarget.value })}
              placeholder={activeProvider()?.defaultModel || "Enter model name"}
              spellcheck={false}
            />
            <datalist id="provider-models">
              <For each={activeProvider()?.models || []}>
                {(model) => <option value={model} />}
              </For>
            </datalist>
          </div>

          <div class="settings-field">
            <label class="settings-label" for="api-key-input">
              {activeProvider()?.requiresApiKey
                ? "API Key"
                : "API Key (Optional)"}
            </label>
            <input
              id="api-key-input"
              class="settings-input"
              type="password"
              value={config().apiKey}
              onInput={(e) => updateConfig({ apiKey: e.currentTarget.value })}
              placeholder={
                activeProvider()?.apiKeyPlaceholder || "Enter API key"
              }
              spellcheck={false}
            />
            <p class="settings-hint">{activeProvider()?.apiKeyHint}</p>
          </div>

          <Show when={showBaseUrl()}>
            <div class="settings-field">
              <label class="settings-label" for="base-url-input">
                Base URL
              </label>
              <input
                id="base-url-input"
                class="settings-input"
                value={config().baseUrl || ""}
                onInput={(e) =>
                  updateConfig({ baseUrl: e.currentTarget.value })
                }
                placeholder={activeProvider()?.defaultBaseUrl || "https://..."}
                spellcheck={false}
              />
            </div>
          </Show>

          <div class="settings-actions">
            <button class="settings-save" onClick={handleSave}>
              Save
            </button>
            <button class="settings-close" onClick={closeSettings}>
              Close
            </button>
          </div>

          <Show when={status()}>
            {(currentStatus) => (
              <p
                class="settings-status"
                classList={{
                  success: currentStatus().kind === "success",
                  error: currentStatus().kind === "error",
                }}
              >
                {currentStatus().text}
              </p>
            )}
          </Show>
        </div>
      </div>

      <style>{`
        .settings-panel {
          width: 420px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-visible);
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        }
        .settings-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 20px;
        }
        .settings-field {
          margin-bottom: 16px;
        }
        .settings-label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 6px;
          font-weight: 500;
        }
        .settings-input {
          width: 100%;
          height: 34px;
          padding: 0 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 13px;
          font-family: var(--font-mono);
        }
        .settings-select {
          appearance: none;
        }
        .settings-input:focus {
          border-color: var(--accent-primary);
          outline: none;
        }
        .settings-hint {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
        }
        .settings-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 20px;
        }
        .settings-status {
          margin-top: 12px;
          font-size: 12px;
        }
        .settings-status.success {
          color: #84d19a;
        }
        .settings-status.error {
          color: #ff8e8e;
        }
        .settings-save, .settings-close {
          height: 32px;
          padding: 0 16px;
          border-radius: var(--radius-md);
          font-size: 12px;
          font-weight: 500;
        }
        .settings-save {
          background: var(--accent-primary);
          color: white;
        }
        .settings-save:hover { background: #7a6db7; }
        .settings-close {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }
        .settings-close:hover { background: var(--border-visible); }
      `}</style>
    </Show>
  );
};

export default Settings;
