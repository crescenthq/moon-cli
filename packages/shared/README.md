# @moon/shared

Shared types and constants for Moon packages.

## Usage

```typescript
import { Session, Message, Visibility } from "@moon/shared";
```

## Types

### Session

```typescript
interface Session {
  id: string;
  ownerId: string;
  ownerName?: string;
  title?: string;
  visibility: Visibility;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}
```

### Message

```typescript
interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  timestamp: number;
  createdAt: number;
}
```

### Visibility

```typescript
type Visibility = "private" | "unlisted" | "public";
```

## Constants

```typescript
const DEFAULT_API_URL = "https://api.mooncomputer.io";
const DEFAULT_WEB_URL = "https://mooncomputer.io";
```

## Development

```bash
bun install
```
