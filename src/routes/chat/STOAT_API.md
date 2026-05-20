# Stoat API Reference

Self-hosted Stoat instance at `https://chat.chemistryml.com`.

Stoat is a fork of [Revolt](https://github.com/stoatchat/stoatchat). The full OpenAPI spec is available at `https://stoat.chat/api/openapi.json`.

---

## Authentication

All authenticated endpoints require:

```
x-session-token: <session_token>
```

The token is obtained from the login endpoint and stored in the Auth.js session as `session.user.stoat_token`.

---

## Auth Endpoints

### Register
```
POST /api/auth/account/create
```
**Body:**
```json
{ "email": "user@example.com", "password": "secret", "invite": "optional", "captcha": "optional" }
```
**Response:** `204 No Content` on success  
**Errors:** `{ "type": "EmailAlreadyInUse" }` etc.

---

### Login
```
POST /api/auth/session/login
```
**Body:**
```json
{ "email": "user@example.com", "password": "secret", "friendly_name": "My App" }
```
**Response:**
```json
{
  "result": "Success",
  "_id": "<session_id>",
  "user_id": "<user_id>",
  "token": "<session_token>",
  "name": "<session_display_name>",
  "last_seen": "2026-01-01T00:00:00Z"
}
```
> **Note:** The login response does NOT include `email` or `username`. Call `GET /users/@me` after login to get those.

---

### Logout
```
POST /api/auth/session/logout
```
**Auth:** `x-session-token`  
**Response:** `204 No Content`

---

### Fetch Account Info (includes email)
```
GET /auth/account/
```
**Auth:** `x-session-token`  
**Response:** `AccountInfo` object with email and account details

---

## Onboarding (Username Setup)

New accounts do not have a username until onboarding is completed. This is a one-time step that **must** happen before the user can be seen in servers or DMs.

### Check onboarding status
```
GET /api/onboard/hello
```
**Auth:** `x-session-token`  
**Response:** `{ "onboarding": true }` if the username has not been set yet; `{ "onboarding": false }` otherwise.

### Complete onboarding (set initial username)
```
POST /api/onboard/complete
```
**Auth:** `x-session-token`  
**Body:**
```json
{ "username": "desired_username" }
```
**Response:** `200 OK` with the `User` object on success.

**Username constraints:**
- 2–32 characters
- Only Unicode letters (`\p{L}`), digits, `_`, `.`, `-` — regex: `^(\p{L}|[\d_.\-])+$`
- Must be globally unique (server assigns a numeric discriminator if needed)

> **Important:** This endpoint is called **once** immediately after account creation, before calling `GET /users/@me`. If a user signs in and `GET /onboard/hello` returns `{ "onboarding": true }`, the client must call this endpoint before using the API.

### Integration pattern (registration)

```typescript
// 1. Create account
await fetch('/api/auth/account/create', { method: 'POST', body: JSON.stringify({ email, password }) });

// 2. Get a temporary session token to complete onboarding
const loginData = await fetch('/api/auth/session/login', {
  method: 'POST', body: JSON.stringify({ email, password })
}).then(r => r.json());

// 3. Derive username from email local-part; sanitize to allowed charset
const rawName = email.split('@')[0];
const username = rawName.replace(/[^\p{L}\d_.\-]/gu, '').slice(0, 32);
const safeUsername = username.length >= 2 ? username : (username + '00').slice(0, 32);

// 4. Complete onboarding
await fetch('/api/onboard/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-session-token': loginData.token },
  body: JSON.stringify({ username: safeUsername }),
});

// 5. Establish Auth.js session (re-authenticates internally)
await signIn({ email, password });
```

### Integration pattern (sign-in guard)

On every sign-in, check onboarding status and complete it if needed:

```typescript
const { onboarding } = await fetch('/api/onboard/hello', {
  headers: { 'x-session-token': token }
}).then(r => r.json());

if (onboarding) {
  const email = session.user.email ?? '';
  const rawName = email.split('@')[0];
  const username = rawName.replace(/[^\p{L}\d_.\-]/gu, '').slice(0, 32);
  const safeUsername = username.length >= 2 ? username : (username + '00').slice(0, 32);
  await fetch('/api/onboard/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': token },
    body: JSON.stringify({ username: safeUsername }),
  });
}
```

---

## User Endpoints

### Fetch Current User
```
GET /users/@me
```
**Auth:** `x-session-token`  
**Response:**
```json
{
  "_id": "<user_id>",
  "username": "myusername",
  "discriminator": "1234",
  "display_name": "My Name",
  "avatar": { "_id": "<file_id>", "tag": "avatars", ... },
  "online": true,
  "status": { "text": "Doing chemistry", "presence": "Online" },
  "relations": [
    { "_id": "<user_id>", "status": "Friend" },
    { "_id": "<user_id>", "status": "Incoming" }
  ]
}
```

**Relationship status values:** `Friend`, `Incoming` (pending incoming request), `Outgoing` (pending sent request), `Blocked`, `BlockedOther`, `None`, `User` (self)

**Example (TypeScript):**
```typescript
const res = await fetch("https://chat.chemistryml.com/users/@me", {
  headers: { "x-session-token": stoatToken },
});
const user = await res.json();
// user.username, user.discriminator, user.display_name, user.relations
```

---

### Fetch Another User
```
GET /users/{user_id}
```
**Auth:** `x-session-token`  
**Response:** `User` object

---

## Messaging Endpoints

### Fetch Messages
```
GET /channels/{channel_id}/messages
```
**Auth:** `x-session-token`  
**Query params:**
| Param | Type | Description |
|---|---|---|
| `limit` | integer (1–100) | Max messages to return |
| `before` | string (26-char ID) | Fetch messages before this ID |
| `after` | string (26-char ID) | Fetch messages after this ID |
| `sort` | `"Latest"` \| `"Oldest"` \| `"Relevance"` | Sort order |
| `include_users` | boolean | Also return user objects |

**Response:** Array of `Message` objects, or `{ messages, users, members }` if `include_users=true`

**Example:**
```typescript
const res = await fetch(
  `https://chat.chemistryml.com/channels/${channelId}/messages?limit=50&sort=Latest`,
  { headers: { "x-session-token": stoatToken } }
);
const messages = await res.json(); // Message[]
```

---

### Send Message
```
POST /channels/{channel_id}/messages
```
**Auth:** `x-session-token`  
**Optional header:** `Idempotency-Key: <unique_key>` (prevents duplicate sends on retry)  
**Body:**
```json
{
  "content": "Hello, world!",
  "attachments": [],
  "replies": [{ "id": "<message_id>", "mention": true }],
  "embeds": [{
    "title": "Optional embed",
    "description": "Some text",
    "colour": "#ff6600"
  }]
}
```
**Response:** `Message` object

**Example:**
```typescript
const res = await fetch(`https://chat.chemistryml.com/channels/${channelId}/messages`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-session-token": stoatToken,
  },
  body: JSON.stringify({ content: "Hello!" }),
});
const message = await res.json();
```

---

### Edit Message
```
PATCH /channels/{channel_id}/messages/{message_id}
```
**Auth:** `x-session-token`  
**Body:** `{ "content": "Updated text", "embeds": [...] }`  
**Response:** Updated `Message`

---

### Delete Message
```
DELETE /channels/{channel_id}/messages/{message_id}
```
**Auth:** `x-session-token`  
**Response:** `204 No Content`

---

### Search Messages
```
POST /channels/{channel_id}/search
```
**Auth:** `x-session-token`  
**Body:**
```json
{
  "query": "search term",
  "limit": 25,
  "sort": "Relevance",
  "include_users": true
}
```
**Response:** `BulkMessageResponse`

---

## Channel Endpoints

### Fetch Channel
```
GET /channels/{channel_id}
```
**Auth:** `x-session-token`  
**Response:** `Channel` object (one of: `SavedMessages`, `DirectMessage`, `Group`, `TextChannel`, `VoiceChannel`)

---

### Acknowledge Message (mark as read)
```
PUT /channels/{channel_id}/ack/{message_id}
```
**Auth:** `x-session-token`  
**Response:** `204 No Content`

---

### Fetch Direct Message Channels
```
GET /users/dms
```
**Auth:** `x-session-token`  
**Response:** Array of `Channel` objects

---

### Open DM with User
```
GET /users/{user_id}/dm
```
**Auth:** `x-session-token`  
**Response:** `Channel` (DirectMessage or SavedMessages if target is self)

---

## Server Endpoints

### Fetch Server
```
GET /servers/{server_id}
```
**Auth:** `x-session-token`  
**Query:** `include_channels=true` to embed channel list  
**Response:** `Server` object

---

### Fetch Server Members
```
GET /servers/{server_id}/members
```
**Auth:** `x-session-token`  
**Query:** `exclude_offline=true`  
**Response:**
```json
{
  "members": [
    {
      "_id": { "server": "<server_id>", "user": "<user_id>" },
      "nickname": null,
      "roles": []
    }
  ],
  "users": [
    {
      "_id": "<user_id>",
      "username": "Username",
      "discriminator": "1234",
      "display_name": "Display Name",
      "online": true,
      "status": { "presence": "Online", "text": null },
      "relationship": "Friend"
    }
  ]
}
```
Merge by `member._id.user === user._id` to get the combined `StoatMember` object.

---

## Friends / Relationships

### Send Friend Request
```
POST /users/friend
```
**Auth:** `x-session-token`  
**Body:** `{ "username": "Username#1234" }` — include the discriminator (may be omitted if the server doesn't use them)  
**Response:** `204 No Content`

---

### Accept Friend Request
```
PUT /users/{user_id}/friend
```
**Auth:** `x-session-token`  
**Response:** `204 No Content`

---

### Remove Friend / Deny Request
```
DELETE /users/{user_id}/friend
```
**Auth:** `x-session-token`  
**Response:** `204 No Content`

---

## Real-time Events (WebSocket / Bonfire)

The WebSocket URL is provided by the server config endpoint:
```
GET /
```
Returns `{ ws: "wss://chat.chemistryml.com/...", ... }`

Connect and authenticate:
```typescript
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "Authenticate",
    token: stoatToken,
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case "Authenticated":        // successfully authenticated
    case "Ready":                // initial state: msg.users, msg.servers, msg.channels
      // users include `relationship` field; channels include DMs
    case "Message":             // new message: msg.channel, msg._id, msg.author, msg.content
    case "MessageUpdate":       // edit: msg.id, msg.channel, msg.data
    case "MessageDelete":       // delete: msg.id, msg.channel
    case "UserRelationship":    // relationship changed: msg.id (user), msg.user, msg.status
    case "UserPresence":        // presence changed: msg.id (user), msg.online
    case "ChannelCreate":       // new channel (incl. DMs): msg._id, msg.channel_type, msg.recipients
    case "UserUpdate":          // user profile changed
    case "ChannelStartTyping": // msg.id (channel), msg.user
    case "ChannelStopTyping":  // msg.id (channel), msg.user
    case "ChannelAck":         // msg.id (channel), msg.user, msg.message_id (last acked)
    case "MessageReact":       // msg.id (message), msg.channel_id, msg.user_id, msg.emoji_id
    case "MessageUnreact":     // msg.id (message), msg.channel_id, msg.user_id, msg.emoji_id
  }
};
```

### `Ready` event — users array
Each user in `Ready.users` has a `relationship` field:
```json
{ "_id": "<id>", "username": "...", "online": true, "status": { "presence": "Online" }, "relationship": "Friend" }
```

### `UserRelationship` event
Fires when a relationship changes (friend request sent/accepted/denied/blocked):
```json
{ "type": "UserRelationship", "id": "<user_id>", "user": { ...WsReadyUser }, "status": "Friend" }
```

### `ChannelCreate` event
Fires when a new channel is created, including when a DM is opened:
```json
{ "type": "ChannelCreate", "_id": "<channel_id>", "channel_type": "DirectMessage", "recipients": ["<user_id>", "<user_id>"] }
```

---

## Reactions

### Add Reaction
```
PUT /channels/{channel_id}/messages/{message_id}/reactions/{emoji_id}
```
**Auth:** `x-session-token`  
**Response:** `204 No Content`

---

### Remove Reaction
```
DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji_id}
```
**Auth:** `x-session-token`  
**Query:** `user_id=<id>` (remove someone else's), `remove_all=true`  
**Response:** `204 No Content`

---

## File Uploads (Autumn)

Files are uploaded to the Autumn file server. Check the server config (`GET /`) for the `features.autumn.url`.

```
POST https://<autumn_url>/{tag}
Content-Type: multipart/form-data
x-session-token: <token>

