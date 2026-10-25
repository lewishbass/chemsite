// Shared types, constants, and API helpers for the Stoat chat integration.
// This module is intentionally free of Qwik-specific hooks so it can be
// imported by both the StoatChat component and the chat page (index.tsx).

export const STOAT_BASE   = 'https://chat.chemistryml.com';
export const STOAT_WS     = 'wss://chat.chemistryml.com/ws';
export const STOAT_AUTUMN = 'https://chat.chemistryml.com/autumn';

/** Build an Autumn file-server URL from an avatar/icon file object. */
export function avatarUrl(file?: { _id: string; tag: string } | null): string | null {
  if (!file?._id) return null;
  return `${STOAT_AUTUMN}/${file.tag}/${file._id}`;
}

// ── Core types ────────────────────────────────────────────────────────────────

export type StoatAttachment = {
  _id: string;
  tag: string;
  filename?: string;
  metadata?: { type: string; width?: number; height?: number };
  size?: number;
};

/** Decode the timestamp embedded in a ULID (first 10 chars = Crockford Base32 millisecond timestamp). */
export function ulidToDate(ulid: string): Date {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const chars = ulid.slice(0, 10).toUpperCase();
  let timestamp = 0;
  for (const ch of chars) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) break;
    timestamp = timestamp * 32 + idx;
  }
  return new Date(timestamp);
}

/** Format a Date to a short time string like "14:32". */
export function formatTime(d: Date): string {
  // if not posted today, include date: "Mar 5, 14:32"
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export type StoatSystemMessage = {
  type: string;
  by?: string;        // actor user id (call_started, user_added, …)
  id?: string;        // target user id (user_added, user_joined, message_pinned, …)
  name?: string;      // channel_renamed
  from?: string;      // channel_ownership_changed
  to?: string;        // channel_ownership_changed
  content?: string;   // text
  finished_at?: string | null; // call_started — set when the call has ended
};

export type StoatMsg = {
  _id: string;
  content?: string | null;
  author: string;
  channel: string;
  attachments?: StoatAttachment[];
  reactions?: Record<string, string[]>;
  replies?: string[];
  system?: StoatSystemMessage | null; // system-generated message (call started, user joined, …)
  createdAt: Date;     // decoded from ULID _id
  edited?: string | null; // ISO timestamp from server, present when edited
};

/** Human-readable text for a system message, or null if unknown type. */
export function formatSystemMessage(
  sys: StoatSystemMessage,
  userNames: Record<string, string>,
  msgCreatedAt?: Date,
): string | null {
  const name = (uid?: string) => (uid ? (userNames[uid] ?? 'Someone') : 'Someone');
  switch (sys.type) {
    case 'text': return sys.content ?? null;
    case 'user_added': return `${name(sys.by)} added ${name(sys.id)}`;
    case 'user_remove': return `${name(sys.by)} removed ${name(sys.id)}`;
    case 'user_joined': return `${name(sys.id)} joined`;
    case 'user_left': return `${name(sys.id)} left`;
    case 'user_kicked': return `${name(sys.id)} was kicked`;
    case 'user_banned': return `${name(sys.id)} was banned`;
    case 'channel_renamed': return `${name(sys.by)} renamed the channel to “${sys.name ?? ''}”`;
    case 'channel_description_changed': return `${name(sys.by)} changed the channel description`;
    case 'channel_icon_changed': return `${name(sys.by)} changed the channel icon`;
    case 'channel_ownership_changed': return `${name(sys.by)} transferred ownership to ${name(sys.to)}`;
    case 'message_pinned': return `${name(sys.by)} pinned a message`;
    case 'message_unpinned': return `${name(sys.by)} unpinned a message`;
    case 'call_started': {
      if (!sys.finished_at) return `${name(sys.by)} started a call`;
      // Duration = finished_at − call start (the message's own ULID timestamp)
      const end = new Date(sys.finished_at).getTime();
      const start = msgCreatedAt?.getTime() ?? end;
      const totalSec = Math.max(0, Math.round((end - start) / 1000));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const duration = h > 0
        ? `${h}h ${m}m`
        : m > 0
          ? `${m}m ${s}s`
          : `${s}s`;
      return `${name(sys.by)}'s call lasted ${duration}`;
    }
    default: return null;
  }
}

export type StoatChannel = {
  _id: string;
  name?: string;
  channel_type: string; // 'TextChannel' | 'DirectMessage' | 'VoiceChannel' | ...
  server?: string;
  recipients?: string[]; // for DirectMessage channels
  active?: boolean;      // whether both sides have the DM open
};

export type StoatServer = {
  _id: string;
  name: string;
  icon?: { _id: string; tag: string } | null;
  banner?: { _id: string; tag: string } | null;
};

export type StoatEmoji = {
  _id: string;
  name: string;
  animated: boolean;
  parent: { type: 'Server' | 'Detached'; id?: string };
};

export type DelEmojiPayload = {
  id: string;
};

/** A pre-parsed segment of message content (plain text or custom emoji). */
export type ContentPart =
  | { type: 'text'; text: string; key: number }
  | { type: 'emoji'; id: string; name: string; animated: boolean; key: number };

/** Split message content into text and custom-emoji segments. */
export function parseContent(content: string, emojis: Record<string, StoatEmoji>): ContentPart[] {
  const EMOJI_RE = /:([0-9A-Z]{26}):/g;
  const parts: ContentPart[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_RE.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: content.slice(last, m.index), key: key++ });
    const emoji = emojis[m[1]];
    if (emoji) {
      parts.push({ type: 'emoji', id: m[1], name: emoji.name, animated: emoji.animated, key: key++ });
    } else {
      parts.push({ type: 'text', text: m[0], key: key++ });
    }
    last = m.index + m[0].length;
  }
  if (last < content.length || parts.length === 0) {
    parts.push({ type: 'text', text: content.slice(last), key: key++ });
  }
  return parts;
}

