# AgentTown

AgentTown is a local-first AI workshop supervisor built with Node.js. It visualizes terminal coding agents as workers in a four-state workshop and provides a full-screen terminal handoff view powered by WebSocket and xterm.js. The intended first-stage workflow is: install or one-shot run the local daemon, start it with `agenttown start`, then launch shared Claude or Codex workers with `agenttown claude` or `agenttown codex`.

## Current Stack

- Backend: Node.js + Express + ws + node-pty + tmux transport
- Frontend: plain HTML/CSS/JS + `@xterm/xterm` and `@xterm/addon-fit` via CDN
- Transport: REST for session metadata, one global WebSocket for workshop updates, one terminal WebSocket per session, and tmux-backed shared sessions for local-plus-web terminal control
- State model: `idle`, `working`, `approval`, `attention`

## Provider Model

AgentTown is provider-based rather than hook-only.

- `claude`
  Uses Claude Code hooks as the primary state source, with Claude's local transcript used only as a structured recovery layer when hooks do not emit the final resolution. Hook-only Claude workers now show `transport=hook` to distinguish them from tmux-backed terminal sessions. Terminal text is display-only and does not drive Claude state transitions. Transcript reconciliation currently covers user interrupts and permission denials that otherwise leave a worker stuck in `approval` or `working`.
- `codex`
  Uses tmux as the default managed transport so the local terminal stays primary while the web terminal attaches as a second client. Managed Codex sessions start in `idle` and only enter `working` after Codex records a structured `task_started` event. State is reconciled from Codex local session JSONL under `~/.codex/sessions`, with provider-specific terminal parsing kept only as a last-resort fallback for approval or error prompts that are not represented as structured lifecycle events.
- `generic`
  Uses managed PTY by default plus lightweight output matching as a compatibility fallback for other terminal agents.

This keeps Claude reliable while preserving an extension path for other CLI coding agents that do not expose structured lifecycle events.

## Commands

Install dependencies locally while developing:

```bash
pnpm install
```

For end-user usage, the intended CLI shape is:

```bash
npx agenttown start
```

or, after installation:

```bash
npm i -g agenttown
agenttown start
```

On macOS, AgentTown automatically repairs `node-pty`'s bundled `spawn-helper` execute bit during `pnpm install` and again when the server starts, because some local package extractions can leave that helper non-executable and break managed PTY launch with `posix_spawnp failed`.

Start the local LAN-accessible daemon:

```bash
agenttown start
```

`agenttown start` and `agenttown restart` both try to restore previously running AgentTown tmux workers from the local registry under `~/.agenttown/sessions`.

Install Claude hooks during startup preflight if you want Claude state to flow into AgentTown automatically:

```bash
agenttown start --setup-claude
```

Launch a tmux-backed Codex session and keep the current terminal attached locally:

```bash
agenttown codex
```

Launch a tmux-backed Claude session and keep the current terminal attached locally:

```bash
agenttown claude
```

You can still override the working directory, title, command, or transport when needed:

```bash
agenttown codex --cwd /Users/mac/Documents/work -t "Review landing page"
agenttown claude --transport tmux --cwd /Users/mac/Documents/work -t "Claude Session"
agenttown run --provider generic --transport pty --title "One-off command" -- 'bash'
```

Short flag note:

```bash
agenttown codex -t "Yao Ming"
pnpm codex -- -t "Yao Ming"
```

Attach your local terminal to an existing tmux-backed worker that was created from the web UI or another shell:

```bash
agenttown attach <sessionId>
pnpm attach -- <sessionId>
```

Clean up AgentTown-managed tmux workers without touching your other tmux sessions:

```bash
agenttown cleanup
pnpm cleanup
```

Restart the daemon and re-run the same restore pass:

```bash
agenttown restart
pnpm restart
```

Print a Claude hooks config snippet:

```bash
pnpm print-claude-hooks
```

Open the UI at `http://127.0.0.1:8765`.

## Authentication

AgentTown uses token-based authentication for remote access. On first start, a random 64-character hex token is generated and saved to `~/.agenttown/token`.

The token is printed in the terminal when the server starts. You can also view it:

```bash
agenttown token show
```

Reset the token (invalidates all existing sessions):

```bash
agenttown token reset
```

**LAN requests bypass authentication by default** to preserve the Phase 1 local experience. To force authentication for all requests including LAN:

```bash
agenttown start --auth
```

Set a custom token instead of the auto-generated one:

```bash
agenttown start --auth-token YOUR_TOKEN_HERE
```

## Remote Access (FRP)

AgentTown does not manage FRP tunnels. You configure `frpc` yourself to expose the local AgentTown port to the public internet.

