# agent-office-cli

`agent-office-cli` is the local runtime for AgentOffice.

It starts the local session manager, restores tmux-backed AI workers, connects your machine to the hosted relay, and lets you launch or attach to Claude Code / Codex sessions from the terminal.

## What This Package Does

- Starts the local AgentOffice service with `ato start`
- Restores existing tmux-backed workers after restart
- Connects your machine to `agentoffice.top` or a custom relay
- Launches Claude Code and Codex workers with one command
- Exposes local worker terminals to the AgentOffice web or mobile UI

## Install

```bash
npm i -g agent-office-cli
```

## Requirements

- Node.js 18+
- `tmux`
- Claude Code and/or Codex CLI if you want to launch those providers

Example on macOS:

```bash
brew install tmux
```

## Quick Start

1. Create an API key on `https://agentoffice.top`
2. Start the local runtime
3. Launch workers from another terminal

Using an environment variable:

```bash
export AGENTOFFICE_API_KEY=sk_your_api_key
ato start
```

Or pass the key directly:

```bash
ato start --key sk_your_api_key
```

Launch workers:

```bash
ato claude
ato codex
```

Launch with a custom title:

```bash
ato claude -t "Review PR #42"
ato codex -t "Fix login bug"
```

Attach your local terminal to an existing worker:

```bash
ato attach <sessionId>
```

## Common Commands

### `ato start`

Starts the local AgentOffice runtime, restores managed sessions, and connects to the hosted relay when an API key is present.

Examples:

```bash
ato start
ato start --key sk_your_api_key
ato start --key sk_your_api_key --relay https://your-relay.example.com
```

Notes:

- On macOS, `ato start` keeps the machine awake while the tunnel is active
- Hosted tunnel logs are written to `~/.agentoffice/logs/tunnel.log`

### `ato claude`

Launches a Claude Code worker in tmux so it can be supervised from AgentOffice.

```bash
ato claude
ato claude -t "Investigate flaky test"
```

### `ato codex`

Launches a Codex worker in tmux.

```bash
ato codex
ato codex -t "Refactor websocket retry logic"
```

### `ato attach`

Attaches your local shell directly to a worker's tmux session.

```bash
ato attach <sessionId>
```

## Hosted Mode

When you start the runtime with an API key, the CLI opens a secure tunnel from your local machine to the AgentOffice relay.

That tunnel is used to:

- show your workers in the Office UI
- open remote terminals from web or mobile
- launch workers from the AgentOffice interface
- proxy requests into the local runtime

If the connection drops, the tunnel automatically retries and records reconnect details in the local tunnel log.

## Troubleshooting

### `tmux is required`

Install `tmux` first, then run `ato start` again.

### Worker launch commands are missing

Make sure the provider CLI is installed and available on `PATH`:

- `claude`
- `codex`

### Remote Office shows offline

Check the local tunnel log:

```bash
tail -n 100 ~/.agentoffice/logs/tunnel.log
```

Look for:

- websocket connection errors
- reconnect attempts
- auth failures
- relay disconnect reasons

## Package Scope

This package is the CLI/runtime portion of AgentOffice only.

It does not include the full web app source or product docs. Those live in the main repository:

- GitHub: `https://github.com/fakeou/agent-office`

## License

MIT
