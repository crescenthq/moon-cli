---
description: Share this session with Moon
allowed-tools: [Bash]
---

# Share Session

Share your Claude Code session for live viewing and collaboration. We will create a shareable session link with ID: ${CLAUDE_SESSION_ID}

## Instructions

Run the Moon CLI to share this session:

```bash
npx --yes @moon/cli share --sessionId "$CLAUDE_SESSION_ID" --title "<brief description of the session>" --non-interactive
```

**Arguments:**

- `--sessionId` - The Claude session ID (use `$CLAUDE_SESSION_ID` environment variable)
- `--title` - A brief, descriptive title for the shared session (required)
- `--non-interactive` - Run without prompts (required for slash commands)

The command will:

1. Upload the session transcript
2. Return a shareable URL
3. Enable live sync for future messages

## Example

When the user types `/share`, ask them for a brief title or generate one based on the conversation, then execute:

```bash
npx --yes @moon/cli share --sessionId "$CLAUDE_SESSION_ID" --title "Refactoring session discovery" --non-interactive
```

Display the resulting URL to the user.