export type PresenceStatus = 'Online' | 'Idle' | 'Busy' | 'Focus' | 'Invisible';

export type StoatMember = {
  _id: { server: string; user: string };
  nickname?: string | null;
  roles?: string[];
  avatar?: { _id: string; tag: string } | null;      // server-specific avatar override
  // Merged from the server members response's `users` array
  userAvatar?: { _id: string; tag: string } | null;  // main user avatar
  username?: string;
  discriminator?: string;
  display_name?: string | null;
  online?: boolean;
  status?: { presence?: PresenceStatus; text?: string | null };
};

// ── Voice types ────────────────────────────────────────────────────────────────

/** Response from POST /0.8/channels/{id}/join — LiveKit connection info. */
export type VoiceJoinResponse = {
  url: string;   // wss://livekit.…
  token: string; // LiveKit JWT
};

/** Payload for PATCH /0.8/channels/{id}/members/@me/voice. */
export type VoiceStateUpdatePayload = {
  mute?: boolean;
  deaf?: boolean;
  video?: boolean;
};

/** Voice state of a single participant in a voice channel (legacy shape). */
export type VoiceState = {
  user_id: string;
  mute: boolean;
  deaf: boolean;
  video: boolean;
  screensharing?: boolean;
  self_mute: boolean;
  self_deaf: boolean;
};

/**
 * New Stoat EventV1 voice state (UserVoiceState).
 * `id` is the user id; `is_publishing` false ≈ muted; camera/screensharing drive video tiles.
 */
export type UserVoiceState = {
  id: string;                 // user id
  joined_at?: string | null;  // ISO timestamp
  is_receiving?: boolean;
  is_publishing?: boolean;
  camera?: boolean;
  screensharing?: boolean;
};

/** Partial variant broadcast by UserVoiceStateUpdate — every field optional. */
export type PartialUserVoiceState = Partial<UserVoiceState>;

/** Map a new-format UserVoiceState into the legacy VoiceState shape used by the UI. */
export function userVoiceStateToVoiceState(s: UserVoiceState): VoiceState {
  return {
    user_id: s.id,
    mute: s.is_publishing === false,
    deaf: false,
    video: !!(s.camera || s.screensharing),
    screensharing: !!s.screensharing,
    self_mute: s.is_publishing === false,
    self_deaf: false,
  };
}

