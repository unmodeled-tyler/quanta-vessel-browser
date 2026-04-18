import { app } from "electron";
import path from "path";
import type { HistoryEntry, HistoryState } from "../../shared/types";
import {
  createDebouncedJsonPersistence,
  loadJsonFile,
} from "../persistence/json-file";

const MAX_HISTORY_ENTRIES = 5000;
const SAVE_DEBOUNCE_MS = 250;

let state: HistoryState | null = null;
const listeners = new Set<(state: HistoryState) => void>();

function getHistoryPath(): string {
  return path.join(app.getPath("userData"), "vessel-history.json");
}

function load(): HistoryState {
  if (state) return state;
  state = loadJsonFile({
    filePath: getHistoryPath(),
    fallback: { entries: [] },
    parse: (raw) => {
      const parsed = raw as Partial<HistoryState>;
      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    },
  });
  return state;
}

const persistence = createDebouncedJsonPersistence({
  debounceMs: SAVE_DEBOUNCE_MS,
  filePath: getHistoryPath(),
  getValue: () => state,
  logLabel: "history",
});

function save(): void {
  persistence.schedule();
}

function emit(): void {
  if (!state) return;
  const snapshot = { entries: [...state.entries] };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getState(): HistoryState {
  load();
  return { entries: [...state!.entries] };
}

export function subscribe(
  listener: (state: HistoryState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function addEntry(url: string, title: string): void {
  if (!url || url === "about:blank") return;

  load();

  // Don't record duplicate consecutive visits to the same URL
  const last = state!.entries[0];
  if (last && last.url === url) {
    // Update title if it changed
    if (title && title !== last.title) {
      last.title = title;
      save();
      emit();
    }
    return;
  }

  const entry: HistoryEntry = {
    url,
    title: title || url,
    visitedAt: new Date().toISOString(),
  };

  state!.entries.unshift(entry);

  // Cap history size
  if (state!.entries.length > MAX_HISTORY_ENTRIES) {
    state!.entries = state!.entries.slice(0, MAX_HISTORY_ENTRIES);
  }

  save();
  emit();
}

export function search(query: string, limit = 50): HistoryEntry[] {
  load();
  if (!query.trim()) return state!.entries.slice(0, limit);

  const normalized = query.toLowerCase();
  return state!.entries
    .filter(
      (e) =>
        e.url.toLowerCase().includes(normalized) ||
        e.title.toLowerCase().includes(normalized),
    )
    .slice(0, limit);
}

export function clearAll(): void {
  state = { entries: [] };
  save();
  emit();
}

export function flushPersist(): Promise<void> {
  return persistence.flush();
}
