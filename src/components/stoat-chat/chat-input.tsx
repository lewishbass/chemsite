import { component$, useSignal, useVisibleTask$, $, type QRL } from '@builder.io/qwik';
import { LuPaperclip, LuReply, LuUpload, LuX } from '@qwikest/icons/lucide';
import {
  type StoatMsg, type StoatChatState,
  uploadAttachment,
} from './stoat_scripts';

interface ChatInputProps {
  chatState: StoatChatState;
  activeId: string;
  activeName: string;
  sending: boolean;
  replyTo: StoatMsg | null;
  token: string;
  onSetReplyTo: QRL<(msg: StoatMsg | null) => void>;
  onSend: QRL<(text: string, chId: string, replyMsg: StoatMsg | null, attIds: string[]) => void>;
  onTyping: QRL<(chId: string, isEnding: boolean) => void>;
}

export const ChatInput = component$<ChatInputProps>(
  ({ chatState, activeId, activeName, sending, replyTo, token,
     onSetReplyTo, onSend, onTyping }) => {

    const inputText = useSignal('');
    const pendingAttachmentIds = useSignal<string[]>([]);
    const pendingAttachmentPreviews = useSignal<Array<{id: string; name: string; isImage: boolean; url: string}>>([]);
    const fileUploading = useSignal(false);
    const typingTimeoutId = useSignal<ReturnType<typeof setTimeout> | null>(null);
    const textareaRef = useSignal<Element>();
    const isDragOver = useSignal(false);
    const inputWrapRef = useSignal<Element>();

    const input_style = "w-full rounded-lg px-6 py-2.5 active:outline-none focus:ring-none focus:outline-none focus:bg-(--color-canvas)/50 transition-colors duration-300 text-(--color-ink) resize-none mini-scroll";

    const uploadFiles = $(async (files: File[]) => {
      const uploads = [];
      for (const file of files) {
        uploads.push(
          uploadAttachment(file, token).then((id) => {
            if (id) {
              pendingAttachmentIds.value = [...pendingAttachmentIds.value, id];
              pendingAttachmentPreviews.value = [...pendingAttachmentPreviews.value, {
                id, name: file.name, isImage: file.type.startsWith('image/'),
                url: URL.createObjectURL(file),
              }];
            }
          })
        );
      }
      await Promise.all(uploads);
    });

    // ── Drag-and-drop visual tracking ───────────────────────────────────────
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track, cleanup }) => {
      const el = track(() => inputWrapRef.value);
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

    return (
      <div ref={inputWrapRef} class="relative" preventdefault:dragover preventdefault:drop
        onDragOver$={() => { /* browser needs preventDefault on dragover to allow a drop */ }}
        onDrop$={async (e) => {
          if (!token) return;
          const files = Array.from((e as DragEvent).dataTransfer?.files ?? []);
          if (!files.length) return;
          fileUploading.value = true;
          try {
            await uploadFiles(files);
          } finally {
            fileUploading.value = false;
          }
        }}
      >
        {/* Drag-and-drop overlay */}
        {isDragOver.value && (
          <div class="absolute inset-0 z-50 bg-(--color-accent)/10 border-2 border-dashed border-(--color-accent) flex flex-row gap-2 items-center justify-center pointer-events-none">
            <LuUpload class="h-5 w-5 mt-2 text-(--color-accent) mb-2" />
            <p class="text-(--color-accent) font-semibold">Drop files to attach</p>
          </div>
        )}

        {pendingAttachmentPreviews.value.length > 0 && (
          <div class="shrink-0 p-2 flex flex-wrap gap-2 border-t border-(--color-rim)/50">
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
                  class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center select-none cursor-pointer"
                  onClick$={() => {
                    pendingAttachmentIds.value = pendingAttachmentIds.value.filter((_, j) => j !== i);
                    pendingAttachmentPreviews.value = pendingAttachmentPreviews.value.filter((_, j) => j !== i);
                  }}
                ><LuX class="h-2.5 w-2.5" /></button>
              </div>
            ))}
          </div>
        )}

        {replyTo && (
          <div class="shrink-0 px-4 py-1.5 border-t border-(--color-rim)/50 flex items-center gap-2 text-xs">
            <LuReply class="h-3.5 w-3.5 shrink-0 text-muted" />
            <span class="text-muted">Replying to</span>
            <span class="font-semibold text-ink">{chatState.userNames[replyTo.author] ?? replyTo.author}</span>
            <span class="flex-1 truncate text-muted italic">"{replyTo.content?.slice(0, 60) ?? ''}"</span>
            <button class="shrink-0 ml-auto text-muted hover:text-ink transition-colors" title="Cancel reply"
              onClick$={() => { onSetReplyTo(null); }}>
              <LuX class="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div class="shrink-0 flex border-t border-(--color-rim) border-dashed">
          <label class={`shrink-0 px-3 flex items-center cursor-pointer transition-colors ${fileUploading.value ? 'opacity-40 pointer-events-none text-muted' : 'text-muted hover:text-ink'}`} title="Attach file">
            <LuPaperclip class="h-4 w-4" />
            <input type="file" class="sr-only" multiple onChange$={async (_, el) => {
              const files = Array.from(el.files ?? []);
              if (!files.length) return;
              fileUploading.value = true;
              try {
                await uploadFiles(files);
              } finally {
                fileUploading.value = false;
                el.value = '';
              }
            }} />
          </label>
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={`Message #${activeName || 'general'}…`}
            class={input_style + " -mr-[2px]"}
            value={inputText.value}
            onInput$={(_, el) => {
              inputText.value = el.value;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 160) + 'px';
              if (onTyping && activeId) {
                onTyping(activeId, false);
                if (typingTimeoutId.value !== null) clearTimeout(typingTimeoutId.value);
                typingTimeoutId.value = setTimeout(() => {
                  onTyping(activeId, true);
                  typingTimeoutId.value = null;
                }, 2500) as unknown as ReturnType<typeof setTimeout>;
              }
            }}
            onKeyDown$={async (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sending) {
                  const content = inputText.value.trim();
                  if ((!content && !pendingAttachmentIds.value.length) || !activeId || sending) return;
                  const text = content;
                  inputText.value = '';
                  if (typingTimeoutId.value !== null) { clearTimeout(typingTimeoutId.value); typingTimeoutId.value = null; }
                  const attIds = [...pendingAttachmentIds.value];
                  const replyMsg = replyTo;
                  pendingAttachmentIds.value = [];
                  pendingAttachmentPreviews.value = [];
                  onSetReplyTo(null);
                  if (textareaRef.value) {
                    (textareaRef.value as HTMLTextAreaElement).style.height = 'auto';
                  }
                  await onSend(text, activeId, replyMsg, attIds);
                }
              }
            }}
          />
          <div class="bg-(--color-rim) w-[1px] h-[65%] self-center relative z-20" />
          <button
            class="shrink-0 text-sm px-8 py-4 disabled:opacity-40 disabled:pointer-events-none cursor-pointer hover:bg-(--color-canvas) transition-colors -ml-[2px]"
            disabled={sending}
            onClick$={async () => {
              const content = inputText.value.trim();
              if ((!content && !pendingAttachmentIds.value.length) || !activeId || sending) return;
              const text = content;
              inputText.value = '';
              if (typingTimeoutId.value !== null) { clearTimeout(typingTimeoutId.value); typingTimeoutId.value = null; }
              const attIds = [...pendingAttachmentIds.value];
              const replyMsg = replyTo;
              pendingAttachmentIds.value = [];
              pendingAttachmentPreviews.value = [];
              onSetReplyTo(null);
              if (textareaRef.value) {
                (textareaRef.value as HTMLTextAreaElement).style.height = 'auto';
              }
              await onSend(text, activeId, replyMsg, attIds);
            }}
          >
            Send
          </button>
        </div>
      </div>
    );
  },
);