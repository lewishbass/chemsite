import { component$, type QRL } from '@builder.io/qwik';
import { LuChevronLeft, LuClock, LuUser, LuUserCheck, LuUserPlus } from '@qwikest/icons/lucide';
import {
  type StoatMember, type StoatChatState,
  avatarUrl, sendFriendRequest, revokeFriendRequest,
} from './stoat_scripts';

const presenceColor = (p: string | undefined | null): string => {
  switch (p) {
    case 'Online': return 'bg-green-500';
    case 'Idle':   return 'bg-yellow-400';
    case 'Busy':   return 'bg-red-500';
    case 'Focus':  return 'bg-purple-500';
    default:       return 'bg-gray-500';
  }
};

interface ChatSidebarRightProps {
  chatState: StoatChatState;
  members: StoatMember[];
  membersCount: number;
  rightOpen: boolean;
  token: string;
  onToggle: QRL<() => void>;
}

export const ChatSidebarRight = component$<ChatSidebarRightProps>(
  ({ chatState, members, membersCount, rightOpen, token, onToggle }) => {

    return (
      <>
        {/* ── Toggle ── */}
        <button
          class="absolute top-2.75 right-2 z-40 p-1 rounded hover:bg-(--color-canvas) text-muted hover:text-ink cursor-pointer transition-colors duration-200"
          onClick$={onToggle}
          title={rightOpen ? 'Collapse members' : 'Expand members'}
        >
          <LuChevronLeft class={`h-4 w-4${!rightOpen ? '' : ' rotate-180'}`} />
        </button>

        {rightOpen && (
          <aside class="w-[150px] shrink-0 border-l border-(--color-rim) overflow-y-auto py-2">
            <p class="px-3 pt-2 pb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
              Members — {membersCount}
            </p>
            {members.map(m => {
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

                  {uid !== chatState.currentUserId && !isFriend && !isPending && usernameHash && (
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
                  {uid !== chatState.currentUserId && isPending && (
                    <button
                      class="shrink-0 text-muted hover:text-red-400 transition-colors cursor-pointer"
                      title="Revoke friend request"
                      onClick$={async () => {
                        const ok = await revokeFriendRequest(uid, token);
                        if (ok) {
                          chatState.relations = chatState.relations.filter(r => r._id !== uid);
                        }
                      }}
                    >
                      <LuClock class="shrink-0 h-3 w-3 text-muted opacity-60" />
                    </button>
                  )}
                  {uid !== chatState.currentUserId && isFriend && <span title="Friends"><LuUserCheck class="shrink-0 h-3 w-3 text-muted opacity-60" /></span>}

                  {/* Hover popup */}
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
      </>
    );
  },
);