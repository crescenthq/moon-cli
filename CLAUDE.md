# Moon

Session sharing platform for Claude Code. Syncs conversations to the cloud with shareable URLs.

## Project Structure

```
packages/
├── cli/                  # @moon/cli - Command-line tool
├── shared/               # @moon/shared - Shared types and constants
├── claude-code-plugin/   # @moon/plugin-claude-code - Claude Code integration
└── worker/               # Backend API (Cloudflare Workers)
```

## Commands

```bash
# Development
bun install              # Install dependencies
bun run dev              # Run CLI locally (in packages/cli)
bun run format           # Format code
bun run lint             # Lint code
bun run check            # Run biome check

# CLI (from packages/cli)
bun run dev share        # Share a session
bun run dev config get sharing.mode
bun run dev config set sharing.mode auto
```

## CLI Architecture

- **citty** for command routing
- **@clack/prompts** for interactive UI
- **picocolors** for terminal colors

Commands: `share`, `login`, `config`

## Key Files

| File                                      | Purpose                       |
| ----------------------------------------- | ----------------------------- |
| `packages/cli/src/cli.ts`                 | CLI entrypoint                |
| `packages/cli/src/commands/share.ts`      | Share command                 |
| `packages/cli/src/utils/sync-client.ts`   | API client                    |
| `packages/cli/src/utils/sync-state.ts`    | Local state management        |
| `packages/cli/src/utils/config.ts`        | User config                   |
| `packages/cli/src/utils/session-files.ts` | Claude Code session discovery |

## User Data

Stored in `~/.config/moon/`:

- `config.json` — Preferences (sharing.mode: off|prompt|auto)
- `sync-state.json` — Session sync tracking

---

## Bun

Use Bun instead of Node.js.

- `bun <file>` instead of `node <file>`
- `bun test` instead of jest/vitest
- `bun install` instead of npm/yarn/pnpm install
- `bun run <script>` instead of npm run
- Bun auto-loads `.env`, no dotenv needed

### APIs

- `Bun.serve()` for HTTP/WebSocket (not express)
- `bun:sqlite` for SQLite (not better-sqlite3)
- `Bun.file` over `node:fs` readFile/writeFile
- `Bun.$\`cmd\`` instead of execa

### Testing

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```

Run: `bun test`
