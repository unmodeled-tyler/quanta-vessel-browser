import type {
  ActionSource,
  AgentActionEntry,
  AgentRuntimeState,
  AgentTranscriptEntry,
} from "../../../shared/types";

export const AGENT_ACTIVITY_WINDOW_MS = 6000;

function isAgentActionSource(source: ActionSource): boolean {
  return source === "ai" || source === "mcp";
}

function isAgentTranscriptActive(
  entry: AgentTranscriptEntry,
  currentTime: number,
): boolean {
  if (!isAgentActionSource(entry.source)) return false;

  if (entry.status === "streaming") {
    const updatedAt = new Date(entry.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) return true;
    return currentTime - updatedAt < AGENT_ACTIVITY_WINDOW_MS;
  }

  const updatedAt = new Date(entry.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) return false;

  return currentTime - updatedAt < AGENT_ACTIVITY_WINDOW_MS;
}

function summarizeTranscriptText(entry: AgentTranscriptEntry): string {
  const raw = `${entry.title ? `${entry.title}: ` : ""}${entry.text}`.trim();
  const singleLine = raw.replace(/\s+/g, " ").trim();
  return singleLine.length > 96
    ? `${singleLine.slice(0, 93).trimEnd()}...`
    : singleLine;
}

function summarizeActionText(action: AgentActionEntry): string {
  const name = action.name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  if (action.status === "running") {
    return `${name} in progress`;
  }
  if (action.status === "waiting-approval") {
    return `${name} waiting for approval`;
  }
  if (action.status === "completed" && action.resultSummary) {
    const singleLine = action.resultSummary.replace(/\s+/g, " ").trim();
    return singleLine.length > 96
      ? `${singleLine.slice(0, 93).trimEnd()}...`
      : singleLine;
  }
  if (action.status === "failed" && action.error) {
    const singleLine = action.error.replace(/\s+/g, " ").trim();
    return `${name} failed: ${singleLine.length > 72 ? `${singleLine.slice(0, 69).trimEnd()}...` : singleLine}`;
  }
  return name;
}

function isAgentActionActive(
  action: AgentActionEntry,
  currentTime: number,
): boolean {
  if (!isAgentActionSource(action.source)) return false;

  if (action.status === "running" || action.status === "waiting-approval") {
    return true;
  }

  if (action.status !== "completed" || !action.finishedAt) {
    return false;
  }

  const finishedAt = new Date(action.finishedAt).getTime();
  if (Number.isNaN(finishedAt)) return false;

  return currentTime - finishedAt < AGENT_ACTIVITY_WINDOW_MS;
}

export function hasRecentAgentActivity(
  state: AgentRuntimeState,
  currentTime = Date.now(),
): boolean {
  return (
    state.actions.some((action) => isAgentActionActive(action, currentTime)) ||
    state.transcript.some((entry) => isAgentTranscriptActive(entry, currentTime))
  );
}

export function getAgentActiveTabIds(
  state: AgentRuntimeState,
  currentTime = Date.now(),
): Set<string> {
  const activeTabIds = new Set<string>();

  for (const action of state.actions) {
    if (!action.tabId || !isAgentActionActive(action, currentTime)) {
      continue;
    }

    activeTabIds.add(action.tabId);
  }

  return activeTabIds;
}

export function getLatestAgentStatusMessage(
  state: AgentRuntimeState,
  currentTime = Date.now(),
): string | null {
  const recentTranscript = [...state.transcript]
    .filter((entry) => isAgentTranscriptActive(entry, currentTime))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )[0];

  if (recentTranscript) {
    const summary = summarizeTranscriptText(recentTranscript);
    if (summary) return summary;
  }

  const recentAction = [...state.actions]
    .filter((action) => isAgentActionActive(action, currentTime))
    .sort((left, right) => {
      const leftTime = new Date(
        left.finishedAt || left.startedAt,
      ).getTime();
      const rightTime = new Date(
        right.finishedAt || right.startedAt,
      ).getTime();
      return rightTime - leftTime;
    })[0];

  return recentAction ? summarizeActionText(recentAction) : null;
}
