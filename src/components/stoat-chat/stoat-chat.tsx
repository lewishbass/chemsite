import { component$, useSignal, useStore, useVisibleTask$ } from '@builder.io/qwik';
import { LuChevronLeft, LuClock, LuPaperclip, LuPencil, LuReply, LuSmile, LuTrash2, LuUpload, LuUser, LuUserCheck, LuUserPlus, LuX } from '@qwikest/icons/lucide';
import {
  STOAT_WS, STOAT_AUTUMN, avatarUrl, ackChannel, parseContent,
  type StoatMsg, type StoatChannel, type StoatServer, type StoatMember, type StoatEmoji,
  type WsReady, type WsMessage, type WsMessageUpdate, type WsMessageDelete,
  type WsMessageReact, type WsMessageUnreact,
  type WsUserRelationship, type WsChannelCreate, type WsChannelStartTyping, type WsChannelStopTyping,
  type WsChannelAck, type WsEvent, type StoatChatState, type PresenceStatus,
  fetchMessages, sendMessage, fetchServerMembers, openDMChannel, sendFriendRequest, acceptFriendRequest,
  uploadAttachment, deleteMessage, editMessage, reactToMessage, unreactFromMessage, fetchServerChannels,
} from './stoat_scripts';

export type { StoatChatState };

function isEmojiOnly(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  let s = t.replace(/:([0-9A-Z]{26}):/g, '');
  s = s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}][\uFE0F\u200D\p{Emoji_Modifier}]*/gu, '');
  s = s.replace(/[\uFE0F\uFE0E\u200D\s]/gu, '');
  return s.length === 0;
}

