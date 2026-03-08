# Vessel Agent-First Roadmap

This roadmap is specific to the current Vessel codebase. It focuses on turning Vessel from "a browser with agent controls" into a reliable runtime for long-lived web agents with human supervision.

## Product Goal

Vessel should be the browser that persistent agent harnesses use as their web runtime.

That means Vessel must provide:

- reliable browser actions on messy modern websites
- durable browser and task state across sessions
- clear human supervision and intervention controls
- harness-native integration over MCP
- replayable execution history for trust, debugging, and recovery

## Current Baseline

As of this roadmap:

- the app has an `AgentRuntime` with session restore, checkpoints, approvals, and action history
- built-in agent flows can act through typed tools in `src/main/ai/*`
- external harnesses can drive the browser through `src/main/mcp/server.ts`
- the sidebar already exposes supervisor controls for pause, approval, checkpointing, and restore

This is a good foundation, but the next work is about reliability and control depth.

## Phase 1: Interaction Reliability

Goal: make agents succeed more often on real web apps.

Implementation targets:

- enrich `InteractiveElement` metadata in `src/preload/content-script.ts`
- expose visibility, disabled state, descriptions, current values, and select options
- add missing primitives in `src/main/ai/page-actions.ts`
- keep MCP feature parity in `src/main/mcp/server.ts`

Milestones:

1. richer page grounding for interactive elements
2. `select_option`, `submit_form`, and `press_key`
3. stronger wait semantics for state changes and element readiness
4. clearer failure messages when elements are hidden, disabled, or stale

Definition of done:

- agents can fill and submit common forms without brittle selector guessing
- the structured page context makes it obvious which controls are usable
- both built-in agents and MCP clients can use the same improved action set

## Phase 2: Task Memory And Recovery

Goal: preserve intent, not just tabs.

Implementation targets:

- extend `AgentRuntime` in `src/main/agent/runtime.ts`
- persist active task metadata, goals, blockers, extracted facts, and next step
- let the human annotate checkpoints and resume from explicit recovery states

Milestones:

1. task record attached to the runtime
2. next-step / blocker / notes fields
3. resume-from-checkpoint with task context restoration
4. task-aware sidebar views

Definition of done:

- after restart or interruption, the agent and human both know what the browser was doing and why

## Phase 3: Policy And Supervision

Goal: give humans meaningful control without micromanaging.

Implementation targets:

- add policy rules around domains, actions, downloads, and tab creation
- distinguish low-risk and high-risk actions in runtime policy checks
- expand the sidebar into a true supervisor console

Milestones:

1. allowed / denied domain lists
2. approval rules by action class
3. protected sites and protected URL patterns
4. steering controls such as "do not leave this site" and "never submit without approval"

Definition of done:

- the human can express operational boundaries once and trust Vessel to enforce them

## Phase 4: Multi-Tab Agent Semantics

Goal: make tab management reflect actual agent workflows.

Implementation targets:

- extend `TabManager` in `src/main/tabs/tab-manager.ts`
- add tab roles such as `primary`, `research`, `auth`, `scratch`, and `result`
- support agent annotations and tab grouping

Milestones:

1. tab roles in shared state
2. role-aware switching and listing
3. better recovery from closed or replaced tabs
4. supervisor UI for tab role inspection

Definition of done:

- the agent stops treating every tab as interchangeable

## Phase 5: Replay And Audit

Goal: make behavior legible and debuggable.

Implementation targets:

- deepen action logging in `src/main/agent/runtime.ts`
- attach before/after URL, checkpoint references, and event context
- expose an audit/replay timeline in the renderer

Milestones:

1. structured action history with causal context
2. replay-friendly snapshots and links to checkpoints
3. timeline UI for humans
4. exportable execution logs for harness debugging

Definition of done:

- a failed run can be diagnosed without reproducing it blind

## Phase 6: Harness-Native APIs

Goal: make Vessel feel purpose-built for Hermes Agent, OpenClaw, and similar systems.

Implementation targets:

- extend `src/main/mcp/server.ts` beyond browser actions
- expose task lifecycle, supervisor state, checkpoints, and policy state as first-class MCP tools

Milestones:

1. task start / update / finish MCP tools
2. supervisor status inspection
3. checkpoint listing and annotation
4. policy introspection for remote harnesses

Definition of done:

- external agents can reason about Vessel as an agent runtime, not just as a click/type proxy

## Immediate Build Order

The recommended order from here is:

1. finish Phase 1 interaction reliability
2. add task memory in Phase 2
3. add policy rules in Phase 3
4. improve multi-tab semantics in Phase 4
5. add replay and harness-native runtime APIs in Phases 5 and 6

## What To Measure

Each phase should be evaluated against repeatable browser tasks.

Suggested scenarios:

- sign in to a site and survive redirects
- complete a form with selects, textareas, and submit buttons
- recover after page mutation or modal interruption
- resume after app restart
- switch between research and working tabs without losing task state
- continue after explicit human pause / approve / reject actions

If Vessel does not improve on these concrete scenarios, the product is not actually getting more agent-native.
