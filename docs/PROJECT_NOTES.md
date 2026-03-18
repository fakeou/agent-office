# AgentOffice Project Notes

## Background

AgentOffice is a local-first supervisor UI for terminal coding agents. The product narrative is a office floor:

- workers represent live AI sessions
- the office shows only four states: `idle`, `working`, `approval`, `attention`
- clicking a worker opens a full terminal handoff view
- provider adapters determine how session state is sourced

The current first-stage product goal is intentionally narrow:

- one machine runs the AgentOffice daemon locally
- the daemon is reachable from the same LAN
- local tmux sessions remain the real terminal source of truth
- web clients and future apps attach to that local daemon instead of a cloud relay

The system is intentionally provider-based. Claude gets a structured adapter via official hooks, Codex gets a structured adapter via local session JSONL, and managed terminal ownership can now be routed either through backend-owned PTY or shared tmux sessions depending on the operator experience you want.

## Scope

Current scope:

- Node.js runtime
- pnpm-managed dependency workflow
- `agentoffice start` local daemon workflow
- `agentoffice restart` daemon restart and recovery workflow
- `agentoffice codex` / `agentoffice claude` operator commands
- `agentoffice cleanup` tmux worker cleanup command
- provider adapters for Claude, Codex, and Generic
- managed PTY sessions via node-pty plus shared tmux sessions for local-first terminal ownership
- office UI and full-screen terminal view
- Claude hooks ingestion
- Codex session-log reconciliation plus generic fallback state handling

Out of scope for this phase:

- database persistence
- SSH relay / multi-machine orchestration
- desktop packaging
- provider-specific protocols beyond Claude hooks and Codex session logs

## Architecture

### Authentication Model (Phase 2)

AgentOffice uses a token-based authentication system for local access protection, and a Relay-based tunnel for remote access.

**Local token security model:**

- Token storage: `~/.agentoffice/token` file, plaintext, file permission `600`
- Auth flow: client submits token via `POST /api/auth/login`, server sets `HttpOnly` + `SameSite=Strict` cookie (7-day TTL)
- LAN bypass: by default, requests from `127.*`, `192.168.*`, `10.*`, `172.16-31.*` skip token verification (Phase 1 backward compatibility)
- Force auth: `--auth` flag makes all requests require token, including LAN
- Brute-force protection: per-IP rate limit (5 attempts/minute), lockout after 10 consecutive failures (15-minute cooldown)
- WebSocket protection: upgrade requests check the same cookie
- Token rotation: `agentoffice token reset` regenerates the token and overwrites the file

**Relay tunnel model (hosted mode):**

AgentOffice connects to a managed Relay server via `--key sk_xxx --relay URL`. The Relay handles:

- Tunnel establishment: CLI opens a WebSocket to the Relay, which proxies HTTP and WebSocket traffic to the local AgentOffice daemon
- Authentication: API Key (registered through the dashboard) identifies the user; the Relay issues JWTs for browser sessions
- Session state caching: the Relay caches office status summaries so remote clients can see agent state even before the tunnel data arrives
- Heartbeat and reconnection: the tunnel client sends periodic pings and reconnects with exponential backoff on disconnect

Message types on the tunnel WebSocket:

| Type | Direction | Purpose |
|---|---|---|
| `auth` | CLI → Relay | Authenticate with API Key |
| `auth:ok` | Relay → CLI | Confirm authentication, return public URL |
| `http:request` | Relay → CLI | Proxy an HTTP request to local server |
| `http:response` | CLI → Relay | Return the local server's HTTP response |
| `ws:open` | Relay → CLI | Open a proxied WebSocket to local server |
| `ws:message` | Both | Forward WebSocket frames |
| `ws:close` | Both | Close a proxied WebSocket |
| `status:summary` | CLI → Relay | Push session status summary for caching |
| `ping` / `pong` | Both | Keepalive |

**Auth middleware flow:**

1. Request arrives at Express middleware
2. Check if path is whitelisted (`/api/auth/*`, `/login.html`, static assets) → pass through
3. Check if LAN request and `--auth` not set → pass through (Phase 1 compat)
4. Check `agentoffice_token` cookie → verify with timing-safe comparison → pass or 401
5. API routes return `401 JSON`; page routes redirect to `/login.html`
6. WebSocket upgrade follows the same LAN/cookie logic; rejected upgrades get `401` on the raw socket

### Current Module Layout

The project is organized as a pnpm monorepo, but the live daemon logic now sits under `packages/cli/src/*`:

**`packages/cli/` (`agentoffice`)** — CLI entrypoint and local daemon

