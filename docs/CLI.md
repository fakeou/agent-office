# CLI Runtime Notes

This document tracks the current runtime behavior of `agent-office-cli`, especially around long-lived `ato start` sessions and platform-specific power management.

## Hosted Tunnel Reliability

`ato start` keeps a long-lived WebSocket tunnel open to the hosted relay. If the local machine sleeps, suspends networking, or freezes background processes, the relay will eventually mark the tunnel offline after heartbeat timeout.

That means the hosted Office can temporarily show `Offline` even though the local CLI process itself has not crashed.

## Default Sleep Prevention

### macOS

On macOS, `ato start` now starts a companion `caffeinate` process by default while the CLI is running.

- Purpose: prevent idle system sleep from dropping the hosted tunnel
- Behavior: runs only for the lifetime of the current `ato start` process
- Scope: enabled automatically; no extra flag required

This change is intended to reduce the common case where a MacBook on battery goes idle, sleeps, and silently disconnects from the relay.

### Windows / Linux

Windows and Linux currently remain fully supported for normal CLI usage, but they do **not** yet have a built-in default sleep-prevention strategy.

For now:

- normal `ato start` behavior is unchanged
- no platform-specific inhibitor is started automatically
- future support should be added only when a real platform-specific issue is confirmed

## Current Policy

The project currently treats sleep prevention as:

- `macOS`: implemented by default
- `Windows`: deferred until a concrete issue is reported
- `Linux`: deferred until a concrete issue is reported

## Release Reference

- `agent-office-cli@0.1.6`
- Git tag: `v0.1.6`
