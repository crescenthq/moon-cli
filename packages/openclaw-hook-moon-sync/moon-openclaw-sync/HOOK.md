---
name: moon-openclaw-sync
description: "Sync OpenClaw sessions to Moon with off/prompt/auto lifecycle behavior"
homepage: https://github.com/crescenthq/moon-cli/tree/main/packages/openclaw-hook-moon-sync
metadata:
  {
    "openclaw":
      {
        "emoji": "🌙",
        "events":
          ["command:new", "message:received", "message:sent", "command:stop", "command:reset"],
        "install":
          [
            {
              "id": "repo",
              "kind": "git",
              "label": "Moon CLI repository",
              "repository": "https://github.com/crescenthq/moon-cli",
            },
          ],
      },
  }
---

# Moon OpenClaw Sync Hook

Automatically invokes Moon CLI session sharing for OpenClaw using `sharing.mode`:

- `off`: no automatic sync/share
- `prompt`: show reminder message only
- `auto`: automatically share and sync

This hook listens to:

- `command:new`
- `message:received`
- `message:sent`
- `command:stop`
- `command:reset`