export type RelationshipStatus =
  | 'Friend' | 'Incoming' | 'Outgoing'
  | 'Blocked' | 'BlockedOther' | 'None' | 'User';

export type StoatRelation = {
  _id: string;          // the other user's ID
  status: RelationshipStatus;
};

// ── WebSocket event types ─────────────────────────────────────────────────────

export type WsReadyUser = {
  _id: string;
  username?: string;
  discriminator?: string;
  display_name?: string | null;
  avatar?: { _id: string; tag: string } | null;
  online?: boolean;
  status?: { presence?: PresenceStatus; text?: string | null };
  relationship?: RelationshipStatus;
};

export type WsReady = {
  type: 'Ready';
  users: WsReadyUser[];
  servers: StoatServer[];
  channels: StoatChannel[];
  emojis?: StoatEmoji[];
  /** Current voice states across all channels — lets the sidebar show who is in voice before you join.
   *  Each entry is a channel: { id: <channel_id>, participants: [{ id: <user_id>, ...UserVoiceState }] } */
  voice_states?: Array<{
    id: string; // channel id
    participants?: Array<UserVoiceState & { joined_at?: string | null }>;
  }>;
};

export type WsMessage = {
  type: 'Message';
  _id: string;
  channel: string;
  author: string;
  content?: string | null;
  attachments?: StoatAttachment[];
  replies?: string[];
  mentions?: string[];  // user IDs of @mentioned users
  edited?: string | null; // ISO timestamp when edited
  system?: StoatSystemMessage | null; // system-generated message payload
};

export type WsMessageUpdate = {
  type: 'MessageUpdate';
  id: string;
  channel: string;
  data: {
    content?: string | null;
    edited?: string | null;
    system?: StoatSystemMessage | null; // system messages are updated in place (e.g. call_started gains finished_at when the call ends)
  };
  clear?: string[];
};

export type WsMessageDelete = {
  type: 'MessageDelete';
  id: string;
  channel: string;
};

export type WsUserRelationship = {
  type: 'UserRelationship';
  id: string;       // the other user's ID
  user: WsReadyUser;
  status: RelationshipStatus;
};

export type WsUserPresence = {
  type: 'UserPresence';
  id: string;
  online: boolean;
};

export type WsChannelCreate = {
  type: 'ChannelCreate';
  _id: string;
  name?: string;
  channel_type: string;
  server?: string;
  recipients?: string[];
};

export type WsChannelStartTyping = {
  type: 'ChannelStartTyping';
  id: string;   // channel id
  user: string; // user id
};

export type WsChannelStopTyping = {
  type: 'ChannelStopTyping';
  id: string;
  user: string;
};

export type WsChannelAck = {
  type: 'ChannelAck';
  id: string;         // channel id
  user: string;       // user id who acked
  message_id: string; // last acked message
};

export type WsMessageReact = {
  type: 'MessageReact';
  id: string;
  channel_id: string;
  user_id: string;
  emoji_id: string;
};

export type WsMessageUnreact = {
  type: 'MessageUnreact';
  id: string;
  channel_id: string;
  user_id: string;
  emoji_id: string;
};

// ── WebSocket voice event types (new Stoat EventV1 format) ────────────────────

/** VoiceChannelJoin — `id` is the channel id, `state.id` is the joining user's id. */
export type WsVoiceChannelJoin = {
  type: 'VoiceChannelJoin';
  id: string;               // channel id
  state: UserVoiceState;    // full voice state of the joining user
};

/** VoiceChannelLeave — `id` is the channel id, `user` is the leaving user's id. */
export type WsVoiceChannelLeave = {
  type: 'VoiceChannelLeave';
  id: string;   // channel id
  user: string; // user id
};

/** VoiceChannelMove — user moved between channels by a moderator. */
export type WsVoiceChannelMove = {
  type: 'VoiceChannelMove';
  user: string;             // moved user id
  from: string;             // old channel id
  to: string;               // new channel id
  state: UserVoiceState;    // full voice state in the new channel
};

