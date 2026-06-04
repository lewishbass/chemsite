import { component$, useSignal, useStore, useVisibleTask$, $ } from '@builder.io/qwik';
import {
  STOAT_WS, avatarUrl, ackChannel, ulidToDate,
  type StoatMsg, type StoatChannel, type StoatServer, type StoatMember, type StoatEmoji,
  type WsReady, type WsMessage, type WsMessageUpdate, type WsMessageDelete,
  type WsMessageReact, type WsMessageUnreact,
  type WsUserRelationship, type WsChannelCreate, type WsChannelStartTyping, type WsChannelStopTyping,
  type WsChannelAck, type WsEvent, type StoatChatState,
  type WsVoiceChannelJoin, type WsVoiceChannelLeave, type WsVoiceChannelMove, type WsVoiceStateUpdate,
  fetchServerMembers, openDMChannel, activateChannelData,
  fetchServerChannels, sendMessage, joinVoiceChannel,
} from './stoat_scripts';
import { ChatSidebarLeft } from './chat-sidebar-left';
import { ChatSidebarRight } from './chat-sidebar-right';
import { ChatMessageList } from './chat-message-list';
import { ChatInput } from './chat-input';
import { LuHeadphones } from '@qwikest/icons/lucide';
import { VoicePanel } from './voice-panel';

export type { StoatChatState };

// ── Helpers ─────────────────────────────────────────────────────────────────

async function switchToChannel(
  ch: StoatChannel,
  token: string,
  chatState: StoatChatState,
  signals: {
    activeId: { value: string };
    activeName: { value: string };
    messages: { value: StoatMsg[] };
    unreadChannels: Record<string, boolean>;
    newMsgCount: { value: number };
  },
) {
  signals.activeId.value = ch._id;
  signals.activeName.value = ch.name ?? '';
  signals.messages.value = [];
  const { msgs, users, userNames } = await activateChannelData(ch._id, token, chatState.userNames);
  if (users.length) chatState.userNames = userNames;
  signals.messages.value = msgs;
  if (msgs.length) {
    ackChannel(ch._id, msgs[msgs.length - 1]._id, token);
    delete signals.unreadChannels[ch._id];
  }
  signals.newMsgCount.value++;
  //console.log(`Switched to channel ${ch.name} (${ch._id}), loaded ${msgs.length} messages`);
  //Object.keys(ch).forEach(k => console.log(`  ${k}:`, (ch as any)[k]));
}

// ── Component ───────────────────────────────────────────────────────────────

