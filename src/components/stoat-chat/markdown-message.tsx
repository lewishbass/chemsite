import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';
import { STOAT_AUTUMN } from './stoat_scripts';
import type { StoatEmoji } from './stoat_scripts';

// ── Lazily-initialised singleton marked instance ───────────────────────────

type MarkedInstance = { parse: (src: string) => Promise<string> | string };
let _markedInstance: MarkedInstance | null = null;
let _DOMPurify: typeof import('dompurify').default | null = null;

async function getRenderer() {
  if (_markedInstance) return { renderer: _markedInstance, DOMPurify: _DOMPurify! };
  const [{ Marked }, { markedHighlight }, { default: hljs }, { default: katexExt }, { default: DOMPurify }] = await Promise.all([
    import('marked'),
    import('marked-highlight'),
    import('highlight.js'),
    import('marked-katex-extension'),
    import('dompurify'),
  ]);
  if (!document.getElementById('hljs-css')) {
    const l = document.createElement('link');
    l.id = 'hljs-css'; l.rel = 'stylesheet';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
    document.head.appendChild(l);
  }
  if (!document.getElementById('katex-css')) {
    const l = document.createElement('link');
    l.id = 'katex-css'; l.rel = 'stylesheet';
    l.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    document.head.appendChild(l);
  }
  const renderer = new Marked(
    markedHighlight({
      langPrefix: 'hljs language-',
      emptyLangClass: 'hljs',
      highlight(code: string, lang: string) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
  );
  renderer.use(katexExt({ throwOnError: false, nonStandard: true }));
  _markedInstance = renderer as unknown as MarkedInstance;
  _DOMPurify = DOMPurify;
  return { renderer: _markedInstance, DOMPurify };
}

export async function renderMarkdownHtml(
  content: string,
  serverEmojis: Record<string, StoatEmoji>,
  emojiOnly: boolean,
): Promise<string> {
  const { renderer, DOMPurify } = await getRenderer();
  const processed = content.replace(/:([0-9A-Z]{26}):/g, (_: string, id: string) => {
    const emoji = serverEmojis[id];
    const name = emoji?.name ?? id;
    const cls = emojiOnly ? 'h-16 w-16' : 'h-5 w-5';
    return `<img src="${STOAT_AUTUMN}/emojis/${id}" alt=":${name}:" class="inline-block align-text-bottom mx-0.5 ${cls}" />`;
  });
  const rawHtml = await renderer.parse(processed);
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['class', 'style'],
  });
}

/** Check whether a message consists only of emoji characters / custom emoji. */
export function isEmojiOnly(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  let s = t.replace(/:([0-9A-Z]{26}):/g, '');
  s = s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}][\uFE0F\u200D\p{Emoji_Modifier}]*/gu, '');
  s = s.replace(/[\uFE0F\uFE0E\u200D\s]/gu, '');
  return s.length === 0;
}

// ── Component ──────────────────────────────────────────────────────────────

export const MarkdownMessage = component$<{
  content: string;
  serverEmojis: Record<string, StoatEmoji>;
  emojiOnly: boolean;
}>(({ content, serverEmojis, emojiOnly }) => {
  const containerRef = useSignal<Element>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => content);
    const el = containerRef.value as HTMLElement | undefined;
    if (!el) return;
    el.innerHTML = await renderMarkdownHtml(content, serverEmojis, emojiOnly);
  });

  return (
    <div
      ref={containerRef}
      class={`text-sm text-ink break-words leading-relaxed markdown-content${emojiOnly ? ' !text-5xl !leading-tight' : ''}`}
    />
  );
});