file=<binary>
```

Tags: `attachments`, `avatars`, `backgrounds`, `icons`, `banners`

Returns: `{ _id: "<file_id>" }` — use this ID in message `attachments` or profile updates.

> **Note:** the response field is `_id` (not `id`) — consistent with all other Stoat object IDs.

Avatar URL format: `https://<autumn_url>/avatars/{file_id}`

---

## Error Format

All errors return:
```json
{ "type": "ErrorTypeName" }
```

Common error types: `InvalidSession`, `NotFound`, `MissingPermission`, `Banned`, `TooManyRequests`, `EmailAlreadyInUse`, `UnverifiedAccount`, `UnknownUser`.

Some errors include extra fields, e.g.:
```json
{ "type": "MissingPermission", "permission": "SendMessages" }
{ "type": "GroupTooLarge", "max": 100 }
```

---

## Typing Indicators

Send to the WebSocket (not via HTTP):

```json
{ "type": "BeginTyping", "channel": "<channel_id>" }
{ "type": "EndTyping",   "channel": "<channel_id>" }
```

Other clients receive `ChannelStartTyping` / `ChannelStopTyping` events:

```json
{ "type": "ChannelStartTyping", "id": "<channel_id>", "user": "<user_id>" }
{ "type": "ChannelStopTyping",  "id": "<channel_id>", "user": "<user_id>" }
```

