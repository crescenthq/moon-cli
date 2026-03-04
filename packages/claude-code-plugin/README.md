# @moon/plugin-claude-code

Claude Code plugin for automatic session sharing with Moon.

## Features

- **Automatic syncing** via Claude Code hooks
- **`/share` command** for manual sharing
- **Configurable modes** (off, prompt, auto)

## How It Works

The plugin registers three hooks:

| Hook | When | Action |
|------|------|--------|
| `SessionStart` | Session begins | Start sharing (auto mode) or show hint (prompt mode) |
| `UserPromptSubmit` | After each prompt | Sync latest changes |
| `SessionEnd` | Session ends | Final sync |

Hooks call the Moon CLI to perform syncing in the background.

## Configuration

Set sharing mode via the CLI:

```bash
# Manual only
moon config set sharing.mode off

# Show reminders to share
moon config set sharing.mode prompt

# Auto-share all sessions
moon config set sharing.mode auto
```

## `/share` Command

Type `/share` in Claude Code to manually share the current session.

## OpenClaw Integration

OpenClaw auto-sync uses a separate hook package:
[`@crescenthq/openclaw-hook-moon-sync`](../openclaw-hook-moon-sync/README.md).

This README only documents Claude Code plugin behavior.

## Development

```bash
claude --plugin-dir ./packages/claude-code-plugin/
```

Test hooks:

```bash
bun test
```
