# Codex State Chain Design

## Context

AgentOffice models terminal coding agents as workers on an office floor. The current state model exposes four user-facing states:

- `idle`
- `working`
- `approval`
- `attention`

In practice, the Codex integration currently loses `approval` and `attention` in some common cases. The Game UI also does not consistently render the state the backend already knows.

The immediate goal of this design is to make the Codex state chain reliable from runtime output to shared session contract to Game UI worker behavior. Claude support should be able to reuse the same model later without reworking the contract.

## Problem Summary

### 1. Codex lifecycle data is incomplete

`packages/cli/src/core/providers/codex-transcript.js` reads Codex transcript files and currently derives:

- `task_started` -> `working`
- `task_complete` -> `idle`
- `turn_aborted` -> `idle`

This transcript data is useful, but it does not consistently expose approval-required or network-error conditions.

### 2. Runtime fallback is disabled too aggressively

`packages/cli/src/runtime/pty-manager.js` uses provider output classification as a fallback for raw terminal text. That path is the only current source for many Codex `approval` and `attention` cases.

Once a Codex transcript file is linked, the runtime stops relying on that fallback to avoid flicker. This prevents valid `approval` and `attention` states from surfacing.

### 3. UI consumes the wrong authority

The public contract already exposes both `state` and `displayState`. However, the Godot office scene in `apps/game-frontend/srcipt/main.gd` currently prefers `state` over `displayState` when applying worker snapshots.

That means UI behavior can drift from the backend's best available presentation state.

### 4. Attention is not fully modeled in the Game UI

The Game UI has explicit handling for approval presentation, but attention does not have the same end-to-end treatment. Even when the backend can infer attention, the worker can still fail to show the right indicator or zone behavior.

## Goals

- Make Codex `approval` and `attention` visible in the shared session contract.
- Preserve stable lifecycle tracking for `working` and `idle`.
- Make the Game UI consume the same presentation state that the app and backend expose.
- Prevent transcript updates from incorrectly erasing short-lived approval or attention conditions.
- Keep the design compatible with a future Claude implementation.

## Non-Goals

- Full Claude parity in this iteration.
- A full runtime event bus redesign for every provider.
- UI art or animation polish beyond what is required to correctly represent the state.
- Terminal latency optimization and account settings work. Those are tracked as follow-up efforts.

## Design Overview

The design separates two concerns:

1. Lifecycle state: stable execution progress such as `idle` and `working`
2. Presentation state: what the user should currently see, including `approval` and `attention`

The core rule is:

- `state` remains the durable lifecycle state
- `displayState` becomes the UI authority
- `displayZone` is derived from `displayState`

For Codex, lifecycle continues to come from transcript reconciliation. Presentation overlays come from runtime output classification and provider-level hints. The store merges these into a single session view that can be consumed consistently by React and Godot.

## Detailed Design

### A. State Contract

The session contract remains structurally compatible, but semantics are tightened:

- `state`
  - Represents the stable lifecycle state
  - Expected primary values: `idle`, `working`
- `displayState`
  - Represents the user-visible state
  - May be `approval` or `attention` even when lifecycle remains `working`
- `displayZone`
  - Derived directly from `displayState`
  - Must not be guessed independently by UI clients

Recommended precedence:

1. `attention`
2. `approval`
3. lifecycle-derived state such as `working`
4. `idle`

This lets blocking and error conditions temporarily override the more general lifecycle state.

### B. Codex Provider Merge Model

Codex state comes from two sources:

- Transcript source
  - Good at stable lifecycle transitions
  - Poor at approval and network/transport failures
- Runtime output source
  - Good at spotting blocking prompts and surfaced failures
  - Can be noisy if treated as the only authority

The provider should merge the two rather than replacing one with the other.

Recommended behavior:

- Transcript reconciliation updates lifecycle state and lifecycle metadata.
- Output classification updates presentation overlays and optional reason metadata.
- Overlay states expire or clear when new evidence shows the session has resumed normal execution.

