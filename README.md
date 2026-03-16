# AgentTown

**A local-first AI workshop supervisor for Claude, Codex, and other terminal coding agents.**

AgentTown runs on your machine and gives you a real-time dashboard where every running AI agent appears as a worker in a shared workshop. Launch agents, watch their state change live, and open a full-screen terminal for any session — from any browser on your network.

---

## What It Does

- **Visualizes AI agents** — each session appears as a worker card with live state: `idle`, `working`, `approval`, or `attention`
- **Manages sessions** — launch agents from the CLI or web UI; sessions persist via tmux and survive disconnects
- **Shared terminal** — click any worker to open a full-screen xterm.js terminal, shared across local and browser clients over WebSocket
- **Remote access** — connect a relay server and access your workshop from anywhere
- **Multi-agent** — run Claude and Codex side by side in the same workshop

---

## Install

```bash
npm i -g agent-town
```

**Requirements:** Node.js 18+, tmux (`brew install tmux`), Claude Code or Codex CLI if you plan to use those providers.

---

## Quick Start

**1. Register and create an API key**

Go to [agenttown.cc](https://agenttown.cc), create an account, and generate an API key (`sk_...`).

**2. Start the workshop**

Set your API key as an environment variable and run:

```bash
export AGENTTOWN_API_KEY=sk_your_api_key
att start
```

Or pass it directly:

```bash
att start --key sk_your_api_key
```

**3. Launch agents** (in a new terminal):

```bash
att claude                 # Launch a Claude Code session
att codex                  # Launch a Codex session

att claude -t "Review PR #42"
att codex  -t "Fix login bug"
```

Your workshop is now accessible from the AgentTown dashboard at [agenttown.cc](https://agenttown.cc).

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `att start` | Start and connect to the AgentTown relay (uses `AGENTTOWN_API_KEY` env var) |
| `att start --key sk_xxx` | Start with an explicit API key |
| `att start --key sk_xxx --relay URL` | Start with a custom relay server |
| `att claude` | Launch a Claude Code session |
| `att codex` | Launch a Codex session |
| `att attach <sessionId>` | Attach your local terminal to an existing worker |

---

## Remote Access

By default, `att start` connects to the AgentTown public relay at `agenttown.cc`. You can point to a different relay with the `--relay` flag:

```bash
att start --key sk_your_api_key --relay https://your-relay.example.com
```

---

## License

MIT
