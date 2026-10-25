import { component$, useSignal, useVisibleTask$, type QRL } from '@builder.io/qwik';
import { LuPencil, LuReply, LuSmile, LuTrash2, LuX, LuPhoneCall, LuPhone, LuInfo } from '@qwikest/icons/lucide';
import {
  STOAT_AUTUMN,
  type StoatMsg, type StoatChatState,
  formatTime, formatSystemMessage,
  deleteMessage, editMessage, reactToMessage, unreactFromMessage,
} from './stoat_scripts';
import { MarkdownMessage, isEmojiOnly } from './markdown-message';

const QUICK_EMOJI = ['👍', '👎', '❤️', '💯', '😂', '😮', '😢', '😬', '😍', '🔥', '👀', '🗿', '🙏🏻', '🦐', '🍆'];

interface ChatMessageListProps {
  chatState: StoatChatState;
  messages: StoatMsg[];
  activeId: string;
  token: string;
  editingMsgId: string;
  editingContent: string;
  emojiPickerFor: string;
  onSetEditingMsgId: QRL<(id: string) => void>;
  onSetEditingContent: QRL<(content: string) => void>;
  onSetEmojiPickerFor: QRL<(id: string) => void>;
  onSetReplyTo: QRL<(msg: StoatMsg | null) => void>;
  onMessagesUpdated: QRL<(newMsgs: StoatMsg[]) => void>;
}

