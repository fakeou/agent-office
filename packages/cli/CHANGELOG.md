# Changelog

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
