# @moon/cli

Tool for sharing your coding agent (Claude Code) sessions with Moon.

## Installation

```bash
bun install -g @moon/cli
```

## Commands

### `moon share`

Share a session.

```bash
# Interactive: pick a session from a list
moon share

# Share a specific session
moon share --sessionId abc123

# Non-interactive with JSON output (for scripts)
moon share --non-interactive --json
```

**Options:**

| Option | Description |
|--------|-------------|
| `--sessionId <id>` | Share a specific session |
| `--title <title>` | Custom title |
| `--visibility <v>` | `public`, `unlisted`, or `private` |
| `--non-interactive` | Skip prompts (uses defaults) |
| `--json` | Output JSON |

### `moon share status <sessionId>`

Check if a session is being shared.

```bash
moon share status abc123 --json
# {"sharing":true,"url":"https://..."}
```

### `moon config`

Manage CLI configuration.

```bash
# Get a value
moon config get sharing.mode

# Set a value
moon config set sharing.mode auto
```

**Sharing modes:**

| Mode | Behavior |
|------|----------|
| `off` | Manual sharing only (default) |
| `prompt` | Remind to use `/share` on session start |
| `auto` | Automatically share all sessions |

### `moon login`

Authenticate with Moon. 

## Development

```bash
# Run locally
bun run dev share

# Build
bun run build

# Test
bun test
```

## Files

Configuration and state are stored in `~/.config/moon/`:

- `config.json` — User preferences
- `sync-state.json` — Session sync tracking