**IMPORTANT: You MUST use HTTPS** when exposing AgentTown to the public internet. The access token is transmitted in cookies and must be protected in transit.

### FRP Configuration Example

Using the `https2http` plugin in `frpc.toml`:

```toml
[[proxies]]
name = "agenttown"
type = "https"
customDomains = ["agenttown.example.com"]

[proxies.plugin]
type = "https2http"
localAddr = "127.0.0.1:8765"
crtPath = "/path/to/cert.pem"
keyPath = "/path/to/key.pem"
```

Then access `https://agenttown.example.com` from any browser. You will be prompted for the access token on first visit.

### Security Checklist

- Always use HTTPS (via FRP `https2http` plugin, nginx, or Caddy)
- Keep `~/.agenttown/token` file secure (default permission: `600`)
- Use `agenttown token reset` periodically or after suspected compromise
- Use `--auth` flag if you want LAN requests to also require authentication
- The login page rate-limits attempts: 5 per minute per IP, lockout after 10 consecutive failures

The workshop homepage now exposes two one-click launch actions for local tmux workers:

- `Launch Claude`
- `Launch Codex`

Those web actions default to `tmux` transport, use the daemon working directory, and launch `claude` or `codex` directly. Use the CLI when you need a custom title, working directory, or command.

## Terminal View

Click any worker card to open `#/terminal/:sessionId`.

- tmux-managed sessions keep the local terminal and web terminal attached to the same underlying session while the agent process is running
- each browser terminal tab attaches as its own tmux client over WebSocket
- managed tmux launches `exec` the target agent command so when Claude or Codex exits the pane ends instead of falling back to an extra shell
- keyboard input and resize events are written back to the tmux-attached terminal client
- pty transport is still available when you want the backend to own the whole process directly
- failed managed launches do not leave placeholder workers behind
- hook-only Claude sessions can appear in the workshop even if they do not have a managed PTY attached
- `start` binds to the local LAN by default so phones or other computers on the same network can open the workshop directly

## Claude Hooks

AgentTown includes a Claude hook forwarder command:

```bash
node server.js claude-hook --server http://127.0.0.1:8765
```

You normally do not call this directly. Instead, print the config:

```bash
node server.js print-claude-hooks
```

Then copy the generated JSON into your Claude Code hooks settings. Once hooks are configured, AgentTown will create or update Claude sessions from official events such as:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `PostToolUseFailure`
- `Notification`
- `Stop`
- `TaskCompleted`
- `SessionEnd`

## Notes

- The workshop UI intentionally shows only four user-facing states even if provider adapters internally track richer event detail.
- Interactive Claude sessions should use hooks for state. AgentTown does not rely on Claude terminal text to infer state.
- Claude sessions waiting for the next user prompt return to `idle`; only explicit permission or approval requests move into `approval`.
- When a Claude permission request is resolved, AgentTown first trusts the next structured hook: successful `PostToolUse` returns the worker to `working`. If Claude does not emit a final deny hook, AgentTown reconciles the local transcript and returns the worker to `idle` when the approval was rejected.
- User interrupt and permission-denial recovery for Claude are handled by reconciling the official local transcript when hooks alone do not emit a final idle transition.
- Codex state is now reconciled from its local structured session log; managed sessions begin in `idle`, move to `working` on `task_started`, and use terminal text only as a provider-local fallback for prompts such as approval or error states that lack a stable structured signal.
- `tmux` is the default managed transport for Claude and Codex because it preserves the local terminal as the primary operator surface while allowing remote web attach.
- Hook-only Claude workers can update workshop state without owning a terminal; launch Claude through `agenttown claude` when you want a clickable shared terminal session.
- `start` performs local preflight checks for `tmux`, `claude`, `codex`, and Claude hook configuration before serving the workshop.
- `start` and `restart` restore previously running tmux-backed AgentTown workers from the local session registry before serving the workshop.
- `cleanup` only removes tmux sessions whose names start with AgentTown's own `agenttown_` prefix, and the running daemon reconciles any now-missing tmux workers out of the live workshop.
- Generic and future providers remain extensible through provider-specific runtime events or text fallback when no structured protocol exists.
- tmux/PTY sessions that have ended are removed from the main workshop view once they transition to `completed` or `exited`, so they do not linger as fake active workers.
- Web-launched tmux workers stay attachable from the local machine through `agenttown attach <sessionId>` or the `Local Attach` command shown in the terminal view.
- Local frontend debugging on this machine can also use `chrome-devtools-mcp`, which is installed globally as an environment tool and is not part of AgentTown's runtime dependency graph.
- Additional architecture notes and implementation status are tracked in `PROJECT_NOTES.md`.