**Implementation pattern:** Send `BeginTyping` on every input keystroke; send `EndTyping` on message send or after ~2.5 s of inactivity using a debounced timeout.

---

## Message Reactions — WebSocket Events

### `MessageReact`
Fires when any user adds a reaction:
```json
{
  "type": "MessageReact",
  "id": "<message_id>",
  "channel_id": "<channel_id>",
  "user_id": "<user_id>",
  "emoji_id": "👍"
}
```
`emoji_id` is either a Unicode emoji string (`"👍"`) or a 26-character ULID for custom server emojis.

### `MessageUnreact`
Fires when any user removes a reaction:
```json
{
  "type": "MessageUnreact",
  "id": "<message_id>",
  "channel_id": "<channel_id>",
  "user_id": "<user_id>",
  "emoji_id": "👍"
}
```

### `ChannelAck`
Fires when a channel is marked as read (by any session of the current user):
```json
{
  "type": "ChannelAck",
  "id": "<channel_id>",
  "user": "<user_id>",
  "message_id": "<last_read_message_id>"
}
```

---

## User Profile

### Fetch User Profile
```
GET /users/{user_id}/profile
```
**Auth:** `x-session-token`
**Response:**
```json
{
  "content": "About me text",
  "background": {
    "_id": "<file_id>",
    "tag": "backgrounds",
    "filename": "banner.jpg",
    "metadata": { "type": "Image", "width": 1920, "height": 480 },
    "size": 204800
  }
}
```
`background` is the profile banner image. Build the URL as:
```
https://chat.chemistryml.com/autumn/backgrounds/{file_id}
```