export const StoatChat = component$<{ token: string; chatState: StoatChatState }>(({ token, chatState }) => {
  // ── State ───────────────────────────────────────────────────────────────
  const status = useSignal<'connecting' | 'ready' | 'error'>('connecting');
  const servers = useSignal<StoatServer[]>([]);
  const channels = useSignal<StoatChannel[]>([]);
  const activeId = useSignal('');
  const activeName = useSignal('');
  const messages = useSignal<StoatMsg[]>([]);
  const sending = useSignal(false);
  const members = useSignal<StoatMember[]>([]);
  const membersServerId = useSignal('');
  const wsRef = useSignal<WebSocket | null>(null);
  const unreadChannels = useStore<Record<string, boolean>>({});
  const typingByChannel = useStore<Record<string, string[]>>({});
  const replyTo = useSignal<StoatMsg | null>(null);
  const editingMsgId = useSignal('');
  const editingContent = useSignal('');
  const emojiPickerFor = useSignal('');
  const mainPanelRef = useSignal<Element>();
  const newMsgCount = useSignal(0);
  const notifTitle = useSignal('');
  const leftOpen = useSignal(true);
  const rightOpen = useSignal(true);
  const outerRef = useSignal<Element>();
  const voiceConnected = useSignal(false);

  // ── Derive whether the active channel is a voice channel ─────────────
  function isVoiceChannel(id: string): boolean {
    const ch = channels.value.find(c => c._id === id);
    // the api is wront, channel_type is never "VoiceChannel", and voice channels can be identified by the presence of the "voice" field
    return Object.keys(ch ?? {}).includes('voice');
  }

  // ── Shared channel activator (passed to child components) ──────────────
  const activateChannel = $(async (channelId: string) => {
    const ch = channels.value.find(c => c._id === channelId);
    if (!ch) return;
    await switchToChannel(ch, token, chatState, {
      activeId, activeName, messages, unreadChannels, newMsgCount,
    });
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    if (!token) { status.value = 'error'; return; }

    const ws = new WebSocket(STOAT_WS);
    wsRef.value = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'Authenticate', token }));

    ws.onmessage = async (rawEvt: MessageEvent) => {
      let evt: WsEvent;
      try { evt = JSON.parse(rawEvt.data as string) as WsEvent; } catch { return; }

      // Bonfire voice events use "event" instead of "type" — normalize
      if (!evt.type && (evt as any).event) {
        (evt as any).type = (evt as any).event;
      }

      if (evt.type === 'Ready') {
        const ready = evt as WsReady;

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

        const emojiMap: Record<string, StoatEmoji> = {};
        for (const e of ready.emojis ?? []) emojiMap[e._id] = e;
        if (Object.keys(emojiMap).length) chatState.serverEmojis = emojiMap;

        chatState.wsReady = true;
        chatState.joinedServers = ready.servers ?? [];
        servers.value = ready.servers ?? [];
        channels.value = ready.channels ?? [];

        const savedChannelId = typeof localStorage !== 'undefined' ? localStorage.getItem('stoat-activeChannelId') : null;
        const allChannels = ready.channels ?? [];
        const first = savedChannelId
          ? (allChannels.find(c => c._id === savedChannelId) ?? allChannels.find(c => c.channel_type === 'TextChannel' || c.channel_type === 'VoiceChannel'))
          : allChannels.find(c => c.channel_type === 'TextChannel' || c.channel_type === 'VoiceChannel');
        if (first) await switchToChannel(first, token, chatState, { activeId, activeName, messages, unreadChannels, newMsgCount });
        status.value = 'ready';

      } else if (evt.type === 'Message') {
        const msg = evt as WsMessage;
        if (msg.channel === activeId.value) {
          messages.value = [...messages.value, {
            _id: msg._id, content: msg.content, author: msg.author,
            channel: msg.channel, attachments: msg.attachments, replies: msg.replies,
            createdAt: ulidToDate(msg._id), edited: msg.edited ?? null,
          }];
          newMsgCount.value++;
          ackChannel(msg.channel, msg._id, token);
        } else {
          unreadChannels[msg.channel] = true;
        }
        if (msg.author !== chatState.currentUserId && document.hidden) {
          const senderName = chatState.userNames[msg.author] ?? 'Someone';
          const ch = channels.value.find(c => c._id === msg.channel);
          const isDM = ch?.channel_type === 'DirectMessage';
          const svName = !isDM && ch?.server
            ? (servers.value.find(s => s._id === ch!.server)?.name ?? ch?.name) : null;
          notifTitle.value = isDM
            ? `new message from ${senderName}`
            : `new message in ${svName ?? ch?.name ?? 'chat'}`;
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              const n = new Notification(senderName, {
                body: msg.content?.slice(0, 100) ?? (msg.attachments?.length ? '📎 Sent an attachment' : '…'),
                icon: chatState.userAvatars[msg.author] ?? undefined,
                tag: msg.channel,
              });
              n.onclick = () => window.focus();
            } catch { /* unsupported context */ }
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
        if (ack.user === chatState.currentUserId) delete unreadChannels[ack.id];

      } else if (evt.type === 'MessageUpdate') {
        const upd = evt as WsMessageUpdate;
        if (upd.channel === activeId.value) {
          messages.value = messages.value.map(m =>
            m._id === upd.id ? { ...m, content: upd.data?.content ?? m.content, edited: upd.data?.edited ?? m.edited } : m
          );
        }

      } else if (evt.type === 'MessageDelete') {
        const del = evt as WsMessageDelete;
        if (del.channel === activeId.value) messages.value = messages.value.filter(m => m._id !== del.id);

      } else if (evt.type === 'MessageReact') {
        const r = evt as WsMessageReact;
        if (r.channel_id === activeId.value) {
          messages.value = messages.value.map(m => {
            if (m._id !== r.id) return m;
            const reactions = { ...(m.reactions ?? {}) };
            reactions[r.emoji_id] = [...(reactions[r.emoji_id] ?? []).filter(u => u !== r.user_id), r.user_id];
            return { ...m, reactions };
          });
        }
      } else if (evt.type === 'MessageUnreact') {
        const r = evt as WsMessageUnreact;
        if (r.channel_id === activeId.value) {
          messages.value = messages.value.map(m => {
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
          ? [...filtered, { _id: rel.id, status: rel.status }] : filtered;

      } else if (evt.type === 'VoiceChannelJoin') {
        const v = evt as WsVoiceChannelJoin;
        const uid = v.data.state.user_id;
        chatState.voiceParticipants = {
          ...chatState.voiceParticipants,
          [uid]: v.data.state,
        };

      } else if (evt.type === 'VoiceChannelLeave') {
        const v = evt as WsVoiceChannelLeave;
        const uid2 = v.data.user_id;
        const { [uid2]: _, ...rest } = chatState.voiceParticipants;
        chatState.voiceParticipants = rest;

      } else if (evt.type === 'VoiceChannelMove') {
        const v = evt as WsVoiceChannelMove;
        const uid3 = v.data.user_id;
        const { [uid3]: _2, ...rest2 } = chatState.voiceParticipants;
        chatState.voiceParticipants = {
          ...rest2,
          [uid3]: v.data.state,
        };

      } else if (evt.type === 'VoiceStateUpdate') {
        const v = evt as WsVoiceStateUpdate;
        const uid4 = v.data.user_id;
        chatState.voiceParticipants = {
          ...chatState.voiceParticipants,
          [uid4]: v.data.state,
        };

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

    ws.onerror = () => { status.value = 'error'; };

    cleanup(() => { wsRef.value = null; try { ws.close(); } catch { /* ignore */ } });
  });

  // ── Switch to server via parent ────────────────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const serverId = track(() => chatState.activeServerId);
    const currentStatus = track(() => status.value);
    if (!serverId || currentStatus !== 'ready') return;

    let ch = channels.value.find(c => c.server === serverId && (c.channel_type === 'TextChannel' || c.channel_type === 'VoiceChannel'));
    if (!ch) {
      if (!servers.value.some(s => s._id === serverId)) {
        const sv = chatState.joinedServers.find(s => s._id === serverId);
        if (sv) servers.value = [...servers.value, sv];
      }
      const newChs = await fetchServerChannels(serverId, token);
      if (newChs.length) {
        channels.value = [...channels.value, ...newChs.filter(c => !channels.value.some(e => e._id === c._id))];
        ch = newChs.find(c => c.channel_type === 'TextChannel' || c.channel_type === 'VoiceChannel');
      }
    }
    if (!ch || ch._id === activeId.value) return;
    await switchToChannel(ch, token, chatState, { activeId, activeName, messages, unreadChannels, newMsgCount });
  });

  // ── Activate DM channel from parent ────────────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const userId = track(() => chatState.activeDmUserId);
    track(() => chatState.activeDmSeq);
    const currentStatus = track(() => status.value);
    if (!userId || currentStatus !== 'ready') return;

    let dmCh = channels.value.find(c => c.channel_type === 'DirectMessage' && c.recipients?.includes(userId));
    if (!dmCh) {
      const created = await openDMChannel(userId, token);
      if (!created) return;
      dmCh = created;
      channels.value = [...channels.value, created];
    }
    await switchToChannel(dmCh, token, chatState, { activeId, activeName, messages, unreadChannels, newMsgCount });
  });

  // ── Sync joined servers ────────────────────────────────────────────────
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
          channels.value = [...channels.value, ...newChs.filter(c => !channels.value.some(e => e._id === c._id))];
        }
      }
    }
  });

  // ── Fetch members on channel change ───────────────────────────────────
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

  // ── Notification permission + title restore ────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { });
    }
    const originalTitle = document.title;
    const clearNotif = () => {
      if (!document.hidden) { notifTitle.value = ''; document.title = originalTitle; }
    };
    document.addEventListener('visibilitychange', clearNotif);
    window.addEventListener('focus', clearNotif);
    cleanup(() => {
      document.removeEventListener('visibilitychange', clearNotif);
      window.removeEventListener('focus', clearNotif);
      document.title = originalTitle;
    });
  });

  // ── Title ticker ───────────────────────────────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const title = track(() => notifTitle.value);
    if (!title) return;
    const full = `${title}        `;
    let pos = 0;
    const id = setInterval(() => {
      document.title = "🔴" + full.slice(pos) + full.slice(0, pos);
      pos = (pos + 1) % full.length;
    }, 50);
    cleanup(() => clearInterval(id));
  });

  // ── Save active channel ────────────────────────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const id = track(() => activeId.value);
    if (id) localStorage.setItem('stoat-activeChannelId', id);
  });

  // ── Collapse sidebars on narrow width ──────────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const el = track(() => outerRef.value);
    if (!el) return;
    const check = () => { if (el.clientWidth < 700) { leftOpen.value = false; rightOpen.value = false; } };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    cleanup(() => ro.disconnect());
  });

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div ref={outerRef} class="relative flex h-[90vh] overflow-hidden bg-(--color-surface) rounded-lg">
      {/* ── Left sidebar ── */}
      <ChatSidebarLeft
        status={status.value}
        chatState={chatState}
        servers={servers.value}
        channels={channels.value}
        activeId={activeId.value}
        unreadChannels={unreadChannels}
        token={token}
        onActivate={activateChannel}
        leftOpen={leftOpen.value}
        onToggle={$(() => { leftOpen.value = !leftOpen.value; })}
      />

      {/* ── Main panel ── */}
      <div
        ref={mainPanelRef}
        class="flex-1 flex flex-col min-w-0 relative"
      >

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
              {isVoiceChannel(activeId.value) ? (
                <LuHeadphones class="shrink-0 h-3.5 w-3.5" />
              ) : (
                  <span class="text-muted font-mono text-sm">#</span>
              )}
              <span class="text-ink font-semibold text-sm">{activeName.value || 'general'}</span>
            </header>

            {isVoiceChannel(activeId.value) ? (
              /* ── Voice layout: split top half (voice) / bottom half (chat) ── */
              <div class="flex-1 flex flex-col min-h-0 relative">
                {/* Voice panel — top half */}
                <div class="min-h-0 border-b border-(--color-rim)">
                  <VoicePanel
                    channelId={activeId.value}
                    channelName={activeName.value}
                    chatState={chatState}
                    token={token}
                    onToggleConnect={$(() => {
                      if (voiceConnected.value) {
                        voiceConnected.value = false;
                        chatState.activeVoiceChannelId = '';
                      } else {
                        voiceConnected.value = true;
                        chatState.activeVoiceChannelId = activeId.value;
                      }
                    })}
                  />
                </div>

                {/* Message list — bottom half */}
                <div class="flex-1 flex flex-col min-h-0">
                  <ChatMessageList
                    chatState={chatState}
                    messages={messages.value}
                    activeId={activeId.value}
                    token={token}
                    editingMsgId={editingMsgId.value}
                    editingContent={editingContent.value}
                    emojiPickerFor={emojiPickerFor.value}
                    onSetEditingMsgId={$((id: string) => { editingMsgId.value = id; })}
                    onSetEditingContent={$((c: string) => { editingContent.value = c; })}
                    onSetEmojiPickerFor={$((id: string) => { emojiPickerFor.value = id; })}
                    onSetReplyTo={$((msg: StoatMsg | null) => { replyTo.value = msg; })}
                    onMessagesUpdated={$((msgs: StoatMsg[]) => { messages.value = msgs; })}
                  />
                  <ChatInput
                    chatState={chatState}
                    activeId={activeId.value}
                    activeName={activeName.value}
                    sending={sending.value}
                    replyTo={replyTo.value}
                    token={token}
                    onSetReplyTo={$((msg: StoatMsg | null) => { replyTo.value = msg; })}
                    onSend={$(async (text: string, chId: string, replyMsg: StoatMsg | null, attIds: string[]) => {
                      sending.value = true;
                      try {
                        await sendMessage(chId, text, token, {
                          attachments: attIds.length ? attIds : undefined,
                          replies: replyMsg ? [{ id: replyMsg._id, mention: false }] : undefined,
                        });
                      } finally {
                        sending.value = false;
                      }
                    })}
                    onTyping={$((chId: string, isEnding: boolean) => {
                      if (isEnding) {
                        wsRef.value?.send(JSON.stringify({ type: 'EndTyping', channel: chId }));
                      } else {
                        wsRef.value?.send(JSON.stringify({ type: 'BeginTyping', channel: chId }));
                      }
                    })}
                  />
                </div>
              </div>
            ) : (
              /* ── Text-only layout ── */
              <>
                <ChatMessageList
                  chatState={chatState}
                  messages={messages.value}
                  activeId={activeId.value}
                  token={token}
                  editingMsgId={editingMsgId.value}
                  editingContent={editingContent.value}
                  emojiPickerFor={emojiPickerFor.value}
                  onSetEditingMsgId={$((id: string) => { editingMsgId.value = id; })}
                  onSetEditingContent={$((c: string) => { editingContent.value = c; })}
                  onSetEmojiPickerFor={$((id: string) => { emojiPickerFor.value = id; })}
                  onSetReplyTo={$((msg: StoatMsg | null) => { replyTo.value = msg; })}
                  onMessagesUpdated={$((msgs: StoatMsg[]) => { messages.value = msgs; })}
                />
                  <ChatInput
                    chatState={chatState}
                    activeId={activeId.value}
                    activeName={activeName.value}
                    sending={sending.value}
                    replyTo={replyTo.value}
                    token={token}
                    onSetReplyTo={$((msg: StoatMsg | null) => { replyTo.value = msg; })}
                    onSend={$(async (text: string, chId: string, replyMsg: StoatMsg | null, attIds: string[]) => {
                      sending.value = true;
                      try {
                        await sendMessage(chId, text, token, {
                          attachments: attIds.length ? attIds : undefined,
                          replies: replyMsg ? [{ id: replyMsg._id, mention: false }] : undefined,
                        });
                      } finally {
                        sending.value = false;
                      }
                    })}
                  onTyping={$((chId: string, isEnding: boolean) => {
                    if (isEnding) {
                      wsRef.value?.send(JSON.stringify({ type: 'EndTyping', channel: chId }));
                    } else {
                      wsRef.value?.send(JSON.stringify({ type: 'BeginTyping', channel: chId }));
                    }
                  })}
                />
              </>
            )}
          </>
        )}
      </div>

      {/* ── Right sidebar ── */}
      {status.value === 'ready' && membersServerId.value && (
        <ChatSidebarRight
          chatState={chatState}
          members={members.value}
          membersCount={members.value.length}
          rightOpen={rightOpen.value}
          token={token}
          onToggle={$(() => { rightOpen.value = !rightOpen.value; })}
        />
      )}
    </div>
  );
});
