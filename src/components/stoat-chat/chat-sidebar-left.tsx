import { component$, type QRL } from '@builder.io/qwik';
import { LuCamera, LuChevronLeft, LuClock, LuHash, LuHeadphones, LuMicOff, LuUser, LuVolumeX } from '@qwikest/icons/lucide';
import {
  type StoatChannel, type StoatServer, type StoatChatState,
  acceptFriendRequest, revokeFriendRequest,
} from './stoat_scripts';

export type ChannelActivator = QRL<(channelId: string) => Promise<void>>;

interface ChatSidebarLeftProps {
  status: 'connecting' | 'ready' | 'error';
  chatState: StoatChatState;
  servers: StoatServer[];
  channels: StoatChannel[];
  activeId: string;
  unreadChannels: Record<string, boolean>;
  token: string;
  onActivate: ChannelActivator;
  leftOpen: boolean;
  onToggle: QRL<() => void>;
}

export const ChatSidebarLeft = component$<ChatSidebarLeftProps>(
  ({ status, chatState, servers, channels, activeId, unreadChannels, token, onActivate, leftOpen, onToggle }) => {

    return (
      <>
        {/* ── Toggle ── */}
        <button
          class="absolute top-2.75 left-30 z-40 p-1 rounded hover:bg-(--color-canvas) text-muted hover:text-ink cursor-pointer transition-colors duration-200"
          onClick$={onToggle}
          title={leftOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <LuChevronLeft class={`h-4 w-4${leftOpen ? '' : ' rotate-180'}`} />
        </button>

        {leftOpen && (
          <aside class="w-[150px] shrink-0 border-r border-(--color-rim) overflow-y-auto py-2">
            {status === 'connecting' && (
              <p class="px-3 py-2 text-xs text-muted italic">Connecting…</p>
            )}

            {status === 'ready' && servers.length === 0 && (
              <p class="px-3 py-2 text-xs text-muted italic">No servers joined.</p>
            )}

            {/* Server channels */}
            {servers.map((sv) => (
              <div key={sv._id} class="mb-2">
                <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted truncate">
                  {sv.name}
                </p>
                {channels
                  .filter((c) => c.server === sv._id && (c.channel_type === 'TextChannel' || c.channel_type === 'VoiceChannel'))
                  .sort((a, b) => {
                    // Voice channels first, then text
                    if (a.channel_type !== b.channel_type) return a.channel_type === 'VoiceChannel' ? -1 : 1;
                    return (a.name ?? '').localeCompare(b.name ?? '');
                  })
                  .map((ch) => {
                    const isVoice = Object.keys(ch).includes('voice');
                    const isActiveVoice = isVoice && chatState.activeVoiceChannelId === ch._id;
                    // Show participants for every voice channel, not just the one the user is in
                    const participants = isVoice
                      ? Object.entries(chatState.voiceChannelByUser).filter(([, chId]) => chId === ch._id)
                        .map(([uid]) => [uid, chatState.voiceParticipants[uid]] as const)
                        .filter(([uid]) => chatState.voiceParticipants[uid])
                      : [];
                    return (
                      <div key={ch._id}>
                        <button
                          class={[
                            'w-full text-left px-2 py-1.5 text-sm transition-colors leading-tight flex items-center gap-1',
                            activeId === ch._id
                              ? 'bg-(--color-edge)/50 text-ink font-medium'
                              : 'text-muted hover:text-ink hover:bg-(--color-edge) cursor-pointer',
                          ].join(' ')}
                          onClick$={async () => {
                            if (activeId === ch._id) return;
                            await onActivate(ch._id);
                          }}
                        >
                          {isVoice ? (
                            <LuHeadphones class="shrink-0 h-3.5 w-3.5" />
                          ) : (
                            <LuHash class="shrink-0 h-3.5 w-3.5" />
                          )}
                          <span class="flex-1 truncate">{ch.name}</span>
                          {unreadChannels[ch._id] && (
                            <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-green-400" />
                          )}
                          {participants.length > 0 && (
                            <span class={`shrink-0 text-[10px] ${isActiveVoice ? 'text-green-400' : 'text-yellow-500/90'} font-medium`}>
                              {participants.length}
                            </span>
                          )}
                        </button>
                        {/* Voice participants list */}
                        {participants.length > 0 && (
                          <div class="pl-5 pb-1 space-y-0.5">
                            {participants.map(([uid, state]) => {
                              const name = chatState.userNames[uid] ?? uid.slice(0, 8);
                              const av = chatState.userAvatars[uid];
                              const isLocal = uid === chatState.currentUserId;
                              return (
                                <div
                                  key={uid}
                                  class="flex items-center gap-1.5 px-1 py-0.5 rounded text-xs text-muted"
                                >
                                  {/* Avatar */}
                                  <span class="shrink-0 w-4 h-4 rounded-full overflow-hidden bg-(--color-surface) border border-(--color-rim) flex items-center justify-center">
                                    {av
                                      ? <img src={av} alt={name} width="16" height="16" class="w-full h-full object-cover" />
                                      : <LuUser class="h-2.5 w-2.5 text-muted" />}
                                  </span>
                                  {/* Name */}
                                  <span class="truncate flex-1">
                                    {name}{isLocal ? ' (You)' : ''}
                                  </span>
                                  {/* State badges */}
                                  {state.video && (
                                    <LuCamera class="shrink-0 h-3 w-3 text-green-400" />
                                  )}
                                  {state.mute && (
                                    <LuMicOff class="shrink-0 h-3 w-3 text-red-400/70" />
                                  )}
                                  {state.deaf && (
                                    <LuVolumeX class="shrink-0 h-3 w-3 text-orange-400/70" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}

            {/* DM channels */}
            {channels.some(c => c.channel_type === 'DirectMessage') && (
              <div class="mb-2 mt-2 border-t border-(--color-rim) pt-2">
                <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted truncate">
                  Direct Messages
                </p>
                {channels
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
                          activeId === ch._id
                            ? 'bg-(--color-edge)/50 text-ink font-medium'
                            : 'text-muted hover:text-ink hover:bg-(--color-edge) cursor-pointer',
                        ].join(' ')}
                        onClick$={async () => {
                          if (activeId === ch._id) return;
                          await onActivate(ch._id);
                        }}
                      >
                        <span class="shrink-0 w-5 h-5 rounded-full overflow-hidden bg-(--color-surface) border border-(--color-rim) flex items-center justify-center">
                          {av
                            ? <img src={av} alt={name} width="20" height="20" class="w-full h-full object-cover" />
                            : <LuUser class="h-3 w-3 text-muted" />}
                        </span>
                        <span class="truncate">@ {name}</span>
                        {unreadChannels[ch._id] && (
                          <span class="shrink-0 ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />
                        )}
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
                    <button
                      class="shrink-0 text-muted hover:text-red-400 transition-colors cursor-pointer"
                      title="Revoke friend request"
                      onClick$={async () => {
                        const ok = await revokeFriendRequest(rel._id, token);
                        if (ok) {
                          chatState.relations = chatState.relations.filter(r => r._id !== rel._id);
                        }
                      }}
                    >
                      <LuClock class="shrink-0 h-3 w-3 text-muted opacity-60" />
                    </button>
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
          </aside>
        )}
      </>
    );
  },
);