### Edit Current User Profile
```
PATCH /users/@me
```
**Auth:** `x-session-token`  
**Body:**
```json
{
  "display_name": "New Name",
  "avatar": "<uploaded_file_id_from_avatars_tag>",
  "profile": {
    "background": "<uploaded_file_id_from_backgrounds_tag>",
    "content": "About me text"
  },
  "remove": ["Avatar"]
}
```
**`remove` field values:** `"Avatar"`, `"ProfileBackground"`, `"DisplayName"`, `"StatusText"`  
**Response:** Updated `User` object  

**Example — upload and set a new avatar:**
```typescript
// 1. Upload the file
const form = new FormData();
form.append("file", avatarFile);
const up = await fetch("https://chat.chemistryml.com/autumn/avatars", {
  method: "POST",
  headers: { "x-session-token": token },
  body: form,
});
const { _id } = await up.json();

// 2. Patch the user
await fetch("https://chat.chemistryml.com/users/@me", {
  method: "PATCH",
  headers: { "Content-Type": "application/json", "x-session-token": token },
  body: JSON.stringify({ avatar: _id }),
});
```

---

## Server Invites

### Join via Invite Link
```
POST /invites/{invite_code}
```
**Auth:** `x-session-token`  
**No body required**  
**Response:**
```json
{
  "type": "Server",
  "channels": [{ "_id": "<channel_id>", "server": "<server_id>", ... }],
  "server": {
    "_id": "<server_id>",
    "name": "Server Name",
    "icon": { "_id": "<file_id>", "tag": "icons" }
  }
}
```
The invite code is the last path segment of an invite URL, e.g. `https://stoat.chat/invite/TArGFQbJ` → code `TArGFQbJ`.

