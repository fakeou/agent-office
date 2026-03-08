# AgentTown Project Notes

## Background

AgentTown is a local-first supervisor UI for terminal coding agents. The product narrative is a workshop floor:

- workers represent live AI sessions
- the workshop shows only four states: `idle`, `working`, `approval`, `attention`
- clicking a worker opens a full terminal handoff view
- provider adapters determine how session state is sourced

The current first-stage product goal is intentionally narrow:

- one machine runs the AgentTown daemon locally
- the daemon is reachable from the same LAN
- local tmux sessions remain the real terminal source of truth
- web clients and future apps attach to that local daemon instead of a cloud relay

The system is intentionally provider-based. Claude gets a structured adapter via official hooks, Codex gets a structured adapter via local session JSONL, and managed terminal ownership can now be routed either through backend-owned PTY or shared tmux sessions depending on the operator experience you want.

## Scope

Current scope:

- Node.js runtime
- pnpm-managed dependency workflow
- `agenttown start` local daemon workflow
- `agenttown restart` daemon restart and recovery workflow
- `agenttown codex` / `agenttown claude` operator commands
- `agenttown cleanup` tmux worker cleanup command
- provider adapters for Claude, Codex, and Generic
- managed PTY sessions via node-pty plus shared tmux sessions for local-first terminal ownership
- workshop UI and full-screen terminal view
- Claude hooks ingestion
- Codex session-log reconciliation plus generic fallback state handling

Out of scope for this phase:

- database persistence
- team collaboration or auth
- SSH relay / multi-machine orchestration
- desktop packaging
- provider-specific protocols beyond Claude hooks and Codex session logs

## Architecture

### Current Module Layout

- `server.js`
  CLI entrypoint for `start`, `codex`, `claude`, `serve`, `run`, `claude-hook`, and `print-claude-hooks`, plus startup repair for `node-pty` spawn-helper permissions on macOS and local `tmux attach` support for tmux-backed sessions.
- `src/server.js`
  Express app, REST API, static serving, and WebSocket upgrade handling.
- `src/runtime/pty-manager.js`
  Managed PTY lifecycle, tmux-backed session lifecycle, terminal WebSocket binding, shared-session attach flow, and launch registration only after transport startup succeeds.
- `src/runtime/ensure-node-pty.js`
  Repairs `node-pty` spawn-helper execute permissions when package extraction leaves the helper non-executable on macOS.
- `src/runtime/cli-helpers.js`
  CLI preflight checks, LAN URL discovery, command resolution, and Claude hook installation helpers.
- `src/runtime/session-registry.js`
  Local file registry for tmux-backed worker metadata so the daemon can restore sessions after restart.
- `src/runtime/tmux.js`
  tmux session creation, pane inspection, attach-client spawning, and local attach command generation.
- `src/store/session-store.js`
  In-memory session registry, logs, event history, and update emitter.
- `src/providers/base.js`
  Base provider contract.
- `src/providers/claude.js`
  Claude hook event mapping and hook config generation.
- `src/providers/codex.js`
  Codex provider that links managed PTY sessions to local Codex lifecycle records.
- `src/providers/codex-transcript.js`
  Codex session-log discovery and JSONL lifecycle summarization.
- `src/providers/generic.js`
  Generic CLI fallback classification.
- `src/providers/index.js`
  Provider registry and adapter lookup.
- `src/state.js`
  Shared display-state constants and workshop zone mapping.
- `static/index.html`
  Plain HTML shell with `@xterm/xterm` CDN loading.
- `static/app.js`
  Workshop view, hash routing, WebSocket clients, and terminal view.
- `static/styles.css`
  Workshop and terminal styling.

### Transport Model

The Python prototype used HTTP polling for command handoff. The Node.js architecture replaces that with two WebSocket layers and two managed terminal transports:

1. `/ws/events`
   Global session updates for the workshop view.
2. `/ws/terminal/:sessionId`
   One terminal stream per managed session. In PTY mode the backend owns the process directly. In tmux mode each browser tab attaches as its own tmux client to the same underlying local-first terminal session.

Primary operator flow for the first phase:

1. `agenttown start`
   Starts the local daemon, binds to the LAN by default, checks `tmux` and local AI CLIs, and optionally installs Claude hooks.
   On boot it restores any still-running AgentTown tmux workers recorded in the local registry.
2. The workshop homepage exposes `Launch Claude` and `Launch Codex` buttons.
   Those one-click actions create tmux-backed workers with default commands from the local daemon.
3. `agenttown codex` or `agenttown claude`
   Still create a tmux-backed worker session and attach the current local terminal when you want local-first launch.
4. Web clients on the same LAN open the workshop and attach to the same worker session on demand.
5. The local machine can later recover that tmux session with `agenttown attach <sessionId>` and continue operating it in a native terminal.
6. `agenttown cleanup`
   Removes only AgentTown-managed tmux sessions that use the `agenttown_` session-name prefix.

REST remains in place for low-frequency operations:

- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/launch`
- `POST /api/providers/claude/hook`

## State Model

AgentTown now standardizes the user-facing state model to four states only:

- `idle`
- `working`
- `approval`
- `attention`

The workshop maps those states to four zones:

- `working` -> Workshop Floor
- `approval` -> Approval Desk
- `attention` -> Attention Desk
- `idle` -> Idle

This is a deliberate simplification so users do not need to distinguish planning vs reading vs coding vs shell execution in the UI.

### Frontend Contract

The frontend does not implement provider-specific state machines.

It only consumes the normalized session fields below:

- `provider`
- `status`
- `displayState`
- `displayZone`

For the workshop UI, `displayState` must always be one of:

- `idle`
- `working`
- `approval`
- `attention`

This means provider adapters are free to use different internal signals, but they must collapse into the same four user-facing states before data reaches the browser.

Practical interpretation by provider:

- `claude`: official hooks drive the state machine, with local transcript reconciliation only when hooks omit the final recovery transition
- `codex`: local structured session JSONL drives the state machine, with targeted text fallback only for prompts such as approval or error
- `generic` and future providers: provider-local runtime events when available, otherwise isolated text compatibility inside that adapter

The design goal is: source-specific logic in the backend, one simple mental model in the frontend.

## Provider Strategy

### Claude

Claude uses official hooks as the primary state source.

Mapping highlights:

- `SessionStart` -> `idle`
- `UserPromptSubmit` -> `working`
- `PreToolUse` / `SubagentStart` -> `working`
- `PostToolUse` / `SubagentStop` -> event-only, no forced state transition
- `PermissionRequest` -> `approval`
- resolved permission requests leave `approval` on the next structured hook when Claude emits one
- `Notification(permission_prompt | elicitation_dialog)` -> `approval`
- `Notification(idle_prompt)` -> `idle`
- other `Notification` events -> event-only, no forced state transition
- `PostToolUseFailure` -> `attention` or `idle` when interrupted
- `TaskCompleted` -> `idle`
- `SessionEnd` -> hidden from the workshop

Claude terminal output is not used to infer state. Hook-only Claude sessions are marked with `transport=hook` so they are not confused with tmux-backed Claude terminal sessions. When a permission request is approved, the next `PostToolUse` moves the worker back to `working`. When a permission request is denied but Claude does not emit a final deny hook, AgentTown reconciles Claude's local transcript, detects the rejected tool-use record, and returns the worker to `idle`. The same transcript recovery path also restores `idle` after user interrupts that do not produce a follow-up hook.

### Codex

Codex does not expose a Claude-style hook surface here, so AgentTown treats the local Codex session JSONL as the primary structured lifecycle source for managed Codex sessions.

Current strategy:

- managed launch through AgentTown with tmux as the default transport
- managed Codex sessions start in `idle` until Codex records a structured lifecycle event
- the local terminal can attach to the same tmux session as the web terminal
- managed session linked to a matching file under `~/.codex/sessions`
- `task_started` -> `working`
- `task_complete` -> `idle`
- `turn_aborted` -> `idle`
- provider-specific terminal text parsing only as a last-resort fallback for `approval` and `attention`

### Other Providers

Other terminal coding agents can be supported through additional adapters.

Expected fallback path when no official protocol exists:

- managed PTY launch
- provider-specific runtime events where available
- targeted text compatibility only inside that provider adapter

This keeps brittle parsing isolated instead of leaking into the entire state system.

## Implementation Status

### Runtime and Transport

Managed tmux launches now `exec` the target agent command inside the pane so worker sessions terminate with the provider process instead of dropping back to a spare shell.


- [x] Replace Python runtime with Node.js
- [x] Add Express server and REST API
- [x] Add global workshop WebSocket
- [x] Add per-session terminal WebSocket
- [x] Add node-pty managed sessions
- [x] Add tmux-backed shared terminal sessions
- [x] Add xterm.js terminal view with resize support
- [x] Add local daemon and worker launch commands
- [x] Add local attach command for web-launched tmux workers
- [x] Add tmux worker cleanup command
- [x] Restore tmux-backed workers on daemon start/restart

### Provider Adapters

- [x] Add provider registry
- [x] Add Claude hooks adapter
- [x] Add Codex session-log adapter
- [x] Add Generic fallback adapter
- [ ] Add Kimi or ACP-style adapter
- [ ] Add provider capability metadata in the UI

### UI

- [x] Keep plain HTML/CSS/JS frontend
- [x] Add four-zone workshop layout
- [x] Add hash-routed terminal view
- [x] Route worker cards into terminal view
- [x] Show terminal warnings for hook-only sessions without PTY

## Known Limitations

- Session state is still stored in memory only.
- Claude hook sessions improve state stability, but they still need a managed terminal transport if you want remote terminal control.
- Codex managed sessions rely on local session-log matching; if multiple Codex sessions start in the same working directory at nearly the same time, transcript linking is still heuristic.
- Generic adapters still rely on fallback parsing when no structured event source exists.
- Claude interrupt recovery currently depends on the local transcript tail as a structured fallback because user interrupts do not always arrive as a final idle-producing hook event.
- xterm.js is currently loaded from CDN for speed of iteration; a local vendored build would be better for offline packaging.
- The current UI is a workshop dashboard, not yet a full pixel-art animated map.
- Browser debugging is currently an environment concern rather than a built-in AgentTown feature; this machine has `chrome-devtools-mcp` installed separately for local debugging workflows.
- Some macOS installs can strip the execute bit from `node-pty`'s bundled `spawn-helper`; AgentTown now repairs that automatically at install and server start, but a manual `chmod +x` may still be required if dependencies are copied in unusual ways.
- tmux-backed sessions currently assume a local tmux installation and a local file registry under `~/.agenttown/sessions`; only tmux-backed sessions are restored after daemon restart.
- Claude hook installation is automated only when the operator explicitly starts the daemon with `--setup-claude`; AgentTown does not silently rewrite global Claude settings on every boot.

## Next Steps

1. Add a proper Node.js install/run verification pass with dependencies present.
2. Extend the provider interface with declared capabilities such as `supportsHooks`, `supportsManagedPty`, and `supportsTerminalAttach`.
3. Add a dedicated archive/history view for completed or exited sessions that are intentionally hidden from the live workshop.
4. Add persistence for session history.
5. Add a future Kimi/ACP adapter without changing the workshop UI contract.