/** UserVoiceStateUpdate — partial voice state change (mute/deafen/camera/…).
 *  Actual payload: { id: <user_id>, channel_id: <channel_id>, data: { is_publishing, ... } } */
export type WsVoiceStateUpdate = {
  type: 'UserVoiceStateUpdate' | 'VoiceStateUpdate';
  id: string;                       // user id
  channel_id?: string;              // channel id
  data: PartialUserVoiceState;      // only the changed fields
};

export type WsEvent =
  | { type: 'Authenticated' }
  | WsReady
  | WsMessage
  | WsMessageUpdate
  | WsMessageDelete
  | WsMessageReact
  | WsMessageUnreact
  | WsUserRelationship
  | WsUserPresence
  | WsChannelCreate
  | WsChannelStartTyping
  | WsChannelStopTyping
  | WsChannelAck
  | WsVoiceChannelJoin
  | WsVoiceChannelLeave
  | WsVoiceChannelMove
  | WsVoiceStateUpdate
  | { type: string };

// ── Shared reactive state (useStore in parent, passed to StoatChat as prop) ───

export type StoatChatState = {
  joinedServers: StoatServer[];
  activeServerId: string;
  activeDmUserId: string;
  activeDmSeq: number;          // increment to re-trigger DM even for same userId
  currentUserId: string;
  wsReady: boolean;
  relations: StoatRelation[];
  userNames: Record<string, string>;
  userAvatars: Record<string, string>; // userId → avatar URL
  serverEmojis: Record<string, StoatEmoji>; // emojiId → emoji
  // Voice state
  activeVoiceChannelId: string;          // '' means not in a voice channel
  voiceParticipants: Record<string, VoiceState>; // userId → voice state
  voiceChannelByUser: Record<string, string>;    // userId → voice channel id they are in
  liveKitUrl: string;                    // cached LiveKit URL for reconnects
  liveKitToken: string;                  // cached LiveKit JWT for reconnects
};

// ── API helpers ───────────────────────────────────────────────────────────────

export async function fetchMessages(
  channelId: string,
  token: string,
): Promise<{ msgs: StoatMsg[]; users: WsReadyUser[] }> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/channels/${channelId}/messages?limit=50&sort=Latest&include_users=true`,
      { headers: { 'x-session-token': token } },
    );
    if (!r.ok) return { msgs: [], users: [] };
    const body = await r.json();
    const rawMsgs = ([...(body.messages ?? body)] as Array<Record<string, unknown>>).reverse();
    const msgs: StoatMsg[] = rawMsgs.map(m => ({
      _id: m._id as string,
      content: m.content as string | null | undefined,
      author: m.author as string,
      channel: m.channel as string,
      attachments: m.attachments as StoatAttachment[] | undefined,
      reactions: m.reactions as Record<string, string[]> | undefined,
      replies: m.replies as string[] | undefined,
      system: (m.system as StoatSystemMessage | null | undefined) ?? null,
      createdAt: ulidToDate(m._id as string),
      edited: (m.edited as string | null) ?? null,
    }));
    return { msgs, users: (body.users ?? []) as WsReadyUser[] };
  } catch {
    return { msgs: [], users: [] };
  }
}

export async function sendMessage(
  channelId: string,
  content: string,
  token: string,
  options?: {
    attachments?: string[];
    replies?: Array<{ id: string; mention: boolean }>;
  },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (content) body.content = content;
  if (options?.attachments?.length) body.attachments = options.attachments;
  if (options?.replies?.length) body.replies = options.replies;
  await fetch(`${STOAT_BASE}/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': token },
    body: JSON.stringify(body),
  });
}

export async function uploadAttachment(file: File, token: string): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch(`${STOAT_AUTUMN}/attachments`, {
      method: 'POST',
      headers: { 'x-session-token': token },
      body: form,
    });
    if (!r.ok) return null;
    const data = await r.json();
    return ((data._id ?? data.id) as string) ?? null;
  } catch {
    return null;
  }
}