const QUICK_EMOJI = ['👍', '👎', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀', '✅'];

const presenceColor = (p: PresenceStatus | undefined | null): string => {
  switch (p) {
    case 'Online': return 'bg-green-500';
    case 'Idle':   return 'bg-yellow-400';
    case 'Busy':   return 'bg-red-500';
    case 'Focus':  return 'bg-purple-500';
    default:       return 'bg-gray-500';
  }
};

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

export const StoatChat = component$<{ token: string; chatState: StoatChatState }>(({ token, chatState }) => {
  const status = useSignal<'connecting' | 'ready' | 'error'>('connecting');
  const servers = useSignal<StoatServer[]>([]);
  const channels = useSignal<StoatChannel[]>([]);
  const activeId = useSignal('');
  const activeName = useSignal('');
  const messages = useSignal<StoatMsg[]>([]);
  const inputText = useSignal('');
  const sending = useSignal(false);
  const msgsEl = useSignal<Element>();
  const members = useSignal<StoatMember[]>([]);
  const membersServerId = useSignal('');
  const wsRef = useSignal<WebSocket | null>(null);
  const unreadChannels = useStore<Record<string, boolean>>({});   // channelId → has unread
  const typingByChannel = useStore<Record<string, string[]>>({}); // channelId → typing userIds
  const typingTimeoutId = useSignal<ReturnType<typeof setTimeout> | null>(null);
  const replyTo = useSignal<StoatMsg | null>(null);
  const editingMsgId = useSignal('');
  const editingContent = useSignal('');
  const emojiPickerFor = useSignal('');
  const pendingAttachmentIds = useSignal<string[]>([]);
  const pendingAttachmentPreviews = useSignal<Array<{id: string; name: string; isImage: boolean; url: string}>>([]);
  const fileUploading = useSignal(false);
  const isDragOver = useSignal(false);
  const mainPanelRef = useSignal<Element>();
  const newMsgCount = useSignal(0); // incremented only when a new message arrives; drives auto-scroll
  const notifTitle = useSignal(''); // drives document title ticker; cleared when tab regains focus
  const leftOpen = useSignal(true);
  const rightOpen = useSignal(true);
  const outerRef = useSignal<Element>();

  const input_style = "w-full rounded-lg px-6 py-2 active:outline-none focus:ring-none focus:outline-none focus:bg-(--color-canvas)/50 transition-colors duration-300 text-(--color-ink)";


  // Auto-scroll to bottom only when new messages arrive (not on reactions/edits)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => newMsgCount.value);
    if (msgsEl.value) {
      msgsEl.value.scrollTop = msgsEl.value.scrollHeight;
    }
  });

  // WebSocket lifecycle — runs once when the component enters the viewport
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    if (!token) {
      status.value = 'error';
      return;
    }

    const ws = new WebSocket(STOAT_WS);
    wsRef.value = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'Authenticate', token }));

    ws.onmessage = async (rawEvt: MessageEvent) => {
      let evt: WsEvent;
      try {
        evt = JSON.parse(rawEvt.data as string) as WsEvent;
      } catch {
        return;
      }

      if (evt.type === 'Ready') {
        const ready = evt as WsReady;

        // Build userNames map and extract relationships from the initial user list
        const names: Record<string, string> = { ...chatState.userNames };
        const newAvatars: Record<string, string> = { ...chatState.userAvatars };
        const newRels: typeof chatState.relations = [];
        for (const u of ready.users ?? []) {
          names[u._id] = u.display_name || u.username || u._id;
          const av = avatarUrl(u.avatar);
          if (av) newAvatars[u._id] = av;
          if (u.relationship && u.relationship !== 'None' && u.relationship !== 'User') {
            newRels.push({ _id: u._id, status: u.relationship });
          }
        }
        chatState.userNames = names;
        chatState.userAvatars = newAvatars;
        if (newRels.length) chatState.relations = newRels;

        // Populate emoji map from Ready payload
        const emojiMap: Record<string, StoatEmoji> = {};
        for (const e of ready.emojis ?? []) emojiMap[e._id] = e;
        if (Object.keys(emojiMap).length) chatState.serverEmojis = emojiMap;

        chatState.wsReady = true;
        chatState.joinedServers = ready.servers ?? [];
        servers.value = ready.servers ?? [];
        channels.value = ready.channels ?? [];

        // Auto-select: try saved channel first, then fall back to first text channel
        const savedChannelId = typeof localStorage !== 'undefined' ? localStorage.getItem('stoat-activeChannelId') : null;
        const allChannels = ready.channels ?? [];
        const first = (savedChannelId ? (allChannels.find(c => c._id === savedChannelId) ?? allChannels.find(c => c.channel_type === 'TextChannel')) : allChannels.find(c => c.channel_type === 'TextChannel'));
        if (first) {
          activeId.value = first._id;
          activeName.value = first.name ?? '';
          const { msgs, users } = await fetchMessages(first._id, token);
          if (users.length) {
            const n = { ...chatState.userNames };
            for (const u of users) n[u._id] = u.display_name || u.username || u._id;
            chatState.userNames = n;
          }
          messages.value = msgs;
          if (msgs.length) { ackChannel(first._id, msgs[msgs.length - 1]._id, token); newMsgCount.value++; }
        }
        status.value = 'ready';

      } else if (evt.type === 'Message') {
        const msg = evt as WsMessage;
        if (msg.channel === activeId.value) {
          messages.value = [...messages.value, {
            _id: msg._id,
            content: msg.content,
            author: msg.author,
            channel: msg.channel,
            attachments: msg.attachments,
            replies: msg.replies,
          }];
          newMsgCount.value++;
          // Auto-ack messages received while viewing the channel
          ackChannel(msg.channel, msg._id, token);
        } else {
          // Mark background channel as having unread messages
          unreadChannels[msg.channel] = true;
        }
        // Title ticker + browser notification when the tab is hidden
        if (msg.author !== chatState.currentUserId && document.hidden) {
          const senderName = chatState.userNames[msg.author] ?? 'Someone';
          const ch = channels.value.find(c => c._id === msg.channel);
          const isDM = ch?.channel_type === 'DirectMessage';
          const svName = !isDM && ch?.server
            ? (servers.value.find(s => s._id === ch!.server)?.name ?? ch?.name)
            : null;
          notifTitle.value = isDM
            ? `new message from ${senderName}`
            : `new message in ${svName ?? ch?.name ?? 'chat'}`;
          if ('Notification' in window && Notification.permission === 'granted') {
            const body = msg.content?.slice(0, 100)
              ?? (msg.attachments?.length ? '📎 Sent an attachment' : '…');
            try {
              const n = new Notification(senderName, {
                body,
                icon: chatState.userAvatars[msg.author] ?? undefined,
                tag: msg.channel, // collapse multiple messages from the same channel
              });
              n.onclick = () => window.focus();
            } catch { /* unsupported context (e.g. Firefox private mode) */ }
          }
        }

      } else if (evt.type === 'ChannelStartTyping') {
        const t = evt as WsChannelStartTyping;
        const cur = typingByChannel[t.id] ?? [];
        if (!cur.includes(t.user)) typingByChannel[t.id] = [...cur, t.user];

      } else if (evt.type === 'ChannelStopTyping') {
        const t = evt as WsChannelStopTyping;
        typingByChannel[t.id] = (typingByChannel[t.id] ?? []).filter(u => u !== t.user);

      } else if (evt.type === 'ChannelAck') {
        const ack = evt as WsChannelAck;
        if (ack.user === chatState.currentUserId) {
          delete unreadChannels[ack.id];
        }

      } else if (evt.type === 'MessageUpdate') {
        const upd = evt as WsMessageUpdate;
        if (upd.channel === activeId.value) {
          messages.value = messages.value.map((m) =>
            m._id === upd.id
              ? { ...m, content: upd.data?.content ?? m.content }
              : m
          );
        }

      } else if (evt.type === 'MessageDelete') {
        const del = evt as WsMessageDelete;
        if (del.channel === activeId.value) {
          messages.value = messages.value.filter((m) => m._id !== del.id);
        }
      } else if (evt.type === 'MessageReact') {
        const r = evt as WsMessageReact;
        if (r.channel_id === activeId.value) {
          messages.value = messages.value.map((m) => {
            if (m._id !== r.id) return m;
            const reactions = { ...(m.reactions ?? {}) };
            reactions[r.emoji_id] = [...(reactions[r.emoji_id] ?? []).filter(u => u !== r.user_id), r.user_id];
            return { ...m, reactions };
          });
        }
      } else if (evt.type === 'MessageUnreact') {
        const r = evt as WsMessageUnreact;
        if (r.channel_id === activeId.value) {
          messages.value = messages.value.map((m) => {
            if (m._id !== r.id) return m;
            const reactions = { ...(m.reactions ?? {}) };
            const users = (reactions[r.emoji_id] ?? []).filter(u => u !== r.user_id);
            if (users.length) reactions[r.emoji_id] = users;
            else delete reactions[r.emoji_id];
            return { ...m, reactions };
          });
        }
      } else if (evt.type === 'UserRelationship') {
        const rel = evt as WsUserRelationship;
        const u = rel.user;
        if (u?._id) {
          chatState.userNames = { ...chatState.userNames, [u._id]: u.display_name || u.username || u._id };
          const av = avatarUrl(u.avatar);
          if (av) chatState.userAvatars = { ...chatState.userAvatars, [u._id]: av };
        }
        const filtered = chatState.relations.filter(r => r._id !== rel.id);
        chatState.relations = rel.status !== 'None' && rel.status !== 'User'
          ? [...filtered, { _id: rel.id, status: rel.status }]
          : filtered;
      } else if (evt.type === 'ChannelCreate') {
        const ch = evt as WsChannelCreate;
        if (!channels.value.some(c => c._id === ch._id)) {
          channels.value = [...channels.value, {
            _id: ch._id, name: ch.name, channel_type: ch.channel_type,
            server: ch.server, recipients: ch.recipients,
          }];
        }
      }
    };

    ws.onerror = () => {
      status.value = 'error';
    };

    cleanup(() => {
      wsRef.value = null;
      try { ws.close(); } catch { /* ignore */ }
    });
  });

  // Switch to the server selected via the private-servers grid in the parent
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const serverId = track(() => chatState.activeServerId);
    const currentStatus = track(() => status.value);
    if (!serverId || currentStatus !== 'ready') return;

    // Try to find an already-loaded channel for this server.
    // If not found, the server may have just been joined — fetch its channels now
    // rather than waiting for the joinedServers sync task (registered later).
    let ch = channels.value.find(
      (c) => c.server === serverId && c.channel_type === 'TextChannel'
    );
    if (!ch) {
      if (!servers.value.some(s => s._id === serverId)) {
        const sv = chatState.joinedServers.find(s => s._id === serverId);
        if (sv) servers.value = [...servers.value, sv];
      }
      const newChs = await fetchServerChannels(serverId, token);
      if (newChs.length) {
        channels.value = [
          ...channels.value,
          ...newChs.filter(c => !channels.value.some(e => e._id === c._id)),
        ];
        ch = newChs.find(c => c.channel_type === 'TextChannel');
      }
    }
    if (!ch || ch._id === activeId.value) return;

    activeId.value = ch._id;
    activeName.value = ch.name ?? '';
    messages.value = [];
    const { msgs, users } = await fetchMessages(ch._id, token);
    if (users.length) {
      const n = { ...chatState.userNames };
      for (const u of users) n[u._id] = u.display_name || u.username || u._id;
      chatState.userNames = n;
    }
    messages.value = msgs;
    if (msgs.length) {
      ackChannel(ch._id, msgs[msgs.length - 1]._id, token);
      delete unreadChannels[ch._id];
    }
    newMsgCount.value++;
  });

  // Activate DM channel from parent (friends list click in index.tsx)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const userId = track(() => chatState.activeDmUserId);
    track(() => chatState.activeDmSeq);
    const currentStatus = track(() => status.value);
    if (!userId || currentStatus !== 'ready') return;

    let dmCh = channels.value.find(
      c => c.channel_type === 'DirectMessage' && c.recipients?.includes(userId)
    );
    if (!dmCh) {
      const created = await openDMChannel(userId, token);
      if (!created) return;
      dmCh = created;
      channels.value = [...channels.value, created];
    }

    activeId.value = dmCh._id;
    activeName.value = chatState.userNames[userId] ?? 'Direct Message';
    messages.value = [];
    const { msgs: dmMsgs, users: dmUsers } = await fetchMessages(dmCh._id, token);
    if (dmUsers.length) {
      const n = { ...chatState.userNames };
      for (const u of dmUsers) n[u._id] = u.display_name || u.username || u._id;
      chatState.userNames = n;
    }
    messages.value = dmMsgs;
    if (dmMsgs.length) {
      ackChannel(dmCh._id, dmMsgs[dmMsgs.length - 1]._id, token);
      delete unreadChannels[dmCh._id];
    }
    newMsgCount.value++;
  });

  // Sync servers joined after the initial WS Ready (e.g. via invite from parent)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const joinedCount = track(() => chatState.joinedServers.length);
    const currentStatus = track(() => status.value);
    if (currentStatus !== 'ready' || joinedCount === 0) return;

    for (const sv of chatState.joinedServers) {
      if (!servers.value.some(s => s._id === sv._id)) {
        servers.value = [...servers.value, sv];
        const newChs = await fetchServerChannels(sv._id, token);
        if (newChs.length) {
          channels.value = [
            ...channels.value,
            ...newChs.filter(c => !channels.value.some(e => e._id === c._id)),
          ];
        }
      }
    }
  });

  // Fetch server members when the active channel changes
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const channelId = track(() => activeId.value);
    const currentStatus = track(() => status.value);
    if (!channelId || currentStatus !== 'ready') return;

    const activeCh = channels.value.find(c => c._id === channelId);
    const serverId = activeCh?.server;
    if (!serverId) { members.value = []; membersServerId.value = ''; return; }
    if (serverId === membersServerId.value) return;

    membersServerId.value = serverId;
    const fetchedMembers = await fetchServerMembers(serverId, token);
    // Cache avatars discovered from server member list
    if (fetchedMembers.length) {
      const avs = { ...chatState.userAvatars };
      for (const m of fetchedMembers) {
        const file = m.avatar ?? m.userAvatar;
        const url = avatarUrl(file);
        if (url) avs[m._id.user] = url;
      }
      chatState.userAvatars = avs;
    }
    members.value = fetchedMembers;
  });

  // Request notification permission; restore title and clear ticker when the tab regains focus
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { /* permission denied */ });
    }
    const originalTitle = document.title;
    const clearNotif = () => {
      if (!document.hidden) {
        notifTitle.value = '';
        document.title = originalTitle;
      }
    };
    document.addEventListener('visibilitychange', clearNotif);
    window.addEventListener('focus', clearNotif);
    cleanup(() => {
      document.removeEventListener('visibilitychange', clearNotif);
      window.removeEventListener('focus', clearNotif);
      document.title = originalTitle;
    });
  });

  // Scroll document title ticker while there is an unread notification
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const title = track(() => notifTitle.value);
    if (!title) return;
    // Build the scrolling string: "🔴 new message in Lab        " and rotate it
    const full = `${title}        `;
    let pos = 0;
    const id = setInterval(() => {
      document.title = "🔴" + full.slice(pos) + full.slice(0, pos);
      pos = (pos + 1) % full.length;
    }, 50);
    cleanup(() => clearInterval(id));
  });

  // Save active channel to localStorage
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const id = track(() => activeId.value);
    if (id) localStorage.setItem('stoat-activeChannelId', id);
  });

  // Collapse sidebars when component is narrower than 700px
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const el = track(() => outerRef.value);
    if (!el) return;
    const check = () => {
      if (el.clientWidth < 700) {
        leftOpen.value = false;
        rightOpen.value = false;
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    cleanup(() => ro.disconnect());
  });

  // Native drag counter for reliable drag-over visual feedback
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const el = track(() => mainPanelRef.value);
    if (!el) return;
    let counter = 0;
    const onEnter = () => { counter++; isDragOver.value = true; };
    const onLeave = () => { if (--counter <= 0) { counter = 0; isDragOver.value = false; } };
    const onDrop  = () => { counter = 0; isDragOver.value = false; };
    el.addEventListener('dragenter', onEnter);
    el.addEventListener('dragleave', onLeave);
    el.addEventListener('drop',      onDrop);
    cleanup(() => {
      el.removeEventListener('dragenter', onEnter);
      el.removeEventListener('dragleave', onLeave);
      el.removeEventListener('drop',      onDrop);
    });
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={outerRef} class="relative flex h-[90vh] overflow-hidden bg-(--color-surface) rounded-lg">

      {/* ── Left sidebar toggle ── */}
      <button
        class="absolute top-2.75 left-30 z-40 p-1 rounded hover:bg-(--color-canvas) text-muted hover:text-ink cursor-pointer transition-colors duration-200"
        onClick$={() => { leftOpen.value = !leftOpen.value; }}
        title={leftOpen.value ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <LuChevronLeft class={`h-4 w-4${leftOpen.value ? '' : ' rotate-180'}`} />
      </button>

      {/* ── Right sidebar toggle ── */}
      {status.value === 'ready' && membersServerId.value && (
        <button
          class="absolute top-2.75 right-2 z-40 p-1 rounded hover:bg-(--color-canvas) text-muted hover:text-ink cursor-pointer transition-colors duration-200"
          onClick$={() => { rightOpen.value = !rightOpen.value; }}
          title={rightOpen.value ? 'Collapse members' : 'Expand members'}
        >
          <LuChevronLeft class={`h-4 w-4${!rightOpen.value ? '' : ' rotate-180'}`} />
        </button>
      )}

      {/* ── Sidebar: server + channel list ── */}
      {leftOpen.value && <aside class="w-[150px] shrink-0 border-r border-(--color-rim) overflow-y-auto py-2">
        {status.value === 'connecting' && (
          <p class="px-3 py-2 text-xs text-muted italic">Connecting…</p>
        )}

        {status.value === 'ready' && servers.value.length === 0 && (
          <p class="px-3 py-2 text-xs text-muted italic">No servers joined.</p>
        )}

        {servers.value.map((sv) => (
          <div key={sv._id} class="mb-2">
            <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted truncate">
              {sv.name}
            </p>
            {channels.value
              .filter((c) => c.server === sv._id && c.channel_type === 'TextChannel')
              .map((ch) => (
                <button
                  key={ch._id}
                  class={[
                    'w-full text-left px-2 py-1.5 text-sm transition-colors leading-tight flex items-center gap-1',
                    activeId.value === ch._id
                      ? 'bg-(--color-edge)/50 text-ink font-medium'
                      : 'text-muted hover:text-ink hover:bg-(--color-edge) cursor-pointer',
                  ].join(' ')}
                  onClick$={async () => {
                    if (activeId.value === ch._id) return;
                    activeId.value = ch._id;
                    activeName.value = ch.name ?? '';
                    messages.value = [];
                    const { msgs, users } = await fetchMessages(ch._id, token);
                    if (users.length) {
                      const n = { ...chatState.userNames };
                      for (const u of users) n[u._id] = u.display_name || u.username || u._id;
                      chatState.userNames = n;
                    }
                    messages.value = msgs;
                    if (msgs.length) {
                      ackChannel(ch._id, msgs[msgs.length - 1]._id, token);
                      delete unreadChannels[ch._id];
                    }
                    newMsgCount.value++;
                  }}
                >
                  <span class="flex-1 truncate"># {ch.name}</span>
                  {unreadChannels[ch._id] && <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-green-400" />}
                </button>
              ))}
          </div>
        ))}

        {/* DM channels */}
        {channels.value.some(c => c.channel_type === 'DirectMessage') && (
          <div class="mb-2 mt-2 border-t border-(--color-rim) pt-2">
            <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted truncate">Direct Messages</p>
            {channels.value
              .filter(c => c.channel_type === 'DirectMessage')
              .map(ch => {
                const otherId = ch.recipients?.find(id => id !== chatState.currentUserId) ?? ch.recipients?.[0] ?? '';
                const name = chatState.userNames[otherId] ?? 'DM';
                const av = chatState.userAvatars[otherId];
                return (
                  <button
                    key={ch._id}
                    class={[
                      'w-full text-left px-2 py-1.5 text-sm truncate transition-colors leading-tight flex items-center gap-2',
                      activeId.value === ch._id
                        ? 'bg-(--color-edge)/50 text-ink font-medium'
                        : 'text-muted hover:text-ink hover:bg-(--color-edge) cursor-pointer',
                    ].join(' ')}
                    onClick$={async () => {
                      if (activeId.value === ch._id) return;
                      activeId.value = ch._id;
                      activeName.value = name;
                      messages.value = [];
                      const { msgs, users } = await fetchMessages(ch._id, token);
                      if (users.length) {
                        const n = { ...chatState.userNames };
                        for (const u of users) n[u._id] = u.display_name || u.username || u._id;
                        chatState.userNames = n;
                      }
                      messages.value = msgs;
                      if (msgs.length) {
                        ackChannel(ch._id, msgs[msgs.length - 1]._id, token);
                        delete unreadChannels[ch._id];
                      }
                      newMsgCount.value++;
                    }}
                  >
                    <span class="shrink-0 w-5 h-5 rounded-full overflow-hidden bg-(--color-surface) border border-(--color-rim) flex items-center justify-center">
                      {av
                        ? <img src={av} alt={name} class="w-full h-full object-cover" />
                        : <LuUser class="h-3 w-3 text-muted" />}
                    </span>
                    <span class="truncate">@ {name}</span>
                    {unreadChannels[ch._id] && <span class="shrink-0 ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />}
                  </button>
                );
              })}
          </div>
        )}

        {/* Outgoing friend requests */}
        {chatState.relations.some(r => r.status === 'Outgoing') && (
          <div class="mb-2 mt-2 border-t border-(--color-rim) pt-2">
            <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted truncate">Pending</p>
            {chatState.relations.filter(r => r.status === 'Outgoing').map(rel => (
              <div key={rel._id} class="flex items-center gap-2 px-3 py-1.5">
                <span class="shrink-0 w-2 h-2 rounded-full bg-gray-500" />
                <span class="flex-1 text-xs text-muted truncate italic">{chatState.userNames[rel._id] ?? rel._id}</span>
                <span title="Request sent"><LuClock class="shrink-0 h-3 w-3 text-muted opacity-60" /></span>
              </div>
            ))}
          </div>
        )}

        {/* Incoming friend requests */}
        {chatState.relations.some(r => r.status === 'Incoming') && (
          <div class="mb-2 mt-2 border-t border-(--color-rim) pt-2">
            <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted truncate">Requests</p>
            {chatState.relations.filter(r => r.status === 'Incoming').map(rel => (
              <button
                key={rel._id}
                class="w-full text-left px-3 py-1.5 text-xs text-muted hover:text-ink hover:bg-(--color-edge) transition-colors cursor-pointer"
                onClick$={async () => {
                  const ok = await acceptFriendRequest(rel._id, token);
                  if (ok) {
                    chatState.relations = chatState.relations.map(r =>
                      r._id === rel._id ? { ...r, status: 'Friend' as const } : r
                    );
                    chatState.activeDmUserId = rel._id;
                    chatState.activeDmSeq = (chatState.activeDmSeq ?? 0) + 1;
                  }
                }}
              >
                ✓ {chatState.userNames[rel._id] ?? rel._id}
              </button>
            ))}
          </div>
        )}
      </aside>}

      {/* ── Main panel ── */}
      <div
        ref={mainPanelRef}
        class="flex-1 flex flex-col min-w-0 relative"
        preventdefault:dragover
        preventdefault:drop
        onDrop$={async (e) => {
          if (status.value !== 'ready') return;
          const files = Array.from((e as DragEvent).dataTransfer?.files ?? []);
          if (!files.length || !token) return;
          fileUploading.value = true;
          for (const file of files) {
            const id = await uploadAttachment(file, token);
            if (id) {
              pendingAttachmentIds.value = [...pendingAttachmentIds.value, id];
              pendingAttachmentPreviews.value = [...pendingAttachmentPreviews.value, {
                id, name: file.name, isImage: file.type.startsWith('image/'),
                url: URL.createObjectURL(file),
              }];
            }
          }
          fileUploading.value = false;
        }}
      >
        {/* Drag-and-drop overlay */}
        {isDragOver.value && status.value === 'ready' && (
          <div class="absolute inset-0 z-50 bg-(--color-accent)/10 border-2 border-dashed border-(--color-accent) rounded-r-lg flex flex-col items-center justify-center pointer-events-none">
            <LuUpload class="h-12 w-12 text-(--color-accent) mb-3" />
            <p class="text-(--color-accent) font-semibold text-lg">Drop files to upload</p>
            <p class="text-(--color-accent)/70 text-sm mt-1">Images and files supported</p>
          </div>
        )}

        {status.value === 'connecting' && (
          <div class="flex-1 flex items-center justify-center">
            <p class="text-muted text-sm animate-pulse">Connecting to chat…</p>
          </div>
        )}

        {status.value === 'error' && (
          <div class="flex-1 flex items-center justify-center px-8 text-center">
            <p class="text-red-400 text-sm">Could not connect to the chat server.</p>
          </div>
        )}

        {status.value === 'ready' && (
          <>
            {/* Channel header */}
            <header class="shrink-0 h-11 px-4 flex items-center gap-2 border-b border-(--color-edge)">
              <span class="text-muted font-mono text-sm">#</span>
              <span class="text-ink font-semibold text-sm">{activeName.value || 'general'}</span>
            </header>

            {/* Message list */}
            <div
              ref={msgsEl}
              class="flex-1 overflow-y-auto mini-scroll p-4 flex flex-col gap-2"
            >
              {messages.value.length === 0 && (
                <p class="text-muted text-sm italic">No messages yet.</p>
              )}
              {messages.value.map((msg, idx) => {
                const isGrouped = idx > 0 && messages.value[idx - 1].author === msg.author;
                return (
                  <div key={msg._id} class={`group/msg relative hover:bg-(--color-edge)/10 rounded-md px-1 -mx-1 pt-0.5 ${isGrouped ? '-mt-3' : ''}`}>

                  {/* Hover action toolbar */}
                  <div class="absolute right-1 -top-3 hidden group-hover/msg:flex items-center gap-0.5 bg-(--color-surface) border border-(--color-rim) rounded-lg px-1.5 py-1 shadow-md z-20">
                    <button class="p-1 rounded hover:bg-(--color-edge) text-muted hover:text-ink transition-colors cursor-pointer" title="React with emoji"
                      onClick$={() => { emojiPickerFor.value = emojiPickerFor.value === msg._id ? '' : msg._id; }}>
                      <LuSmile class="h-3.5 w-3.5" />
                    </button>
                    <button class="p-1 rounded hover:bg-(--color-edge) text-muted hover:text-ink transition-colors cursor-pointer" title="Reply"
                      onClick$={() => { replyTo.value = msg; emojiPickerFor.value = ''; }}>
                      <LuReply class="h-3.5 w-3.5" />
                    </button>
                    {msg.author === chatState.currentUserId && (
                      <>
                        <button class="p-1 rounded hover:bg-(--color-edge) text-muted hover:text-ink transition-colors cursor-pointer" title="Edit"
                          onClick$={() => { editingMsgId.value = msg._id; editingContent.value = msg.content ?? ''; emojiPickerFor.value = ''; }}>
                          <LuPencil class="h-3.5 w-3.5" />
                        </button>
                        <button class="p-1 rounded hover:bg-(--color-edge) text-red-400/70 hover:text-red-400 transition-colors cursor-pointer" title="Delete"
                          onClick$={async () => { await deleteMessage(activeId.value, msg._id, token); }}>
                          <LuTrash2 class="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Emoji picker popover */}
                  {emojiPickerFor.value === msg._id && (
                    <div class="absolute right-1 top-5 z-30 bg-(--color-surface) border border-(--color-rim) rounded-xl p-2 shadow-xl max-w-[220px]">
                      <div class="flex flex-wrap gap-1 pb-1">
                        {QUICK_EMOJI.map(e => (
                          <button key={e} class="p-1 rounded hover:bg-(--color-edge) text-xl leading-none cursor-pointer" onClick$={async () => {
                            emojiPickerFor.value = '';
                            await reactToMessage(activeId.value, msg._id, e, token);
                          }}>{e}</button>
                        ))}
                      </div>
                      {Object.keys(chatState.serverEmojis).length > 0 && (
                        <div class="flex flex-wrap gap-1 border-t border-(--color-rim) pt-1">
                          {Object.values(chatState.serverEmojis).slice(0, 24).map(e => (
                            <button key={e._id} class="p-0.5 rounded hover:bg-(--color-edge) cursor-pointer" title={e.name} onClick$={async () => {
                              emojiPickerFor.value = '';
                              await reactToMessage(activeId.value, msg._id, e._id, token);
                            }}>
                              <img src={`${STOAT_AUTUMN}/emojis/${e._id}`} alt={e.name} class="h-6 w-6" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reply reference */}
                  {(msg.replies?.length ?? 0) > 0 && (
                    <div class="flex items-center gap-1 ml-2 mb-0.5 text-xs text-muted">
                      <LuReply class="h-3 w-3 shrink-0 opacity-50 scale-x-[-1]" />
                      <span class="italic truncate">
                        {(() => {
                          const ref = messages.value.find(m => m._id === msg.replies![0]);
                          const refAuthor = ref ? (chatState.userNames[ref.author] ?? 'Unknown') : 'Unknown';
                          const refPreview = ref?.content?.slice(0, 60) ?? (ref?.attachments?.length ? '[attachment]' : '…');
                          return `${refAuthor}: ${refPreview}`;
                        })()}
                      </span>
                    </div>
                  )}

                    {/* Author — hidden for consecutive messages from the same person */}
                    {!isGrouped && (
                      <p class="text-xs font-semibold text-(--color-accent-muted) mb-0.5">
                        {chatState.userNames[msg.author] ?? msg.author}
                      </p>
                    )}

                  {/* Content — edit mode or normal */}
                  {editingMsgId.value === msg._id ? (
                    <div class="flex items-center gap-2 mb-1">
                      <input
                        class="flex-1 rounded px-2 py-1 text-sm bg-(--color-edge) text-ink border border-(--color-rim) focus:outline-none"
                        value={editingContent.value}
                        onInput$={(_, el) => editingContent.value = el.value}
                        onKeyDown$={async (e) => {
                          if (e.key === 'Escape') { editingMsgId.value = ''; return; }
                          if (e.key !== 'Enter' || e.shiftKey) return;
                          const newContent = editingContent.value.trim();
                          if (!newContent) return;
                          const ok = await editMessage(activeId.value, msg._id, newContent, token);
                          if (ok) messages.value = messages.value.map(m => m._id === msg._id ? { ...m, content: newContent } : m);
                          editingMsgId.value = '';
                        }}
                      />
                      <button class="text-xs text-muted hover:text-ink shrink-0" onClick$={() => { editingMsgId.value = ''; }}>
                        <LuX class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const emojiOnly = isEmojiOnly(msg.content ?? '');
                      return (
                        <p class={`text-sm text-ink whitespace-pre-wrap break-words leading-relaxed${emojiOnly ? ' !text-5xl !leading-tight' : ''}`}>
                          {parseContent(msg.content ?? '', chatState.serverEmojis).map(part =>
                            part.type === 'text' ? (
                              <span key={part.key}>{part.text}</span>
                            ) : (
                              <img
                                key={part.key}
                                src={`${STOAT_AUTUMN}/emojis/${part.id}`}
                                alt={`:${part.name}:`}
                                title={`:${part.name}:`}
                                class={`inline-block align-text-bottom mx-0.5${emojiOnly ? ' h-16 w-16' : ' h-5 w-5'}`}
                              />
                            )
                          )}
                        </p>
                      );
                    })()
                  )}

                  {/* Attachments */}
                  {(msg.attachments?.length ?? 0) > 0 && (
                    <div class="mt-1 flex flex-wrap gap-2">
                      {msg.attachments!.map(att => (
                        att.metadata?.type === 'Image' ? (
                          <img
                            key={att._id}
                            src={`${STOAT_AUTUMN}/attachments/${att._id}`}
                            alt={att.filename ?? 'Image'}
                            class="max-w-[300px] max-h-[220px] rounded-lg object-contain border border-(--color-rim) cursor-pointer"
                            loading="lazy"
                          />
                        ) : (
                          <a
                            key={att._id}
                            href={`${STOAT_AUTUMN}/attachments/${att._id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--color-edge) border border-(--color-rim) text-xs text-ink hover:bg-(--color-canvas) transition-colors"
                          >
                            📎 {att.filename ?? 'File'}{att.size ? ` (${Math.round(att.size / 1024)}KB)` : ''}
                          </a>
                        )
                      ))}
                    </div>
                  )}

                  {/* Reactions */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div class="flex flex-wrap gap-1 mt-1.5 mb-0.5">
                      {Object.entries(msg.reactions).map(([emojiId, userIds]) => {
                        const mine = userIds.includes(chatState.currentUserId);
                        const isCustomEmoji = /^[0-9A-Z]{26}$/.test(emojiId);
                        return (
                          <button
                            key={emojiId}
                            class={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors cursor-pointer ${
                              mine
                                ? 'bg-(--color-accent-muted)/15 border-(--color-accent-muted)/40 text-ink'
                                : 'bg-(--color-edge)/60 border-(--color-rim) text-muted hover:text-ink hover:bg-(--color-edge)'
                            }`}
                            onClick$={async () => {
                              if (mine) await unreactFromMessage(activeId.value, msg._id, emojiId, token);
                              else await reactToMessage(activeId.value, msg._id, emojiId, token);
                            }}
                          >
                            {isCustomEmoji
                              ? <img src={`${STOAT_AUTUMN}/emojis/${emojiId}`} alt={emojiId} class="h-3.5 w-3.5" />
                              : <span class="leading-none">{emojiId}</span>
                            }
                            <span>{userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            

            {/* Typing indicator */}
            <div class="max-h-0">
            {(typingByChannel[activeId.value] ?? []).length > 0 && (
              <div class="shrink-0 px-4 py-1 text-xs text-muted italic select-none relative -mt-6">
                {(() => {
                  const names = (typingByChannel[activeId.value] ?? []).map(uid => chatState.userNames[uid] ?? 'Someone');
                  if (names.length === 1) return `${names[0]} is typing…`;
                  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
                  return `${names.length} people are typing…`;
                })()}
              </div>
              )}
              </div>

            {/* Attachment previews */}
            {pendingAttachmentPreviews.value.length > 0 && (
              <div class="shrink-0 px-4 pt-2 flex flex-wrap gap-2 border-t border-(--color-rim)/50">
                {pendingAttachmentPreviews.value.map((att, i) => (
                  <div key={att.id} class="relative">
                    {att.isImage ? (
                      <img src={att.url} alt={att.name} class="h-16 w-16 rounded-md object-cover border border-(--color-rim)" />
                    ) : (
                      <div class="h-12 px-3 flex items-center gap-2 rounded-md bg-(--color-edge) border border-(--color-rim) text-xs text-ink max-w-[120px]">
                        📎 <span class="truncate">{att.name}</span>
                      </div>
                    )}
                    <button
                      class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center"
                      onClick$={() => {
                        pendingAttachmentIds.value = pendingAttachmentIds.value.filter((_, j) => j !== i);
                        pendingAttachmentPreviews.value = pendingAttachmentPreviews.value.filter((_, j) => j !== i);
                      }}
                    ><LuX class="h-2.5 w-2.5" /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Reply bar */}
            {replyTo.value && (
              <div class="shrink-0 px-4 py-1.5 border-t border-(--color-rim)/50 flex items-center gap-2 text-xs">
                <LuReply class="h-3.5 w-3.5 shrink-0 text-muted" />
                <span class="text-muted">Replying to</span>
                <span class="font-semibold text-ink">{chatState.userNames[replyTo.value.author] ?? replyTo.value.author}</span>
                <span class="flex-1 truncate text-muted italic">"{replyTo.value.content?.slice(0, 60) ?? ''}"</span>
                <button class="shrink-0 ml-auto text-muted hover:text-ink transition-colors" title="Cancel reply"
                  onClick$={() => { replyTo.value = null; }}>
                  <LuX class="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Send input */}
            <div class="shrink-0 flex border-t border-(--color-rim) border-dashed">
              <label class={`shrink-0 px-3 flex items-center cursor-pointer transition-colors ${fileUploading.value ? 'opacity-40 pointer-events-none text-muted' : 'text-muted hover:text-ink'}`} title="Attach file">
                <LuPaperclip class="h-4 w-4" />
                <input type="file" class="sr-only" multiple onChange$={async (_, el) => {
                  const files = Array.from(el.files ?? []);
                  if (!files.length || !token) return;
                  fileUploading.value = true;
                  for (const file of files) {
                    const id = await uploadAttachment(file, token);
                    if (id) {
                      pendingAttachmentIds.value = [...pendingAttachmentIds.value, id];
                      pendingAttachmentPreviews.value = [...pendingAttachmentPreviews.value, {
                        id, name: file.name, isImage: file.type.startsWith('image/'),
                        url: URL.createObjectURL(file),
                      }];
                    }
                  }
                  fileUploading.value = false;
                  el.value = '';
                }} />
              </label>
              <input
                type="text"
                placeholder={`Message #${activeName.value || 'general'}…`}

                class={input_style + " -mr-[2px]"}
                value={inputText.value}
                onInput$={(_, el) => {
                  inputText.value = el.value;
                  const ws = wsRef.value;
                  const chId = activeId.value;
                  if (ws && chId) {
                    ws.send(JSON.stringify({ type: 'BeginTyping', channel: chId }));
                    if (typingTimeoutId.value !== null) clearTimeout(typingTimeoutId.value);
                    typingTimeoutId.value = setTimeout(() => {
                      wsRef.value?.send(JSON.stringify({ type: 'EndTyping', channel: chId }));
                      typingTimeoutId.value = null;
                    }, 2500) as unknown as ReturnType<typeof setTimeout>;
                  }
                }}
                onKeyDown$={async (e) => {
                  if (e.key !== 'Enter' || e.shiftKey || sending.value) return;
                  const content = inputText.value.trim();
                  if ((!content && !pendingAttachmentIds.value.length) || !activeId.value) return;
                  inputText.value = '';
                  sending.value = true;
                  if (typingTimeoutId.value !== null) { clearTimeout(typingTimeoutId.value); typingTimeoutId.value = null; }
                  wsRef.value?.send(JSON.stringify({ type: 'EndTyping', channel: activeId.value }));
                  const attIds = [...pendingAttachmentIds.value];
                  const replyMsg = replyTo.value;
                  pendingAttachmentIds.value = [];
                  pendingAttachmentPreviews.value = [];
                  replyTo.value = null;
                  try {
                    await sendMessage(activeId.value, content, token, {
                      attachments: attIds.length ? attIds : undefined,
                      replies: replyMsg ? [{ id: replyMsg._id, mention: false }] : undefined,
                    });
                  } finally {
                    sending.value = false;
                  }
                }}
              />
              <div class="bg-(--color-rim) w-[1px] h-[65%] self-center relative z-20" />
              <button
                class="shrink-0 text-sm px-8 py-4 disabled:opacity-40 disabled:pointer-events-none cursor-pointer hover:bg-(--color-canvas) transition-colors -ml-[2px] "
                disabled={sending.value}
                onClick$={async () => {
                  const content = inputText.value.trim();
                  if ((!content && !pendingAttachmentIds.value.length) || !activeId.value || sending.value) return;
                  inputText.value = '';
                  sending.value = true;
                  if (typingTimeoutId.value !== null) { clearTimeout(typingTimeoutId.value); typingTimeoutId.value = null; }
                  wsRef.value?.send(JSON.stringify({ type: 'EndTyping', channel: activeId.value }));
                  const attIds = [...pendingAttachmentIds.value];
                  const replyMsg = replyTo.value;
                  pendingAttachmentIds.value = [];
                  pendingAttachmentPreviews.value = [];
                  replyTo.value = null;
                  try {
                    await sendMessage(activeId.value, content, token, {
                      attachments: attIds.length ? attIds : undefined,
                      replies: replyMsg ? [{ id: replyMsg._id, mention: false }] : undefined,
                    });
                  } finally {
                    sending.value = false;
                  }
                }}
              >
                Send
              </button>
            </div>
          </>
        )}

      </div>

      {/* Right sidebar: server members */}
      {status.value === 'ready' && membersServerId.value && rightOpen.value && (
        <aside class="w-[150px] shrink-0 border-l border-(--color-rim) overflow-y-auto py-2">
          <p class="px-3 pt-2 pb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
            Members — {members.value.length}
          </p>
          {members.value.map(m => {
            const uid = m._id.user;
            const name = m.nickname || m.display_name || m.username || uid;
            const rel = chatState.relations.find(r => r._id === uid);
            const isFriend = rel?.status === 'Friend';
            const isPending = rel?.status === 'Outgoing';
            const usernameHash = m.discriminator
              ? `${m.username}#${m.discriminator}`
              : (m.username ?? '');
            const memberAv = chatState.userAvatars[uid] ?? avatarUrl(m.avatar ?? m.userAvatar);
            return (
              <div key={uid} class="group relative flex items-center gap-2 px-3 py-1.5 hover:bg-(--color-edge)/30 transition-colors">
                <span class={`shrink-0 w-2 h-2 rounded-full ${presenceColor(m.status?.presence)}`} />
                <span class="flex-1 text-xs text-ink truncate">{name}</span>
                {!isFriend && !isPending && usernameHash && (
                  <button
                    class="shrink-0 text-muted hover:text-ink transition-colors opacity-0 group-hover:opacity-100"
                    title={`Send friend request to ${name}`}
                    onClick$={async () => {
                      const ok = await sendFriendRequest(usernameHash, token);
                      if (ok) chatState.relations = [...chatState.relations, { _id: uid, status: 'Outgoing' }];
                    }}
                  >
                    <LuUserPlus class="h-3 w-3" />
                  </button>
                )}
                {isPending && <span title="Request sent"><LuClock class="shrink-0 h-3 w-3 text-muted opacity-60" /></span>}
                {isFriend && <span title="Friends"><LuUserCheck class="shrink-0 h-3 w-3 text-muted opacity-60" /></span>}

                {/* Hover popup — floats to the left over the main panel */}
                <div class="hidden group-hover:flex absolute right-full mr-2 top-1/2 -translate-y-1/2 z-50 flex-col items-center gap-2 bg-(--color-canvas) border border-(--color-rim) rounded-lg p-3 shadow-xl w-40 pointer-events-none">
                  <div class="shrink-0 w-12 h-12 rounded-full overflow-hidden border border-(--color-rim) bg-(--color-surface) flex items-center justify-center">
                    {memberAv
                      ? <img src={memberAv} alt={name} class="w-full h-full object-cover" />
                      : <LuUser class="h-6 w-6 text-muted" />}
                  </div>
                  <p class="text-xs font-semibold text-ink text-center truncate w-full">{name}</p>
                  {m.username && (
                    <p class="text-xs text-muted text-center -mt-1">@{m.username}{m.discriminator ? `#${m.discriminator}` : ''}</p>
                  )}
                  {m.status?.text && (
                    <p class="text-xs text-muted text-center truncate w-full italic">{m.status.text}</p>
                  )}
                </div>
              </div>
            );
          })}
        </aside>
      )}
    </div>
  );
});
