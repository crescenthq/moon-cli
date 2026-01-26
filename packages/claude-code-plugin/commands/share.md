---
description: Share this Claude Code session with Moon
allowed-tools: [Bash]
---

# Share Session

Create a shareable Moon link for this Claude Code session so others can view and collaborate live.

## Prerequisites

Before running the share command:

**Determine title**: Use user-provided title, or generate a short descriptive title (3-8 words) based on the conversation. Keep it single-line, no special characters.

## Command

Prefer `moon` from PATH, fallback to dev path:

```bash
npx --yes @moon/cli share --sessionId "$CLAUDE_SESSION_ID" --title "<TITLE>" --quiet
```

Fallback:

```bash
npx --yes @moon/cli share --sessionId "$CLAUDE_SESSION_ID" --title "<TITLE>" --quiet
```

## Output Handling

The command outputs JSON in quiet mode.

**On success**, extract and display only the `url` field to the user:

```json
{"url": "https://mooncomputer.io/s/abc123", "sessionId": "..."}
```

**On error**, parse the `error` field to determine next steps.

## Error Handling

### Authentication Required

```json
{
  "error": "authentication_required",
  "message": "Login required to share sessions",
  "action": {"command": "moon login"}
}
```

When you receive this:

1. Tell the user: "To share sessions, you'll need to sign in to Moon (free). This enables shareable URLs for live viewing of your coding sessions."
2. Run: `npx --yes @moon/cli login` (opens browser for sign-in)
3. After successful login, retry the share command **once**

### Other Errors

- **Non-JSON output**: The CLI may emit errors before JSON on unexpected failures. Surface a concise message and suggest retrying.
- **Non-zero exit with no output**: Check if `moon` CLI is installed/built correctly.
- **Network errors**: Suggest checking connectivity and retrying.

Do not retry indefinitely. If share fails twice, stop and ask the user for guidance.

## Example Flow

User types `/share`:

1. Generate title from conversation context (e.g., "Implementing user signup form")
2. Run: `moon share --sessionId "$CLAUDE_SESSION_ID" --title "Refactoring session discovery" --quiet`
3. Parse JSON response
4. If success: Display "Your session is live at: https://mooncomputer.io/s/abc123"
5. If auth required: Explain, run `moon login`, retry once

## Best Practices

- Show only the shareable URL on success, not the full JSON
- Keep error messages brief with clear next steps
- Never expose environment variables or debug logs unless explicitly requested