export async function deleteMessage(channelId: string, messageId: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/channels/${channelId}/messages/${messageId}`,
      { method: 'DELETE', headers: { 'x-session-token': token } },
    );
    return r.ok;
  } catch {
    return false;
  }
}

export async function editMessage(channelId: string, messageId: string, content: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/channels/${channelId}/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-token': token },
        body: JSON.stringify({ content }),
      },
    );
    return r.ok;
  } catch {
    return false;
  }
}

export async function reactToMessage(channelId: string, messageId: string, emoji: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: 'PUT', headers: { 'x-session-token': token } },
    );
    return r.ok;
  } catch {
    return false;
  }
}

export async function unreactFromMessage(channelId: string, messageId: string, emoji: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: 'DELETE', headers: { 'x-session-token': token } },
    );
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchServerMembers(
  serverId: string,
  token: string,
): Promise<StoatMember[]> {
  try {
    const r = await fetch(`${STOAT_BASE}/api/servers/${serverId}/members`, {
      headers: { 'x-session-token': token },
    });
    if (!r.ok) return [];
    const body = await r.json();
    const rawMembers: Array<{
      _id: { server: string; user: string };
      nickname?: string | null;
      roles?: string[];
      avatar?: { _id: string; tag: string } | null;
    }> = body.members ?? [];
    const users: WsReadyUser[] = body.users ?? [];
    const userMap = new Map<string, WsReadyUser>();
    for (const u of users) userMap.set(u._id, u);
    return rawMembers.map((m): StoatMember => {
      const u = userMap.get(m._id.user);
      return {
        _id: m._id,
        nickname: m.nickname,
        roles: m.roles,
        avatar: m.avatar,       // server-specific avatar override
        userAvatar: u?.avatar,  // main user avatar
        username: u?.username,
        discriminator: u?.discriminator,
        display_name: u?.display_name,
        online: u?.online,
        status: u?.status,
      };
    });
  } catch {
    return [];
  }
}

export async function ackChannel(
  channelId: string,
  messageId: string,
  token: string,
): Promise<void> {
  try {
    await fetch(`${STOAT_BASE}/api/channels/${channelId}/ack/${messageId}`, {
      method: 'PUT',
      headers: { 'x-session-token': token },
    });
  } catch { /* ignore */ }
}

export async function openDMChannel(
  userId: string,
  token: string,
): Promise<StoatChannel | null> {
  try {
    const r = await fetch(`${STOAT_BASE}/api/users/${userId}/dm`, {
      headers: { 'x-session-token': token },
    });
    if (!r.ok) return null;
    return r.json() as Promise<StoatChannel>;
  } catch {
    return null;
  }
}

/**
 * Activate a channel: fetch its messages and merge discovered user names.
 * Eliminates the repetitive channel-switching pattern from the chat component.
 */
export async function activateChannelData(
  channelId: string,
  token: string,
  existingNames: Record<string, string>,
): Promise<{
  msgs: StoatMsg[];
  users: WsReadyUser[];
  userNames: Record<string, string>;
}> {
  const { msgs, users } = await fetchMessages(channelId, token);
  const userNames = { ...existingNames };
  for (const u of users) {
    userNames[u._id] = u.display_name || u.username || u._id;
  }
  return { msgs, users, userNames };
}

export async function fetchServerChannels(
  serverId: string,
  token: string,
): Promise<StoatChannel[]> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/servers/${encodeURIComponent(serverId)}?include_channels=true`,
      { headers: { 'x-session-token': token } },
    );
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.channels ?? []) as Array<{ _id: string; name?: string; channel_type: string; server?: string }>)
      .map(ch => ({
        _id: ch._id,
        name: ch.name,
        channel_type: ch.channel_type,
        server: ch.server ?? serverId,
      }));
  } catch {
    return [];
  }
}