export const ChatMessageList = component$<ChatMessageListProps>(
  ({ chatState, messages, activeId, token, editingMsgId, editingContent,
     emojiPickerFor, onSetEditingMsgId, onSetEditingContent, onSetEmojiPickerFor,
     onSetReplyTo, onMessagesUpdated }) => {

    const msgsEl = useSignal<Element>();
    const bottomSentinelRef = useSignal<Element>();
    const isAtBottom = useSignal(true);

    // Sentinel IntersectionObserver for scroll anchoring
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track, cleanup }) => {
      const el = track(() => bottomSentinelRef.value);
      if (!el) return;
      const scrollContainer = msgsEl.value;
      const observer = new IntersectionObserver(
        ([entry]) => {
          isAtBottom.value = entry.isIntersecting;
          if (entry.isIntersecting && scrollContainer) {
            scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'instant' });
          }
        },
        { root: scrollContainer, rootMargin: '0px 0px 150px 0px' },
      );
      observer.observe(el);
      cleanup(() => observer.disconnect());
    });

    // Scroll to bottom when new messages arrive
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      track(() => messages.length);
      if (isAtBottom.value) {
        requestAnimationFrame(() => {
          const container = msgsEl.value;
          if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
        });
      }
    });

    // Watch DOM mutations for async rendering growth
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track, cleanup }) => {
      const container = track(() => msgsEl.value);
      if (!container) return;
      const observer = new MutationObserver(() => {
        if (isAtBottom.value) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
        }
      });
      observer.observe(container, { childList: true, subtree: true, characterData: true });
      cleanup(() => observer.disconnect());
    });

    return (
      <div ref={msgsEl} class="flex-1 overflow-y-auto mini-scroll p-4 flex flex-col gap-2">
        {messages.length === 0 && (
          <p class="text-muted text-sm italic">No messages yet.</p>
        )}
        {messages.map((msg, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null;
          const isGrouped = !!(prev && prev.author === msg.author &&
            ((msg.createdAt.getTime() - prev.createdAt.getTime()) < 120_000 || msg.system));
          const sysText = msg.system
            ? formatSystemMessage(msg.system, chatState.userNames, msg.createdAt)
            : null;
          return (
            <div key={msg._id} class={`group/msg relative hover:bg-edge/10 rounded-md px-1 -mx-1 pt-0.5 ${isGrouped ? '-mt-3' : ''}`}>

              {/* System message (call started, user joined, …) */}
              {sysText && (
                <div class=" font-courier font-bold flex items-center gap-2 py-1 text-xs text-muted">
                  {msg.system?.type === 'call_started' ? (msg.system.finished_at ? <LuPhone class="text-base leading-none" /> : <LuPhoneCall class="text-base leading-none" />) : <LuInfo class="text-base leading-none" />}
                  <span class="italic">{sysText}</span>
                  <span class="text-[10px] text-muted/60">{formatTime(msg.createdAt)}</span>
                </div>
              )}

              {/* Hover action toolbar */}
              {(
                <div class="absolute right-1 -top-3 hidden group-hover/msg:flex items-center gap-0.5 bg-surface border border-rim rounded-lg px-1.5 py-1 shadow-md z-20">
                  <button class="p-1 rounded hover:bg-edge text-muted hover:text-ink transition-colors cursor-pointer" title="React with emoji"
                  onClick$={() => { onSetEmojiPickerFor(emojiPickerFor === msg._id ? '' : msg._id); }}>
                  <LuSmile class="h-3.5 w-3.5" />
                </button>
                  <button class="p-1 rounded hover:bg-edge text-muted hover:text-ink transition-colors cursor-pointer" title="Reply"
                  onClick$={() => { onSetReplyTo(msg); onSetEmojiPickerFor(''); }}>
                  <LuReply class="h-3.5 w-3.5" />
                  </button>
                  {msg.author === chatState.currentUserId && 
                    <button class="p-1 rounded hover:bg-edge text-muted hover:text-ink transition-colors cursor-pointer" title="Edit"
                      onClick$={() => { onSetEditingMsgId(msg._id); onSetEditingContent(msg.content ?? ''); onSetEmojiPickerFor(''); }}>
                      <LuPencil class="h-3.5 w-3.5" />
                    </button>
                  }
                  {(msg.author === chatState.currentUserId || msg.system) && (
                    <button class="p-1 rounded hover:bg-edge text-red-400/70 hover:text-red-400 transition-colors cursor-pointer" title="Delete"
                      onClick$={async () => { await deleteMessage(activeId, msg._id, token); }}>
                      <LuTrash2 class="h-3.5 w-3.5" />
                    </button>
                )}
              </div>
              )}

              {/* Emoji picker popover */}
              {emojiPickerFor === msg._id && (
                <div class="absolute right-1 top-5 z-30 bg-surface border border-rim rounded-xl p-2 shadow-xl max-w-55">
                  <div class="grid grid-cols-5 gap-1">
                    {QUICK_EMOJI.map(_e => (
                      <button key={_e} class="p-1 rounded hover:bg-edge text-2xl leading-none cursor-pointer" onClick$={async () => {
                        onSetEmojiPickerFor('');
                        await reactToMessage(activeId, msg._id, _e, token);
                      }}>{_e}</button>
                    ))}
                  </div>
                  {Object.keys(chatState.serverEmojis).length > 0 && (
                    <div class="grid grid-cols-5 gap-1 border-t mt-2 border-rim pt-2">
                      {Object.values(chatState.serverEmojis).slice(0, 24).map(_e => (
                        <button key={_e._id} class="p-0.5 rounded hover:bg-edge relative cursor-pointer" title={_e.name} onClick$={async () => {
                          onSetEmojiPickerFor('');
                          await reactToMessage(activeId, msg._id, _e._id, token);
                        }}>
                          <img src={`${STOAT_AUTUMN}/emojis/${_e._id}`} alt={_e.name} width="32" height="32" class="h-8 w-8" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Author */}
              {!isGrouped && !sysText && (
                <div class="text-xs font-semibold text-accent-muted mb-0.5 flex items-end gap-2">
                  <span>{chatState.userNames[msg.author] ?? msg.author}</span>
                  <span class="text-[10px] font-normal text-muted/60">{formatTime(msg.createdAt)}</span>
                  {msg.edited && <span class="text-[10px] font-normal text-muted/40 italic">(edited)</span>}
                </div>
              )}
              {/* Reply reference */}
              {(msg.replies?.length ?? 0) > 0 && (
                <div class="flex items-center gap-1 ml-2 mb-0.5 text-xs text-muted">
                  <LuReply class="h-3 w-3 shrink-0 opacity-50 scale-x-[-1]" />
                  <span class="italic truncate">
                    {(() => {
                      const ref = messages.find(m => m._id === msg.replies![0]);
                      const refAuthor = ref ? ref.system ? 'System' : (chatState.userNames[ref.author] ?? 'Unknown') : 'Unknown';
                      const refPreview = ref?.system ? formatSystemMessage(ref.system, chatState.userNames, ref.createdAt) : ref?.content?.slice(0, 60) ?? (ref?.attachments?.length ? '[attachment]' : '…');
                      return `${refAuthor}: ${refPreview}`;
                    })()}
                  </span>
                </div>
              )}



              {/* Content — edit mode or normal */}
              {sysText ? null : editingMsgId === msg._id ? (
                <div class="flex items-center gap-2 mb-1">
                  <input
                    class="flex-1 rounded px-2 py-1 text-sm bg-edge text-ink border border-rim focus:outline-none"
                    value={editingContent}
                    onInput$={(_, el) => onSetEditingContent(el.value)}
                    onKeyDown$={async (e) => {
                      if (e.key === 'Escape') { onSetEditingMsgId(''); return; }
                      if (e.key !== 'Enter' || e.shiftKey) return;
                      const newContent = editingContent.trim();
                      if (!newContent) return;
                      const ok = await editMessage(activeId, msg._id, newContent, token);
                      if (ok) onMessagesUpdated(messages.map(m => m._id === msg._id ? { ...m, content: newContent } : m));
                      onSetEditingMsgId('');
                    }}
                  />
                  <button class="text-xs text-muted hover:text-ink shrink-0" onClick$={() => { onSetEditingMsgId(''); }}>
                    <LuX class="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <MarkdownMessage
                  content={msg.content ?? ''}
                  serverEmojis={chatState.serverEmojis}
                  emojiOnly={isEmojiOnly(msg.content ?? '')}
                />
              )}

              {/* Attachments */}
              {(msg.attachments?.length ?? 0) > 0 && (
                <div class="mt-1 flex flex-wrap gap-2">
                  {msg.attachments!.map(att => (
                    att.metadata?.type === 'Image' ? (
                      // eslint-disable-next-line qwik/jsx-img -- dimensions unknown until loaded
                      <img
                        key={att._id}
                        src={`${STOAT_AUTUMN}/attachments/${att._id}`}
                        alt={att.filename ?? 'Image'}
                        class="max-w-75 max-h-55 rounded-lg object-contain border border-rim cursor-pointer"
                        loading="lazy"
                      />
                    ) : (
                      <a
                        key={att._id}
                        href={`${STOAT_AUTUMN}/attachments/${att._id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-edge border border-rim text-xs text-ink hover:bg-canvas transition-colors"
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
                          ? 'bg-accent-muted/15 border-accent-muted/40 text-ink'
                          : 'bg-edge/60 border-rim text-muted hover:text-ink hover:bg-edge'
                        }`}
                        onClick$={async () => {
                          if (mine) await unreactFromMessage(activeId, msg._id, emojiId, token);
                          else await reactToMessage(activeId, msg._id, emojiId, token);
                        }}
                      >
                        {isCustomEmoji
                          ? <img src={`${STOAT_AUTUMN}/emojis/${emojiId}`} alt={emojiId} width="22" height="22" class="h-5.5 w-5.5" />
                          : <span class="leading-none text-xl">{emojiId}</span>
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
        {/* Sentinel element for scroll anchoring */}
        <div ref={bottomSentinelRef} />
      </div>
    );
  },
);