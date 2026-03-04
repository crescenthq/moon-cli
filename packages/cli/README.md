# moon

Tool for sharing your coding agent sessions with Moon (Claude Code and OpenClaw).

## Installation

```bash
npm install -g @crescenthq/moon
```

Or use directly with `npx`
```bash
npx @crescenthq/moon share
```

## Commands

### `moon share`

Share a session.

```bash
# Interactive: pick a session from a list
moon share

# Share a specific session
moon share --sessionId abc123

# Share OpenClaw sessions
moon share --agent openclaw

# Non-interactive with JSON output (for scripts)
moon share --json
```

**Options:**

| Option | Description |
|--------|-------------|
| `--agent <name>` | Session source agent (`claude-code` or `openclaw`) |
| `--sessionId <id>` | Share a specific session |
| `--title <title>` | Custom title |
| `--visibility <v>` | `public`, `unlisted`, or `private` |
| `--quiet` | Skip prompts (uses defaults) |
| `--json` | Output JSON |

### `moon share status <sessionId>`

Check if a session is being shared.

```bash
# Claude Code session
moon share status abc123 --json

# OpenClaw session
moon share status abc123 --agent openclaw --json
# {"sharing":false} or {"sharing":true,"url":"https://..."}
```

### `moon login`

Authenticate with Moon. 

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

## OpenClaw Auto-Sync (Separate Hook Package)

OpenClaw auto-sync is provided by a dedicated hook package:
[`@crescenthq/openclaw-hook-moon-sync`](../openclaw-hook-moon-sync/README.md).

Install and enable it from this repo:

```bash
openclaw hooks install ./packages/openclaw-hook-moon-sync --link
openclaw hooks enable moon-openclaw-sync
openclaw hooks check
```

### OpenClaw `sharing.mode` behavior

With `moon-openclaw-sync` installed:

| Mode | Start lifecycle | Incremental lifecycle | Final lifecycle |
|------|------------------|-----------------------|-----------------|
| `off` | No auto-share | Sync only when already sharing | Final sync only when already sharing |
| `prompt` | Reminder message only (no auto-share) | Sync only when already sharing | Final sync only when already sharing |
| `auto` | Auto-share when not yet sharing | Background sync while active | Foreground final sync |

## Files

Configuration and state are stored in `~/.config/moon/`:

- `config.json` — User preferences
- `sync-state.json` — Session sync tracking