### Fetch Invite Info (without joining)
```
GET /invites/{invite_code}
```
**Auth:** optional  
**Response:** Same structure as POST but doesn't join

---

## Custom Emojis

### Fetch Server Emojis
```
GET /servers/{server_id}/emojis
```
**Auth:** `x-session-token`  
**Response:** Array of `Emoji` objects:
```json
[
  {
    "_id": "01JABCDE...",
    "name": "pepe",
    "animated": false,
    "parent": { "type": "Server", "id": "<server_id>" }
  }
]
```
Server emojis are also included in the `Ready` WebSocket event as `emojis[]`.

### Emoji URL
```
https://chat.chemistryml.com/autumn/emojis/{emoji_id}
```

### Custom Emoji in Message Content
Custom emojis are embedded in message `content` using the syntax:
```
:01JABCDE...:
```
Where the 26-character string is the emoji's `_id` (ULID format). Parse with:
```typescript
const EMOJI_RE = /:([0-9A-Z]{26}):/g;
```
Standard Unicode emoji (👍, ❤️, etc.) appear as raw Unicode characters.

**Reactions** use the same format: `emoji_id` is either a raw Unicode string or a 26-char ULID for custom emoji.

---

## Full WebSocket Event Reference

| Event type | Key fields | Direction |
|---|---|---|
| `Authenticate` | `token` | Client → Server |
| `BeginTyping` | `channel` | Client → Server |
| `EndTyping` | `channel` | Client → Server |
| `Authenticated` | — | Server → Client |
| `Ready` | `users[]`, `servers[]`, `channels[]`, `emojis[]` | Server → Client |
| `Message` | `_id`, `channel`, `author`, `content?`, `attachments?[]`, `replies?[]`, `mentions?[]` | Server → Client |
| `MessageUpdate` | `id`, `channel`, `data.content` | Server → Client |
| `MessageDelete` | `id`, `channel` | Server → Client |
| `MessageReact` | `id` (msg), `channel_id`, `user_id`, `emoji_id` | Server → Client |
| `MessageUnreact` | `id` (msg), `channel_id`, `user_id`, `emoji_id` | Server → Client |
| `ChannelCreate` | `_id`, `channel_type`, `server?`, `recipients?[]` | Server → Client |
| `ChannelStartTyping` | `id` (channel), `user` | Server → Client |
| `ChannelStopTyping` | `id` (channel), `user` | Server → Client |
| `ChannelAck` | `id` (channel), `user`, `message_id` | Server → Client |
| `UserRelationship` | `id` (user), `user` (object), `status` | Server → Client |
| `UserPresence` | `id` (user), `online` | Server → Client |
| `UserUpdate` | `id`, `data`, `clear?[]` | Server → Client |

---

## Data Type Reference

### Message object
```typescript
type Message = {
  _id: string;
  channel: string;
  author: string;                       // user_id
  content?: string | null;
  attachments?: Attachment[];
  reactions?: Record<string, string[]>; // emoji_id → user_id[]
  replies?: string[];                   // message_id[]
  mentions?: string[];                  // user_id[] of @mentioned users
  edited?: string;                      // ISO timestamp if edited
  embeds?: Embed[];
};
```

### Attachment object
```typescript
type Attachment = {
  _id: string;
  tag: string;               // "attachments"
  filename?: string;
  metadata?: {
    type: "Image" | "Video" | "Audio" | "Text" | "File";
    width?: number;          // images/videos
    height?: number;
  };
  size?: number;             // bytes
  content_type?: string;     // MIME type
};
```
URL: `https://chat.chemistryml.com/autumn/attachments/{_id}`

