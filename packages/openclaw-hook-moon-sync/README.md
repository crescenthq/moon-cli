# @crescenthq/openclaw-hook-moon-sync

OpenClaw hook pack for Moon session auto-sync using `sharing.mode` (`off`, `prompt`, `auto`).

## Install

```bash
# From this repo
openclaw hooks install ./packages/openclaw-hook-moon-sync --link
```

```bash
# Enable the hook
openclaw hooks enable moon-openclaw-sync
```

## Configure sharing mode

```bash
moon config set sharing.mode off
moon config set sharing.mode prompt
moon config set sharing.mode auto
```

## Verify

```bash
openclaw hooks info moon-openclaw-sync
openclaw hooks list --verbose
```
