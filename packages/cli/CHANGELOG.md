# Changelog

## [0.1.5] - 2026-03-20

### Fixed
- Codex tmux screen classification now matches real status lines instead of any diagnostic text on screen, so reading code, changelogs, or grep output no longer falsely flips active workers into `attention`
- Stale Codex `attention` overlays now fall back to the live lifecycle state once the terminal screen no longer shows a real attention condition

## [0.1.4] - 2026-03-20

### Fixed
- Tunnel HTTP proxying now strips browser-only and hop-by-hop headers before forwarding requests into the local CLI server
- Hosted Office requests such as worker listing, launch, and directory browsing no longer fail with transient `fetch failed` responses while the local tunnel is otherwise online

## [0.1.3] - 2026-03-19

### Fixed
- Codex sessions now classify user `esc` interruptions as `idle` instead of `approval`
- Codex network stream failures such as `stream disconnected before completion` now surface as `attention`
- Tightened approval detection so plain terminal text mentioning `approval` no longer triggers a false `approval` state

## [0.1.2] - 2026-03-19

### Changed
- Hosted office sessions now recover from relay `tunnel_offline` drops with fast retry polling, so the remote Office badge returns to `Live` sooner after `ato start` reconnects

### Fixed
- Reduced the long offline window where the hosted app could stay disconnected even after the local CLI tunnel had already reconnected

## [0.1.1] - 2026-03-18

### Added
- Mobile live-recovery helpers for stale-on-resume socket replacement and platform-specific recovery guidance
- Regression tests covering runtime postinstall path, removal of the legacy `packages/core` package, and display-state contract behavior

### Changed
- The live daemon now treats `packages/cli/src/core` and `packages/cli/src/runtime` as the only authoritative implementation paths
- Mobile office and terminal clients force fresh reconnects after foreground restore when a socket has gone stale

### Fixed
- `displayZone` now follows `displayState` reliably, so approval and attention overlays land in the correct UI zone
- Root `postinstall` now points at the real `packages/cli/src/runtime/ensure-node-pty` module
- Removed stale workspace dependencies on `@agent-office/core` from relay and API services
- Deleted the obsolete `packages/core` mirror to prevent future drift
## [0.1.0] - 2026-03-17

### Added
- Inline `core` and `runtime` modules — no longer depends on separate `@agent-office/core` / `@agent-office/runtime` packages; everything ships in one bundle
- Provider architecture: modular `claude`, `codex`, and `generic` providers with `reconcileSession` and `classifyOutput` hooks
- Codex transcript integration: reads `~/.codex/sessions/*.jsonl` to drive session state from transcript lifecycle events (`task_started`, `task_complete`, `turn_aborted`)
- Claude transcript integration: reads `~/.claude/projects/` JSONL to detect agent state from hook events
- Session registry: persists sessions to disk so `ato start` can restore running tmux sessions across restarts
### Removed
- Dropped built-in static web UI (`src/web/`) — the mobile/web React app is the official frontend; `ato start` no longer serves HTML pages

### Fixed
- **Codex worker state flickering** — sessions no longer alternate between `attention` and `idle` every ~1.2 s. Root cause: screen-based `classifyOutput` saw "error"/"failed" in Codex terminal output and set state to `attention`; transcript reconciler then corrected it to `idle` on the next tick, causing an infinite loop. Fix: skip `classifyOutput` entirely once a Codex transcript file is linked to the session.

## [0.0.1] - 2026-02-01

- Initial release: `ato start`, `ato attach`, relay tunnel to agentoffice.top