### Channel object
```typescript
type Channel =
  | { channel_type: "TextChannel"; _id: string; server: string; name: string; }
  | { channel_type: "DirectMessage"; _id: string; recipients: string[]; active: boolean; }
  | { channel_type: "Group"; _id: string; name: string; recipients: string[]; owner: string; }
  | { channel_type: "SavedMessages"; _id: string; user: string; }
  | { channel_type: "VoiceChannel"; _id: string; server: string; name: string; };
```

### Server object
```typescript
type Server = {
  _id: string;
  name: string;
  owner: string;
  icon?: { _id: string; tag: "icons" } | null;
  banner?: { _id: string; tag: "banners" } | null;
  channels: string[];
  roles?: Record<string, { name: string; colour?: string; rank?: number }>;
  default_permissions: number;
};
```

### User object
```typescript
type User = {
  _id: string;
  username: string;
  discriminator?: string;
  display_name?: string | null;
  avatar?: { _id: string; tag: "avatars" } | null;
  online?: boolean;
  status?: { presence?: "Online" | "Idle" | "Busy" | "Focus" | "Invisible"; text?: string | null };
  relations?: Array<{ _id: string; status: RelationshipStatus }>;
  relationship?: RelationshipStatus; // only present when fetching another user
  bot?: { owner: string };
};

type RelationshipStatus = "Friend" | "Incoming" | "Outgoing" | "Blocked" | "BlockedOther" | "None" | "User";
```

### StoatMember (merged server member + user)
```typescript
// When fetching server members, the response contains separate `members[]` and `users[]`.
// Merge by member._id.user === user._id:
type StoatMember = {
  _id: { server: string; user: string };
  nickname?: string | null;
  roles?: string[];
  avatar?: { _id: string; tag: string } | null;     // server-specific avatar override
  userAvatar?: { _id: string; tag: string } | null; // main account avatar
  username?: string;
  discriminator?: string;
  display_name?: string | null;
  online?: boolean;
  status?: { presence?: PresenceStatus; text?: string | null };
};
```

---

## Client Integration — TypeScript / Qwik Patterns

### Autumn file upload helper
```typescript
async function uploadFile(file: File, tag: "avatars" | "backgrounds" | "attachments" | "icons" | "emojis", token: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  // Do NOT set Content-Type — let the browser set multipart/form-data with boundary
  const r = await fetch(`https://chat.chemistryml.com/autumn/${tag}`, {
    method: "POST",
    headers: { "x-session-token": token },
    body: form,
  });
  if (!r.ok) return null;
  const { _id } = await r.json();
  return _id ?? null;
}
```

### Parsing custom emoji in message content
```typescript
const EMOJI_RE = /:([0-9A-Z]{26}):/g;

function parseContent(content: string, emojis: Record<string, StoatEmoji>): ContentPart[] {
  const parts: ContentPart[] = [];
  let last = 0, key = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_RE.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: content.slice(last, m.index), key: key++ });
    const emoji = emojis[m[1]];
    if (emoji) parts.push({ type: "emoji", id: m[1], name: emoji.name, animated: emoji.animated, key: key++ });
    else        parts.push({ type: "text", text: m[0], key: key++ });
    last = m.index + m[0].length;
  }
  if (last < content.length || parts.length === 0)
    parts.push({ type: "text", text: content.slice(last), key: key++ });
  return parts;
}
```

### Detecting emoji-only messages (for 4× size rendering)
```typescript
const EMOJI_ULID_RE = /:[0-9A-Z]{26}:/g;
const UNICODE_EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

