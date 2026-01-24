# Moon

Share your Claude Code sessions with a link.

Moon syncs your Claude Code conversations to the cloud and gives you a shareable URL. As you work, sessions stay in sync automatically.

## Quick Start

```bash
# Install the CLI
bun install -g @moon/cli

# Share your most recent session
moon share
```

## Packages

| Package | Description |
|---------|-------------|
| [@moon/cli](packages/cli) | Command-line tool for sharing sessions |
| [@moon/plugin-claude-code](packages/claude-code-plugin) | Claude Code plugin for automatic syncing |
| [shared](packages/shared) | Shared types and constants |

## Development

```bash
# Install dependencies
bun install

# Run the CLI locally
bun run --filter @moon/cli dev

# Format code
bun run format

# Lint
bun run lint
```

## How It Works

1. **CLI discovers sessions** from `~/.claude/projects/`
2. **You pick a session** (or use the most recent automatically)
3. **Session syncs** to Moon's API
4. **You get a URL** to share with others

The Claude Code plugin can automate this via hooks, syncing on every prompt.

## Configuration

Moon stores config at `~/.config/moon/config.json`:

```json
{
  "sharing": {
    "mode": "off"
  }
}
```

**Sharing modes:**
- `off` — Manual sharing only (default)
- `prompt` — Show reminder to use `/share`  
- `auto` — Automatically share all sessions

Set your mode:

```bash
moon config set sharing.mode auto
```

## License

MIT
