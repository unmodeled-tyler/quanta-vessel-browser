import { createSignal } from "solid-js";
import type { HistoryState, HistoryEntry } from "../../../shared/types";

const INITIAL: HistoryState = { entries: [] };

const [historyState, setHistoryState] = createSignal<HistoryState>(INITIAL);

let initialized = false;

async function init() {
  if (initialized) return;
  try {
    const state = await window.vessel.history.get();
    setHistoryState(state);
    window.vessel.history.onUpdate((s) => setHistoryState(s));
    initialized = true;
  } catch (error) {
    console.error("Failed to initialize history store", error);
  }
}

export function useHistory() {
  void init();
  return {
    historyState,
    search: (query: string): Promise<HistoryEntry[]> =>
      window.vessel.history.search(query),
    clear: () => window.vessel.history.clear(),
  };
}