- `src/index.js`
  CLI entrypoint for `start`, `codex`, `claude`, `serve`, `run`, `claude-hook`, `print-claude-hooks`, and `token` subcommands, plus startup repair for `node-pty` spawn-helper permissions on macOS, local `tmux attach` support, `--auth` / `--auth-token` flags, and `--key` / `--relay` flags for hosted mode tunnel.
- `src/auth.js`
  Token generation, file persistence, timing-safe verification, LAN IP detection, per-IP login rate limiting, and cookie helpers.
- `src/server.js`
  Express app, REST API, static serving, auth middleware, login/logout/check endpoints, and WebSocket upgrade handling with token verification.
- `src/tunnel.js`
  Relay tunnel client: connects to the Relay server via WebSocket, proxies HTTP requests and WebSocket connections to the local daemon, sends status summaries, and handles heartbeat/reconnection.

- `src/core/store/session-store.js`
  In-memory session registry, logs, event history, and update emitter.
- `src/core/config.js`
  Shared constants (default host, port, server URL).
- `src/core/state.js`
  Shared display-state constants and office zone mapping.
- `src/core/providers/`
  Provider registry and adapters (Claude, Codex, Generic).
- `src/runtime/pty-manager.js`
  Managed PTY lifecycle, tmux-backed session lifecycle, terminal WebSocket binding, shared-session attach flow, and launch registration only after transport startup succeeds.
- `src/runtime/ensure-node-pty.js`
  Repairs `node-pty` spawn-helper execute permissions on macOS.
- `src/runtime/cli-helpers.js`
  CLI preflight checks, LAN URL discovery, command resolution, and Claude hook installation helpers.
- `src/runtime/session-registry.js`
  Local file registry for tmux-backed worker metadata so the daemon can restore sessions after restart.
- `src/runtime/tmux.js`
  tmux session creation, pane inspection, attach-client spawning, and local attach command generation.

**`packages/web/` (`@agentoffice/web`)** — Frontend assets

- `public/index.html`
  Plain HTML shell with `@xterm/xterm` CDN loading.
- `public/login.html`
  Token login page for local access authentication.
- `public/login.css`
  Login page styling.
- `public/app.js`
  Office view, hash routing, WebSocket clients with reconnection and auth-awareness, connection status indicator, and terminal view.
- `public/styles.css`
  Office and terminal styling.

**`packages/api/` (`@agentoffice/api`)** — Dashboard API server (user accounts, API keys)

**`packages/relay/` (`@agentoffice/relay`)** — Relay server (tunnel proxying, session state caching)

### Transport Model

The Python prototype used HTTP polling for command handoff. The Node.js architecture replaces that with two WebSocket layers and two managed terminal transports:

1. `/ws/events`
   Global session updates for the office view.
2. `/ws/terminal/:sessionId`
   One terminal stream per managed session. In PTY mode the backend owns the process directly. In tmux mode each browser tab attaches as its own tmux client to the same underlying local-first terminal session.

Primary operator flow for the first phase:

1. `agentoffice start`
   Starts the local daemon, binds to the LAN by default, checks `tmux` and local AI CLIs, and optionally installs Claude hooks.
   On boot it restores any still-running AgentOffice tmux workers recorded in the local registry.
2. The office homepage exposes `Launch Claude` and `Launch Codex` buttons.
   Those one-click actions create tmux-backed workers with default commands from the local daemon.
3. `agentoffice codex` or `agentoffice claude`
   Still create a tmux-backed worker session and attach the current local terminal when you want local-first launch.
4. Web clients on the same LAN open the office and attach to the same worker session on demand.
5. The local machine can later recover that tmux session with `agentoffice attach <sessionId>` and continue operating it in a native terminal.
6. `agentoffice cleanup`
   Removes only AgentOffice-managed tmux sessions that use the `agentoffice_` session-name prefix, and the daemon reconciles those missing tmux workers out of the live office.

REST remains in place for low-frequency operations:

- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/launch`
- `POST /api/providers/claude/hook`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/check`

### WebSocket Reconnection (Phase 2)

Both WebSocket channels now implement automatic reconnection with exponential backoff:

- **Events socket** (`/ws/events`): reconnects on close with delays 1s → 2s → 4s → ... → 30s max. On reconnect, the client re-fetches `/api/sessions` to sync full state. The office header shows a connection status indicator (online / reconnecting... / connecting...).
- **Terminal socket** (`/ws/terminal/:sessionId`): reconnects with the same backoff strategy. The terminal displays a "[connection lost, reconnecting...]" message. After reconnect, some terminal output may be lost (acceptable since tmux sessions persist server-side).
- Both channels detect 401 close codes and redirect to the login page instead of reconnecting.