function isEmojiOnly(text: string): boolean {
  if (!text.trim()) return false;
  const stripped = text.trim().replace(EMOJI_ULID_RE, "").replace(UNICODE_EMOJI_RE, "").replace(/\s/g, "");
  return stripped.length === 0;
}
```

### Shared reactive state (Qwik)
The `StoatChatState` store is created in the parent page with `useStore` and passed as a prop to `<StoatChat>`. This avoids prop-drilling signals and allows the parent page to also react to chat events (e.g., show unread badge outside the component).

```typescript
type StoatChatState = {
  joinedServers: StoatServer[];
  activeServerId: string;
  activeDmUserId: string;
  activeDmSeq: number;          // increment to force DM reload for the same userId
  currentUserId: string;
  wsReady: boolean;
  relations: StoatRelation[];
  userNames: Record<string, string>;    // userId → display name
  userAvatars: Record<string, string>;  // userId → avatar URL
  serverEmojis: Record<string, StoatEmoji>;  // emojiId → emoji
};
```

### Qwik serialization constraint
In Qwik, event handlers (`onClick$`, `onChange$`, etc.) are **QRL closures** — they are serialized to the DOM as strings and re-hydrated on interaction. This means all variables captured by a QRL closure **must be serializable** (strings, numbers, Qwik signals, Qwik stores). **Functions are not serializable.**

If you map over an array of objects containing icon components (functions), extract primitive values **before** the closure:

```typescript
// ❌ Captures `room`, which has `room.icon: LuFlaskConical` (a function)
rooms.map((room) => (
  <button onClick$={async () => {
    const code = room.code.split("/").pop(); // captures `room`
  }} />
))

// ✅ Extracts primitives; closure only captures strings
rooms.map((room) => {
  const code = room.code?.split("/").pop() ?? "";
  const title = room.title;
  return (
    <button onClick$={async () => {
      // only captures `code` (string) and `title` (string) + Qwik signals
    }} />
  );
})
```

### Message reactions — optimistic UI pattern
Because the API only returns the current reaction state on initial message fetch (via `GET /channels/{id}/messages`), and live updates arrive via `MessageReact` / `MessageUnreact` WS events, the recommended pattern is to apply them directly to the message state without re-fetching:

```typescript
// MessageReact handler
messages.value = messages.value.map((m) => {
  if (m._id !== event.id) return m;
  const reactions = { ...(m.reactions ?? {}) };
  // Deduplicate to avoid double-counting if event fires twice
  reactions[event.emoji_id] = [
    ...(reactions[event.emoji_id] ?? []).filter(u => u !== event.user_id),
    event.user_id,
  ];
  return { ...m, reactions };
});

// MessageUnreact handler
messages.value = messages.value.map((m) => {
  if (m._id !== event.id) return m;
  const reactions = { ...(m.reactions ?? {}) };
  const users = (reactions[event.emoji_id] ?? []).filter(u => u !== event.user_id);
  if (users.length) reactions[event.emoji_id] = users;
  else delete reactions[event.emoji_id];
  return { ...m, reactions };
});
```

### Sending messages with attachments and replies
Upload attachments **before** sending. The Autumn upload returns an `_id`; pass the ID array to the send call:

```typescript
// 1. Upload all files
const attachmentIds: string[] = [];
for (const file of files) {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`https://chat.chemistryml.com/autumn/attachments`, {
    method: "POST",
    headers: { "x-session-token": token },
    body: form,
  });
  const { _id } = await r.json();
  if (_id) attachmentIds.push(_id);
}

