import { createMemo, createSignal, For, Show, Switch, Match, type Component } from "solid-js";
import { useResearch } from "../../stores/research";
import { useAI } from "../../stores/ai";

export const ResearchDesk: Component = () => {
  const research = useResearch();
  const ai = useAI();
  const state = research.state;
  const [draftQuery, setDraftQuery] = createSignal("");
  const [briefReply, setBriefReply] = createSignal("");
  const [startError, setStartError] = createSignal<string | null>(null);
  const [isStarting, setIsStarting] = createSignal(false);
  const [researchMessageStart, setResearchMessageStart] = createSignal(0);
  const researchMessages = createMemo(() =>
    ai.messages()
      .slice(researchMessageStart())
      .filter(
        (message) =>
          !message.content.startsWith("Research topic:") &&
          !message.content.startsWith("The Research Desk brief is confirmed."),
      ),
  );

  async function handleStartResearch(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const query = draftQuery().trim();

    if (!query) {
      setStartError("Add a research question first.");
      return;
    }

    setStartError(null);
    setIsStarting(true);
    try {
      const result = await research.startBrief(query);
      if (!result.accepted) {
        setStartError(
          result.reason === "busy"
            ? "Research Desk already has a brief in progress."
            : "Could not start research. Please try again.",
        );
        return;
      }

      setResearchMessageStart(ai.messages().length);
      await ai.query(
        `Research topic: ${query}\n\nStart the Research Desk briefing inside this Research tab. Ask one focused question to clarify scope before planning.`,
      );
    } finally {
      setIsStarting(false);
    }
  }

  async function handleBriefReply(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const reply = briefReply().trim();
    if (!reply || ai.isStreaming()) return;
    setBriefReply("");
    await ai.query(reply);
  }

  async function handleConfirmBrief(): Promise<void> {
    const result = await research.confirmBrief();
    if (!result.accepted && result.reason === "premium") {
      void window.vessel.premium.checkout();
      return;
    }
    await ai.query(
      "The Research Desk brief is confirmed. Produce the Research Objectives JSON now.",
    );
  }

  return (
    <div class="research-desk">
      <Switch>
        <Match when={state().phase === "idle"}>
          <div class="research-idle">
            <div class="research-hero-card">
              <div class="research-kicker">Research Desk</div>
              <h3>Turn a question into a sourced brief.</h3>
              <p class="research-hero-copy">
                Vessel interviews you to sharpen the scope, then sends parallel
                agents to investigate each angle. The final report comes back
                with citations, contradictions, gaps, and an export-ready source
                index.
              </p>

              <div class="research-feature-grid" aria-label="Research Desk workflow">
                <div class="research-feature-pill">
                  <span>01</span>
                  Briefing questions
                </div>
                <div class="research-feature-pill">
                  <span>02</span>
                  Parallel sub-agents
                </div>
                <div class="research-feature-pill">
                  <span>03</span>
                  Source-anchored report
                </div>
              </div>

              <Show when={!research.isPremium()}>
                <div class="research-premium-notice">
                  <span class="premium-badge">Premium</span>
                  <span>Briefing is free. Full research and export require Vessel Premium.</span>
                </div>
              </Show>

              <form class="research-start-form" onSubmit={handleStartResearch}>
                <label class="research-query-label" for="research-query-input">
                  What are we researching?
                </label>
                <textarea
                  id="research-query-input"
                  class="research-query-input"
                  value={draftQuery()}
                  rows={3}
                  placeholder="e.g. Compare local-first browser automation frameworks for agent workflows"
                  onInput={(event) => {
                    setDraftQuery(event.currentTarget.value);
                    if (startError()) setStartError(null);
                  }}
                />
                <Show when={startError()}>
                  {(message) => <p class="research-start-error">{message()}</p>}
                </Show>
                <button
                  class="research-start-btn"
                  type="submit"
                  disabled={isStarting()}
                >
                  <span class="research-start-btn-main">
                    {isStarting() ? "Starting Research…" : "Start Research"}
                  </span>
                  <span class="research-start-btn-sub">
                    {isStarting()
                      ? "Opening the briefing workspace"
                      : "Build a scoped research brief"}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </Match>

        <Match when={state().phase === "briefing"}>
          <div class="research-phase research-briefing-panel">
            <div>
              <h3>Briefing</h3>
              <p>
                Keep the whole setup here. Answer the captain's questions, then
                confirm when the scope feels right.
              </p>
            </div>

            <div class="research-brief-summary">
              <span>Original topic</span>
              <p>{state().originalQuery}</p>
            </div>

            <div class="research-chat-window" aria-live="polite">
              <For each={researchMessages()}>
                {(message) => (
                  <div class={`research-chat-message ${message.role}`}>
                    <span>{message.role === "user" ? "You" : "Research Captain"}</span>
                    <p>{message.content}</p>
                  </div>
                )}
              </For>
              <Show when={ai.isStreaming() || ai.streamingText()}>
                <div class="research-chat-message assistant streaming">
                  <span>Research Captain</span>
                  <p>{ai.streamingText() || "Thinking…"}</p>
                </div>
              </Show>
            </div>

            <form class="research-brief-reply" onSubmit={handleBriefReply}>
              <textarea
                value={briefReply()}
                rows={3}
                placeholder="Reply with constraints, preferred sources, audience, or what a good answer should include…"
                onInput={(event) => setBriefReply(event.currentTarget.value)}
              />
              <div class="phase-controls">
                <button type="submit" disabled={ai.isStreaming() || !briefReply().trim()}>
                  Send Reply
                </button>
                <button
                  type="button"
                  class="research-confirm-btn"
                  disabled={ai.isStreaming()}
                  onClick={handleConfirmBrief}
                >
                  Confirm Brief
                </button>
                <button type="button" class="secondary" onClick={() => research.cancel()}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </Match>

        <Match when={state().phase === "planning"}>
          <div class="research-phase research-briefing-panel">
            <h3>Planning Research</h3>
            <p>Creating Research Objectives based on your brief...</p>
            <div class="research-chat-window" aria-live="polite">
              <For each={researchMessages()}>
                {(message) => (
                  <div class={`research-chat-message ${message.role}`}>
                    <span>{message.role === "user" ? "You" : "Research Captain"}</span>
                    <p>{message.content}</p>
                  </div>
                )}
              </For>
              <Show when={ai.isStreaming() || ai.streamingText()}>
                <div class="research-chat-message assistant streaming">
                  <span>Research Captain</span>
                  <p>{ai.streamingText() || "Drafting objectives…"}</p>
                </div>
              </Show>
            </div>
          </div>
        </Match>

        <Match when={state().phase === "awaiting_approval"}>
          <div class="research-phase">
            <h3>Research Objectives</h3>
            <Show when={state().objectives}>
              {(obj) => (
                <div class="objectives-card">
                  <p><strong>Question:</strong> {obj().researchQuestion}</p>
                  <p><strong>Threads:</strong> {obj().threads.length}</p>
                  <ul>
                    {obj().threads.map((t) => (
                      <li>{t.label} ({t.sourceBudget} sources)</li>
                    ))}
                  </ul>

                  <label class="mode-toggle">
                    <input
                      type="checkbox"
                      checked={state().supervisionMode === "walk-away"}
                      onChange={(e) =>
                        research.setMode(
                          e.currentTarget.checked ? "walk-away" : "interactive",
                        )
                      }
                    />
                    Walk-away mode (notified when done)
                  </label>

                  <label class="traces-toggle">
                    <input
                      type="checkbox"
                      checked={state().includeTraces}
                      onChange={(e) =>
                        research.setTraces(e.currentTarget.checked)
                      }
                    />
                    Include agent traces with report
                  </label>

                  <div class="phase-controls">
                    <button
                      class="research-confirm-btn"
                      onClick={() =>
                        research.approveObjectives({
                          supervisionMode: state().supervisionMode,
                          includeTraces: state().includeTraces,
                        })
                      }
                    >
                      Launch Research Agents
                    </button>
                    <button class="secondary" onClick={() => research.cancel()}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Match>

        <Match when={state().phase === "executing"}>
          <div class="research-phase">
            <h3>Researching</h3>
            <Show when={state().threadFindings.length > 0}>
              <p>{state().threadFindings.length} of {state().threads.length} threads complete</p>
            </Show>
            <Show when={state().supervisionMode === "interactive"}>
              <button onClick={() => research.setMode("walk-away")}>
                Switch to Walk-Away
              </button>
            </Show>
            <Show when={state().supervisionMode === "walk-away"}>
              <button onClick={() => research.setMode("interactive")}>
                Switch to Interactive
              </button>
            </Show>
          </div>
        </Match>

        <Match when={state().phase === "synthesizing"}>
          <div class="research-phase">
            <h3>Synthesizing Report</h3>
            <p>Compiling findings into the Research Report...</p>
          </div>
        </Match>

        <Match when={state().phase === "delivered"}>
          <div class="research-phase">
            <h3>Report Ready</h3>
            <Show when={state().report}>
              {(report) => (
                <div class="report-card">
                  <h4>{report().title}</h4>
                  <p>{report().executiveSummary.slice(0, 300)}...</p>
                  <p>{report().sourceIndex.length} sources cited</p>
                  <button onClick={() => research.exportReport()}>
                    Export as Markdown
                  </button>
                  <button class="secondary" onClick={() => research.cancel()}>
                    New Research
                  </button>
                </div>
              )}
            </Show>
          </div>
        </Match>
      </Switch>
    </div>
  );
};