export async function acceptFriendRequest(
  userId: string,
  token: string,
): Promise<boolean> {
  try {
    const r = await fetch(`${STOAT_BASE}/api/users/${userId}/friend`, {
      method: 'PUT',
      headers: { 'x-session-token': token },
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function sendFriendRequest(
  usernameWithDiscriminator: string,
  token: string,
): Promise<boolean> {
  try {
    const r = await fetch(`${STOAT_BASE}/api/users/friend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token },
      body: JSON.stringify({ username: usernameWithDiscriminator }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Revoke an outgoing friend request (also denies an incoming one).
 * Stoat native route: DELETE /users/{target}/friend
 */
export async function revokeFriendRequest(
  userId: string,
  token: string,
): Promise<boolean> {
  try {
    const r = await fetch(`${STOAT_BASE}/api/users/${encodeURIComponent(userId)}/friend`, {
      method: 'DELETE',
      headers: { 'x-session-token': token },
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Remove an existing friend (unfriend).
 * Same Stoat native route: DELETE /users/{target}/friend
 */
export async function unfriend(
  userId: string,
  token: string,
): Promise<boolean> {
  return revokeFriendRequest(userId, token);
}

export async function fetchUserBanner(
  userId: string,
  token: string,
): Promise<string | null> {
  try {
    const r = await fetch(`${STOAT_BASE}/api/users/${encodeURIComponent(userId)}/profile`, {
      headers: { 'x-session-token': token },
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.background?._id) {
      return `${STOAT_AUTUMN}/${data.background.tag}/${data.background._id}`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function uploadFile(
  file: File,
  endpoint: 'avatars' | 'backgrounds',
  token: string,
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch(`${STOAT_AUTUMN}/${endpoint}`, {
      method: 'POST',
      headers: { 'x-session-token': token },
      body: form,
    });
    if (!r.ok) return null;
    const data = await r.json();
    return ((data._id ?? data.id) as string) ?? null;
  } catch {
    return null;
  }
}

export async function editUserProfile(
  changes: {
    display_name?: string | null;
    avatar?: string | null;
    profile_background?: string | null;
    remove?: string[];
  },
  token: string,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = {};
    if ('display_name' in changes) body.display_name = changes.display_name;
    if ('avatar' in changes) body.avatar = changes.avatar;
    if ('profile_background' in changes) body.profile = { background: changes.profile_background };
    if (changes.remove) body.remove = changes.remove;
    const r = await fetch(`${STOAT_BASE}/api/users/@me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Voice channel API helpers ─────────────────────────────────────────────────

/**
 * Join a voice channel. Returns the LiveKit URL and a signed Join Token.
 * POST /0.8/channels/{channel_id}/join
 */
export async function joinVoiceChannel(
  channelId: string,
  token: string,
): Promise<VoiceJoinResponse | null> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/channels/${encodeURIComponent(channelId)}/join_call?`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': token,
        },
        body: JSON.stringify({ node: 'worldwide', force_disconnect: true }),
      },
    );
    if (!r.ok) {
      console.warn('joinVoiceChannel failed', r.status, await r.text().catch(() => ''));
      return null;
    }
    return r.json() as Promise<VoiceJoinResponse>;
  } catch {
    return null;
  }
}

/**
 * Update your own voice state (mute, deafen, video on/off).
 * PATCH /0.8/channels/{channel_id}/members/@me/voice
 */
export async function updateMyVoiceState(
  channelId: string,
  payload: VoiceStateUpdatePayload,
  token: string,
): Promise<boolean> {
  try {
    const r = await fetch(
      `${STOAT_BASE}/api/channels/${encodeURIComponent(channelId)}/members/@me/voice`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-token': token },
        body: JSON.stringify(payload),
      },
    );
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Disconnect from a voice channel — simply disconnect your LiveKit room.
 * No REST endpoint needed; this helper is provided for documentation clarity.
 * IMPORTANT: After calling room.disconnect(), the server auto-detects
 * the departure via LiveKit webhooks and broadcasts VoiceChannelLeave.
 */
export async function leaveVoiceChannel(
  _channelId: string,
  _token: string,
): Promise<boolean> {
  // LiveKit departure is detected server-side via webhook.
  // This exists as a stub in case future server-side cleanup is needed.
  return true;
}