// 2. Send message
await fetch(`https://chat.chemistryml.com/channels/${channelId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-session-token": token },
  body: JSON.stringify({
    content: "Here are some files",      // optional if attachments are provided
    attachments: attachmentIds,          // string[] of attachment _id values
    replies: [{ id: replyToMsgId, mention: false }],  // optional
  }),
});
```

---

## Implementation Notes (this project)

**Instance:** Self-hosted Stoat at `https://chat.chemistryml.com`  
**Auth.js integration:** Token stored as `session.user.stoat_token` (custom field via NextAuth callback)  
**Component:** `src/components/stoat-chat/stoat-chat.tsx` — accepts `token: string` and `chatState: StoatChatState` props  
**Helpers:** `src/components/stoat-chat/stoat_scripts.tsx` — all API calls, types, and pure utility functions; no Qwik hooks

### Key helper functions

| Function | Description |
|---|---|
| `fetchMessages(channelId, token)` | Fetch last 50 messages with `include_users=true` |
| `sendMessage(channelId, content, token, options?)` | Send a message; options: `attachments`, `replies` |
| `uploadAttachment(file, token)` | Upload to Autumn `/attachments`, returns `_id` |
| `deleteMessage(channelId, messageId, token)` | `DELETE` a message |
| `editMessage(channelId, messageId, content, token)` | `PATCH` message content |
| `reactToMessage(channelId, messageId, emoji, token)` | `PUT` reaction (`encodeURIComponent(emoji)`) |
| `unreactFromMessage(channelId, messageId, emoji, token)` | `DELETE` reaction |
| `fetchServerMembers(serverId, token)` | Fetch members array merged with users |
| `ackChannel(channelId, messageId, token)` | Mark channel as read |
| `openDMChannel(userId, token)` | Open/get DM channel with a user |
| `sendFriendRequest(usernameWithDiscriminator, token)` | Send friend request |
| `acceptFriendRequest(userId, token)` | Accept incoming friend request |
| `fetchUserBanner(userId, token)` | Fetch profile background URL from `/users/{id}/profile` |
| `uploadFile(file, endpoint, token)` | Upload to Autumn `avatars` or `backgrounds` |
| `editUserProfile(changes, token)` | `PATCH /users/@me` — display name, avatar, banner |

### Autumn tag reference

| Tag | Used for |
|---|---|
| `avatars` | User profile pictures |
| `backgrounds` | Profile banner images |
| `icons` | Server icons |
| `banners` | Server banners |
| `attachments` | Message file attachments |
| `emojis` | Custom server emoji images |

### Message display rules

- If `msg.content` contains **only** Unicode emoji and/or custom emoji references (`:ULID:`), render at 4× size (`text-5xl`)
- Custom emoji inline: replace `:ULID:` tokens with `<img src=".../emojis/{id}" class="h-5 w-5 inline" />`
- Attachments with `metadata.type === "Image"` render as `<img>` (max 300 px wide); all others render as download links
- `msg.replies[]` are message IDs — look them up in the current messages array to render a reply preview header
- `msg.reactions` is `Record<emojiId, userId[]>` — highlight pills where `userId[]` includes `currentUserId`

### Unread tracking
The `ChannelAck` WS event is the signal that a channel has been read. Compare the acked `message_id` against the last known message in that channel to determine whether a channel still has unread messages. On initial load, `GET /users/@me` returns `unreads[]` with `{ channel: id, last_id: id }`.

---

## Notifications

### Mention detection
The `Message` WebSocket event includes a `mentions` field — an array of user IDs that were @mentioned in the message. There is **no** separate WS event for mentions; clients check client-side:

```typescript
const isMentioned = (msg.mentions ?? []).includes(currentUserId);
```

DMs are not distinguish by event type — they arrive as a standard `Message` event. Detect them by checking the channel's `channel_type === 'DirectMessage'`.

### Browser Notification API pattern
Request permission once at component mount. Only fire a notification when `document.hidden` (tab is backgrounded) to avoid noise while the user is actively using the app:

```typescript
// Request permission on mount (inside useVisibleTask$)
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// In WS Message handler:
if (msg.author !== currentUserId && document.hidden) {
  const senderName = userNames[msg.author] ?? 'Someone';
  const body = msg.content?.slice(0, 100)
    ?? (msg.attachments?.length ? '📎 Sent an attachment' : '…');

  if (Notification.permission === 'granted') {
    const n = new Notification(senderName, {
      body,
      icon: userAvatars[msg.author],
      tag: msg.channel,   // collapse multiple messages from same channel into one notification
    });
    n.onclick = () => window.focus();
  }
}
```

> **Note:** `tag` deduplicates notifications from the same channel — the OS replaces the previous notification from that tag instead of stacking them.

### Document title ticker
When the tab is hidden and a new message arrives, scroll the document title to attract the user's attention:

```typescript
// State: notifTitle = useSignal('');

// Set in WS Message handler when document.hidden:
notifTitle.value = isDM
  ? `new message from ${senderName}`
  : `new message in ${serverName}`;

// Clear when tab becomes visible again:
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) notifTitle.value = '';
});

// Animate the title (inside a useVisibleTask$ that tracks notifTitle):
const full = `🔴 ${notifTitle}        `; // trailing spaces act as separator before wrap
let pos = 0;
const id = setInterval(() => {
  document.title = full.slice(pos) + full.slice(0, pos);
  pos = (pos + 1) % full.length;
}, 175); // ~175 ms per character
```

The rotation string is built once per notification; `pos` advances each tick to create the scrolling marquee effect. The trailing spaces give a visual pause before the text wraps around.

