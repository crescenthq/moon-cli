# @crescenthq/openclaw-hook-moon-sync

OpenClaw hook pack for Moon session auto-sync.

This package is separate from the Claude plugin and is the required integration for OpenClaw auto-sync behavior.

## What It Does

The `moon-openclaw-sync` hook maps OpenClaw events to Moon sync lifecycle behavior:

- Start lifecycle: `command:new` (or first `message:received` if start was missed)
- Incremental lifecycle: `message:received`, `message:sent`
- Final lifecycle: `command:stop`, `command:reset`

## Install And Enable

From the Moon repo:

```bash
openclaw hooks install ./packages/openclaw-hook-moon-sync --link
openclaw hooks enable moon-openclaw-sync
```

Recommended verification:

```bash
openclaw hooks info moon-openclaw-sync
openclaw hooks list --verbose
openclaw hooks check
```

Expected healthy signals:

- `openclaw hooks info moon-openclaw-sync` shows `✓ Ready`
- `openclaw hooks info moon-openclaw-sync` lists events: `command:new`, `message:received`, `message:sent`, `command:stop`, `command:reset`
- `openclaw hooks list --verbose` shows `moon-openclaw-sync` as `✓ ready`
- `openclaw hooks check` reports `Not ready: 0`

## sharing.mode Behavior (OpenClaw)

Set mode with Moon CLI:

```bash
moon config set sharing.mode off
moon config set sharing.mode prompt
moon config set sharing.mode auto
```

Behavior with this OpenClaw hook installed:

| `sharing.mode` | Start lifecycle | Incremental lifecycle | Final lifecycle |
|---|---|---|---|
| `off` | No auto-share. Manual `moon share` only. | Sync only if the session is already sharing. | Final sync only if the session is already sharing. |
| `prompt` | No auto-share. Writes reminder message with a `moon share --agent openclaw --sessionId ...` command. | Sync only if the session is already sharing. | Final sync only if the session is already sharing. |
| `auto` | Auto-runs `moon share --agent openclaw --sessionId=<id> --quiet` if not yet sharing. | Background sync runs for active sessions. | Foreground final sync runs when session is active. |

## Observability And Troubleshooting

### Confirm current mode

```bash
moon config get sharing.mode --quiet
```

Expected output: one of `off`, `prompt`, `auto`.

### Check if a specific OpenClaw session is sharing

Use the Moon CLI from this repo (recommended during development):

```bash
bun run packages/cli/src/cli.ts share status <sessionId> --agent openclaw --json
```

Expected output patterns:

- Not sharing: `{"sharing":false}`
- Sharing: `{"sharing":true,"url":"https://..."}`

### Check hook readiness

```bash
openclaw hooks list --verbose
openclaw hooks check
openclaw hooks info moon-openclaw-sync
```

Expected output patterns:

- Healthy: `Hooks (5/5 ready)` and `Ready: 5, Not ready: 0`
- Disabled: `moon-openclaw-sync - disabled` and `Not ready: 1`

### If `openclaw hooks enable moon-openclaw-sync` fails with `not eligible`

Re-link and enable again:

```bash
openclaw hooks install ./packages/openclaw-hook-moon-sync --link
openclaw hooks enable moon-openclaw-sync
openclaw hooks check
```

## Rollback (Disable/Uninstall)

### Safe disable (quick rollback)

```bash
openclaw hooks disable moon-openclaw-sync
openclaw hooks check
```

Expected output includes `moon-openclaw-sync - disabled`.

### Re-enable after disable

```bash
openclaw hooks enable moon-openclaw-sync
```

If enable reports `not eligible`, run the relink flow:

```bash
openclaw hooks install ./packages/openclaw-hook-moon-sync --link
openclaw hooks enable moon-openclaw-sync
```

### Uninstall from OpenClaw config (full rollback)

1. Disable the hook:

```bash
openclaw hooks disable moon-openclaw-sync
```

2. Remove installed hook metadata entries:

```bash
openclaw config unset hooks.internal.entries.moon-openclaw-sync
openclaw config unset hooks.internal.installs.openclaw-hook-moon-sync
```

3. Remove the package path from extra hook directories in `~/.openclaw/openclaw.json` (path from `openclaw config file`).

4. Validate:

```bash
openclaw hooks list --verbose
openclaw hooks check
```

After uninstall, `moon-openclaw-sync` should no longer appear in the hook list.
