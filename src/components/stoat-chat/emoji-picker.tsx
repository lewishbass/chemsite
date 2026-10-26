import { component$, useComputed$, useSignal, useVisibleTask$, type PropFunction } from '@builder.io/qwik';
import { LuSearch, LuX } from '@qwikest/icons/lucide';
import { searchEmojis } from '@diqi/emoji-search';
import { STOAT_AUTUMN, type StoatChatState } from './stoat_scripts';

/** Default emojis shown when the search box is empty. */
const QUICK_EMOJI = ['👍', '👎', '❤️', '💯', '😂', '😮', '😢', '😬', '😍', '🔥', '👀', '🗿', '🙏🏻', '🦐', '🍆', '😈'];

interface EmojiPickerProps {
  chatState: StoatChatState;
  onPick$: PropFunction<(emoji: string) => void>;
  onClose$: PropFunction<() => void>;
}

export const EmojiPicker = component$<EmojiPickerProps>(
  ({ chatState, onPick$, onClose$ }) => {
    const search = useSignal('');

    const results = useComputed$(() => {
      const q = search.value.trim().toLowerCase();
      const regular = q
        ? searchEmojis(q, 40).map((r) => ({ e: r.emoji, name: r.name }))
        : QUICK_EMOJI.map((e) => ({ e, name: e }));
      const server = Object.values(chatState.serverEmojis).filter(
        (e) => !q || e.name.toLowerCase().includes(q),
      );
      return { q, regular, server };
    });
    const { q, regular, server } = results.value;
        
    // on activate, focus the search input
    const searchRef = useSignal<HTMLInputElement>();

        // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(() => {
      searchRef.value?.focus();
    });

    return (
      <div
        class="absolute bottom-full left-2 mb-2 z-40 w-70 min-h-80 bg-surface border border-rim border-dashed rounded-xl shadow-xl overflow-hidden"
        onClick$={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div class="flex items-center gap-2 px-3 py-2 border-b border-rim/50">
          <LuSearch class="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            type="text"
            placeholder="Search emoji…"
            aria-label="Search emoji"
            class="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            ref={searchRef}
            value={search.value}
            onInput$={(_, el) => { search.value = el.value; }}
            onKeyDown$={(e) => {
              if (e.key === 'Enter' && q && regular.length > 0) {
                e.preventDefault();
                onPick$(regular[0].e);
              } else if (e.key === 'Enter' && q && regular.length === 0 && server.length > 0) {
                e.preventDefault();
                onPick$(server[0]._id);
              } else if (e.key === 'Escape') {
                onClose$();
              }
            }}
          />
          {search.value && (
            <button class="shrink-0 text-muted hover:text-ink transition-colors cursor-pointer"
              onClick$={() => { search.value = ''; }}>
              <LuX class="h-3.5 w-3.5" />
            </button>
          )}
        </div>

            <div class="max-h-60 overflow-y-auto mini-scroll p-2">

          {/* Server emojis */}
          {Object.keys(chatState.serverEmojis).length > 0 && (
            <div class="pb-3 border-b border-rim/50 mb-2">
              <div class="text-[10px] uppercase tracking-wide text-muted px-1 pb-1">
                Server
              </div>
              {server.length > 0 ? (
                <div class="grid grid-cols-8 gap-0.5">
                  {server.map((e) => (
                    <button key={e._id} title={e.name} aria-label={e.name}
                      class="p-0.5 rounded hover:bg-edge cursor-pointer"
                      onClick$={() => onPick$(':' + e._id + ':')}>
                      <img src={`${STOAT_AUTUMN}/emojis/${e._id}`} alt={e.name} width="24" height="24" class="h-6 w-6" />
                    </button>
                  ))}
                </div>
              ) : (
                <div class="text-xs text-muted px-1 py-2">No matches</div>
              )}
            </div>
          )}
          {/* Regular emojis */}
          <div class="text-[10px] uppercase tracking-wide text-muted px-1 pb-1">Emoji</div>
          {regular.length > 0 ? (
            <div class="grid grid-cols-8 gap-0.5">
              {regular.map(({ e, name }) => (
                <button key={name} title={name.split(' ')[0]} aria-label={name}
                  class="p-1 rounded hover:bg-edge text-xl leading-none cursor-pointer"
                  onClick$={() => onPick$(e)}>
                  {e}
                </button>
              ))}
            </div>
          ) : (
            <div class="text-xs text-muted px-1 py-2">No matches</div>
          )}

        </div>
      </div>
    );
  },
);

