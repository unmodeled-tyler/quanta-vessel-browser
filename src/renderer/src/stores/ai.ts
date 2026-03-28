import { createSignal } from "solid-js";
import type { AIMessage } from "../../../shared/types";

const MAX_RECENT_QUERIES = 5;
const MAX_MESSAGE_HISTORY = 200;
const MAX_PENDING_QUERIES = 5;
const [messages, setMessages] = createSignal<AIMessage[]>([]);
const [streamingText, setStreamingText] = createSignal("");
const [isStreaming, setIsStreaming] = createSignal(false);
const [hasFirstChunk, setHasFirstChunk] = createSignal(false);
const [streamStartedAt, setStreamStartedAt] = createSignal<number | null>(null);
const [recentQueries, setRecentQueries] = createSignal<string[]>([]);
const [pendingQueries, setPendingQueries] = createSignal<string[]>([]);
const [queueNotice, setQueueNotice] = createSignal<string | null>(null);

let initialized = false;

function trimMessages(next: AIMessage[]): AIMessage[] {
  return next.length > MAX_MESSAGE_HISTORY ? next.slice(-MAX_MESSAGE_HISTORY) : next;
}

function recordRecentQuery(prompt: string): void {
  setRecentQueries((prev) => {
    const filtered = prev.filter((q) => q !== prompt);
    return [prompt, ...filtered].slice(0, MAX_RECENT_QUERIES);
  });
}

function buildHistory(): AIMessage[] {
  return messages().map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function enqueuePrompt(prompt: string, atFront = false): "queued" | "rejected" {
  const current = pendingQueries();
  if (current.length >= MAX_PENDING_QUERIES) {
    setQueueNotice(`Queue full. Finish or cancel the current run before adding more than ${MAX_PENDING_QUERIES} pending prompts.`);
    return "rejected";
  }

  const next = atFront ? [prompt, ...current] : [...current, prompt];
  setPendingQueries(next);
  setQueueNotice(
    `Queued ${next.length}/${MAX_PENDING_QUERIES}. I’ll send it automatically when the current run finishes.`,
  );
  return "queued";
}

async function dispatchQuery(prompt: string): Promise<boolean> {
  const result = await window.vessel.ai.query(prompt, buildHistory());
  return result.accepted;
}

async function dispatchQueuedPrompt(prompt: string): Promise<void> {
  const accepted = await dispatchQuery(prompt);
  if (!accepted) {
    enqueuePrompt(prompt, true);
  }
}

function init() {
  if (initialized) return;
  initialized = true;
  window.vessel.ai.onStreamStart((prompt: string) => {
    setMessages((prev) => {
      const next = [...prev, { role: "user" as const, content: prompt }];
      return trimMessages(next);
    });
    setStreamingText("");
    setIsStreaming(true);
    setHasFirstChunk(false);
    setStreamStartedAt(Date.now());
  });
  window.vessel.ai.onStreamChunk((chunk: string) => {
    if (!hasFirstChunk()) {
      setHasFirstChunk(true);
    }
    setStreamingText((prev) => prev + chunk);
  });
  window.vessel.ai.onStreamEnd(() => {
    const finalText = streamingText();
    if (finalText) {
      setMessages((prev) => {
        const next = [...prev, { role: "assistant" as const, content: finalText }];
        return trimMessages(next);
      });
    }
    setStreamingText("");
    setIsStreaming(false);
    setHasFirstChunk(false);
    setStreamStartedAt(null);

    const queued = pendingQueries();
    if (queued.length === 0) {
      setQueueNotice(null);
      return;
    }

    const [nextPrompt, ...rest] = queued;
    setPendingQueries(rest);
    setQueueNotice(
      rest.length > 0 ? `${rest.length} queued ${rest.length === 1 ? "prompt" : "prompts"} remaining.` : null,
    );
    queueMicrotask(() => {
      void dispatchQueuedPrompt(nextPrompt);
    });
  });
}

export function useAI() {
  init();
  return {
    messages,
    streamingText,
    isStreaming,
    hasFirstChunk,
    streamStartedAt,
    recentQueries,
    pendingQueryCount: () => pendingQueries().length,
    pendingQueryLimit: MAX_PENDING_QUERIES,
    queueNotice,
    query: async (prompt: string) => {
      recordRecentQuery(prompt);

      if (isStreaming()) {
        return enqueuePrompt(prompt);
      }

      setQueueNotice(null);
      const accepted = await dispatchQuery(prompt);
      if (!accepted) {
        return enqueuePrompt(prompt, true);
      }
      return "started" as const;
    },
    cancel: () => window.vessel.ai.cancel(),
    clearHistory: () => {
      setMessages([]);
      setPendingQueries([]);
      setQueueNotice(null);
    },
  };
}
