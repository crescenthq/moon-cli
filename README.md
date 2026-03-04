# Moon

Share your coding agent sessions with a link (Claude Code and OpenClaw).

Moon syncs your Claude Code conversations and gives you a shareable URL. As you work, sessions stay in sync automatically.

## Quick Start

```bash
# Install the CLI
npm install -g @crescenthq/moon

# Share your most recent session
moon share
```

Or use directly with `npx`

```bash
npx @crescenthq/moon share
```

## Packages

| Package                                           | Description                              |
| ------------------------------------------------- | ---------------------------------------- |
| [@crescenthq/moon](packages/cli)                  | Command-line tool for sharing sessions   |
| [@crescenthq/openclaw-hook-moon-sync](packages/openclaw-hook-moon-sync) | OpenClaw hook pack for automatic Moon sync |
| [plugin-claude-code](packages/claude-code-plugin) | Claude Code plugin for automatic syncing |

## License

MIT