Recommended metadata additions for debugging:

- `meta.stateSource`
- `meta.overlayState`
- `meta.overlayUpdatedAt`
- `meta.attentionReason`
- `meta.approvalHint`

This metadata is not required for UI rendering, but it makes backend verification practical.

### C. Runtime Classification Rules

The runtime should keep classifying terminal output after transcript linking, but with stricter merge rules.

Recommended classification buckets:

- Approval indicators
  - `approval`
  - `press enter`
  - `confirm`
  - provider-specific approve prompts
- Attention indicators
  - `network error`
  - `connection timeout`
  - `timed out`
  - `failed`
  - `error`
  - provider-specific transport failures

To avoid old behavior returning:

- Classification must not directly overwrite lifecycle state.
- Classification updates `displayState` or overlay state instead.
- Transcript updates should only clear an overlay when there is evidence of recovery or a newer conflicting lifecycle event.

Optional hardening for later:

- attach a short TTL to text-derived overlays
- distinguish between soft attention and fatal exit
- persist the latest overlay reason in the event log

### D. Store and Public Contract Consumption

`packages/cli/src/core/session-contract.js` already exposes `state`, `displayState`, and `displayZone`. This is the right shape and should be preserved.

The backend store logic should ensure:

- `displayState` is always populated
- `displayZone` is always consistent with `displayState`
- summary and full-session payloads expose the same semantics

No client should have to infer display state from lifecycle state.

### E. Game UI Consumption

The Godot office scene should change its read order to:

1. `displayState`
2. `state`
3. `status`
4. fallback `idle`

Worker movement and indicators should follow `displayState`, not lifecycle state.

Required UI behavior:

- `approval`
  - worker moves to the approval area
  - worker shows an approval bubble/indicator
- `attention`
  - worker moves to the attention area
  - worker shows a distinct attention indicator
- `working`
  - worker occupies or moves toward the work seat
- `idle`
  - worker moves to the idle area

This keeps the visual office consistent with the backend contract and with the React app.

### F. Validation Strategy

The first validation pass should focus on backend and state propagation, not manual UI playtesting.

Required checks:

- Codex transcript event `task_started` still leads to lifecycle `working`
- Codex transcript event `task_complete` still leads to lifecycle `idle`
- an approval prompt leads to `displayState=approval`
- a timeout or network failure prompt leads to `displayState=attention`
- the public session summary exposes the same `displayState` the Game UI receives
- Godot snapshot parsing prefers `displayState`

Useful test coverage:

- provider unit tests for transcript plus overlay merging
- state contract tests for summary serialization
- focused Game UI parsing tests if a local harness exists

## Alternatives Considered

### Alternative 1: Keep transcript as the only source

Rejected because current Codex transcript data does not reliably expose approval and attention cases.

### Alternative 2: Use raw terminal text as the only source

Rejected because it is too noisy and would regress stable lifecycle handling.

### Alternative 3: Rebuild the provider runtime around structured events first

Deferred. This is the cleanest long-term direction, but it is too large for the first repair and would delay a fix for the current broken user-visible behavior.

## Risks

- Text classification can still produce false positives if patterns are too broad.
- Overlay clearing rules can cause sticky or flickering states if they are not explicit.
- Claude may surface different prompt wording, so shared abstractions should be generic but initial heuristics may remain provider-specific.
- The Game UI scene may need small asset or node updates if no distinct attention indicator exists yet.

## Rollout Plan

Phase 1:

- tighten the state contract semantics
- implement Codex lifecycle plus overlay merge behavior
- restore post-transcript runtime classification under controlled precedence
- update Game UI to consume `displayState`

Phase 2:

- add Claude-specific overlay detection using the same contract
- improve provider-specific reason metadata

Phase 3:

- consider a structured runtime event model to reduce dependence on text heuristics

## Follow-Up Work Outside This Spec

- Terminal latency analysis and transport optimization
- Change-password backend API and frontend flow
- Better worker indicator art and richer office reactions