## State Model

AgentOffice now standardizes the user-facing state model to four states only:

- `idle`
- `working`
- `approval`
- `attention`

The office maps those states to four zones:

- `working` -> Office Floor
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

For the office UI, `displayState` must always be one of:

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
- `SessionEnd` -> hidden from the office

Claude terminal output is not used to infer state. Hook-only Claude sessions are marked with `transport=hook` so they are not confused with tmux-backed Claude terminal sessions. When a permission request is approved, the next `PostToolUse` moves the worker back to `working`. When a permission request is denied but Claude does not emit a final deny hook, AgentOffice reconciles Claude's local transcript, detects the rejected tool-use record, and returns the worker to `idle`. The same transcript recovery path also restores `idle` after user interrupts that do not produce a follow-up hook.

### Codex

Codex does not expose a Claude-style hook surface here, so AgentOffice treats the local Codex session JSONL as the primary structured lifecycle source for managed Codex sessions.

Current strategy:

- managed launch through AgentOffice with tmux as the default transport
- managed Codex sessions start in `idle` until Codex records a structured lifecycle event
- the local terminal can attach to the same tmux session as the web terminal
- managed session linked to a matching file under `~/.codex/sessions`
- `task_started` -> `working`
- `task_complete` -> `idle`
- `turn_aborted` -> `idle`
- transcript reconciliation owns lifecycle `state`
- provider-specific terminal text parsing raises `displayState` overlays for `approval` and `attention`
- `displayState` may temporarily differ from lifecycle `state` when the worker is blocked or needs operator attention

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
- [x] Add global office WebSocket
- [x] Add per-session terminal WebSocket
- [x] Add node-pty managed sessions
- [x] Add tmux-backed shared terminal sessions
- [x] Add xterm.js terminal view with resize support
- [x] Add local daemon and worker launch commands
- [x] Add local attach command for web-launched tmux workers
- [x] Add tmux worker cleanup command
- [x] Restore tmux-backed workers on daemon start/restart

### Authentication and Remote Access (Phase 2)

- [x] Add token-based authentication module (`src/auth.js`)
- [x] Add auth middleware with LAN bypass for Phase 1 backward compatibility
- [x] Add login/logout/check API endpoints
- [x] Add WebSocket upgrade authentication
- [x] Add login page (`login.html` + `login.css`)
- [x] Add frontend 401 handling with redirect to login
- [x] Add WebSocket reconnection with exponential backoff (events + terminal)
- [x] Add connection status indicator in office header
- [x] Add `--auth` flag to force authentication for all requests
- [x] Add `--auth-token` flag to set custom token
- [x] Add `agentoffice token reset` and `agentoffice token show` commands
- [x] Add login rate limiting and lockout protection

### Provider Adapters

- [x] Add provider registry
- [x] Add Claude hooks adapter
- [x] Add Codex session-log adapter
- [x] Add Generic fallback adapter
- [ ] Add Kimi or ACP-style adapter
- [ ] Add provider capability metadata in the UI

### UI

- [x] Keep plain HTML/CSS/JS frontend
- [x] Add four-zone office layout
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
- The current UI is a office dashboard, not yet a full pixel-art animated map.
- Browser debugging is currently an environment concern rather than a built-in AgentOffice feature; this machine has `chrome-devtools-mcp` installed separately for local debugging workflows.
- Some macOS installs can strip the execute bit from `node-pty`'s bundled `spawn-helper`; AgentOffice now repairs that automatically at install and server start, but a manual `chmod +x` may still be required if dependencies are copied in unusual ways.
- tmux-backed sessions currently assume a local tmux installation and a local file registry under `~/.agentoffice/sessions`; only tmux-backed sessions are restored after daemon restart.
- Claude hook installation is automated only when the operator explicitly starts the daemon with `--setup-claude`; AgentOffice does not silently rewrite global Claude settings on every boot.

## Next Steps

1. Add a proper Node.js install/run verification pass with dependencies present.
2. Extend the provider interface with declared capabilities such as `supportsHooks`, `supportsManagedPty`, and `supportsTerminalAttach`.
3. Add a dedicated archive/history view for completed or exited sessions that are intentionally hidden from the live office.
4. Add persistence for session history.
5. Apply the same lifecycle-vs-display overlay contract consistently to future Claude and non-Codex provider improvements.
6. Keep transport and relay latency work on a separate track from provider state-contract changes.
7. Add a future Kimi/ACP adapter without changing the office UI contract.
