import { component$, useVisibleTask$, type QRL, type Signal } from '@builder.io/qwik';
import { STOAT_AUTUMN, type StoatEmoji } from './stoat_scripts';

const EMOJI_RE = /:([0-9A-Z]{26}):/g;

interface CustomTextAreaProps {
  value: string;
  serverEmojis: Record<string, StoatEmoji>;
  editorRef: Signal<Element | undefined>;
  placeholder?: string;
  class?: string;
  maxHeight?: number;
  onValueChange$: QRL<(value: string) => void>;
  onEnter$?: QRL<() => void>;
}

// Caret offsets are measured in serialized characters (an emoji counts as its ":ID:" length).
const savedOffsets = new WeakMap<Element, number>();

// render() replaces the DOM, which wipes native undo, so history is kept manually.
interface Hist { stack: { v: string; off: number; pre: number }[]; idx: number; at: number }
const histories = new WeakMap<Element, Hist>();

function serialize(el: Element): string {
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? '';
    else if (n instanceof HTMLElement) {
      if (n.dataset.emoji) out += n.dataset.emoji;
      else if (n.tagName === 'BR') out += '\n';
      else out += n.textContent ?? '';
    }
  });
  return out;
}

function nodeLength(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return n.nodeValue?.length ?? 0;
  if (n instanceof HTMLElement) {
    if (n.dataset.emoji) return n.dataset.emoji.length;
    if (n.tagName === 'BR') return 1;
    return n.textContent?.length ?? 0;
  }
  return 0;
}

function getOffset(el: Element): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const { anchorNode, anchorOffset } = sel;
  let total = 0;
  if (anchorNode === el) {
    for (let i = 0; i < anchorOffset; i++) total += nodeLength(el.childNodes[i]);
    return total;
  }
  for (const child of Array.from(el.childNodes)) {
    if (child === anchorNode) {
      return total + (child.nodeType === Node.TEXT_NODE ? anchorOffset : anchorOffset ? nodeLength(child) : 0);
    }
    if (child.contains(anchorNode)) {
      const r = document.createRange();
      r.setStart(child, 0);
      r.setEnd(anchorNode!, anchorOffset);
      const box = document.createElement('div');
      box.append(r.cloneContents());
      return total + serialize(box).length;
    }
    total += nodeLength(child);
  }
  return total;
}

function setOffset(el: Element, offset: number) {
  const range = document.createRange();
  let remaining = offset;
  let placed = false;
  for (const child of Array.from(el.childNodes)) {
    const len = nodeLength(child);
    if (child.nodeType === Node.TEXT_NODE) {
      if (remaining <= len) {
        range.setStart(child, remaining);
        placed = true;
        break;
      }
    } else if (remaining === 0) {
      range.setStartBefore(child);
      placed = true;
      break;
    } else if (remaining <= len) {
      range.setStartAfter(child);
      placed = true;
      break;
    }
    remaining -= len;
  }
  if (!placed) range.setStart(el, el.childNodes.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function render(el: Element, text: string, emojis: Record<string, StoatEmoji>) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const emoji = emojis[m[1]];
    if (!emoji) continue;
    if (m.index > last) frag.append(text.slice(last, m.index));
    const img = document.createElement('img');
    img.src = `${STOAT_AUTUMN}/emojis/${m[1]}`;
    img.alt = `:${emoji.name}:`;
    img.title = `:${emoji.name}:`;
    img.dataset.emoji = m[0];
    img.draggable = false;
      img.className = 'inline-block h-5 w-5 align-[-0.15em] mx-0';
    frag.append(img);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  el.replaceChildren(frag);
}

function hasUnrenderedEmoji(el: Element, emojis: Record<string, StoatEmoji>): boolean {
  el.normalize();
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== Node.TEXT_NODE) continue;
    for (const m of (n.nodeValue ?? '').matchAll(EMOJI_RE)) if (emojis[m[1]]) return true;
  }
  return false;
}

/** Inserts text (e.g. ":ID:") at the last known caret position of the editor. */
export function insertAtCaret(el: Element, text: string) {
  const offset = getOffset(el) ?? savedOffsets.get(el) ?? serialize(el).length;
  (el as HTMLElement).focus();
  setOffset(el, offset);
  document.execCommand('insertText', false, text);
}

export const CustomTextArea = component$<CustomTextAreaProps>(
  ({ value, serverEmojis, editorRef, placeholder, class: cls, maxHeight = 160, onValueChange$, onEnter$ }) => {
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ cleanup }) => {
      const el = editorRef.value as HTMLElement | undefined;
      if (!el) return;
      let composing = false;
        let pendingPre: number | null = null;
      el.setAttribute('contenteditable', 'plaintext-only');
      if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';

      const resize = () => {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
      };
      const reconcile = () => {
        if (hasUnrenderedEmoji(el, serverEmojis)) {
          const off = getOffset(el);
          render(el, serialize(el), serverEmojis);
          if (off !== null) setOffset(el, off);
        }
        // A lone <br> would defeat the :empty placeholder.
        if (!el.textContent && !el.querySelector('img') && el.childNodes.length <= 1) el.replaceChildren();
        resize();
      };

      const onInput = () => {
        if (!composing) reconcile();
        const v = serialize(el);
            const h = histories.get(el) ?? { stack: [{ v: '', off: 0, pre: 0 }], idx: 0, at: 0 };
            histories.set(el, h);
            if (v !== h.stack[h.idx].v) {
                const off = getOffset(el) ?? v.length;
                const now = Date.now();
                if (now - h.at < 400 && h.idx > 0) h.stack[h.idx] = { v, off, pre: h.stack[h.idx].pre };
                else { h.stack.splice(h.idx + 1); h.stack.push({ v, off, pre: pendingPre ?? off }); h.idx++; }
                h.at = now;
            }
            pendingPre = null;
            onValueChange$(v);
        };
        const stepHistory = (dir: 1 | -1) => {
            const h = histories.get(el);
            if (!h || !h.stack[h.idx + dir]) return;
            // Undo returns the caret to where the undone edit began; redo to where it ended.
            const caret = dir < 0 ? h.stack[h.idx].pre : h.stack[h.idx + 1].off;
            h.idx += dir;
            h.at = 0;
            const { v } = h.stack[h.idx];
            render(el, v, serverEmojis);
            setOffset(el, caret);
            resize();
        onValueChange$(v);
      };
      const onCompStart = () => { composing = true; };
      const onCompEnd = () => { composing = false; onInput(); };
      const onKeyDown = (e: KeyboardEvent) => {
        if (composing || e.isComposing) return;
          if ((e.ctrlKey || e.metaKey) && !e.altKey) {
              const k = e.key.toLowerCase();
              if (k === 'z' || k === 'y') {
                  e.preventDefault();
                  stepHistory(k === 'y' || e.shiftKey ? 1 : -1);
                  return;
              }
          }
        if (e.key === 'Enter' && !e.shiftKey && onEnter$) {
          e.preventDefault();
          onEnter$();
          return;
        }
        if (e.key === 'Backspace') {
          const sel = window.getSelection();
          if (sel?.isCollapsed && sel.anchorNode) {
            const { anchorNode: n, anchorOffset: o } = sel;
            const prev = n === el ? el.childNodes[o - 1]
              : n.nodeType === Node.TEXT_NODE && o === 0 && n.parentNode === el ? n.previousSibling : null;
            if (prev instanceof HTMLElement && prev.dataset.emoji) {
              e.preventDefault();
                pendingPre = getOffset(el);
              prev.remove();
              onInput();
            }
          }
        }
      };
      const onPaste = (e: ClipboardEvent) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
      };
      const onCopy = (e: ClipboardEvent) => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
        const box = document.createElement('div');
        box.append(sel.getRangeAt(0).cloneContents());
        e.clipboardData?.setData('text/plain', serialize(box));
        e.preventDefault();
        if (e.type === 'cut') document.execCommand('delete');
      };
      const onSelectionChange = () => {
        const off = getOffset(el);
        if (off !== null) savedOffsets.set(el, off);
      };
        const onBeforeInput = () => { pendingPre = getOffset(el); };

        el.addEventListener('beforeinput', onBeforeInput);
      el.addEventListener('input', onInput);
      el.addEventListener('keydown', onKeyDown);
      el.addEventListener('paste', onPaste);
      el.addEventListener('copy', onCopy);
      el.addEventListener('cut', onCopy);
      document.addEventListener('selectionchange', onSelectionChange);
      el.addEventListener('compositionstart', onCompStart);
      el.addEventListener('compositionend', onCompEnd);
      cleanup(() => {
          el.removeEventListener('beforeinput', onBeforeInput);
        el.removeEventListener('input', onInput);
        el.removeEventListener('keydown', onKeyDown);
        el.removeEventListener('paste', onPaste);
        el.removeEventListener('copy', onCopy);
        el.removeEventListener('cut', onCopy);
        document.removeEventListener('selectionchange', onSelectionChange);
        el.removeEventListener('compositionstart', onCompStart);
        el.removeEventListener('compositionend', onCompEnd);
      });
    });

    // Syncs external value changes (e.g. clearing after send) into the DOM.
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      const v = track(() => value);
      const emojis = track(() => serverEmojis);
      const el = editorRef.value as HTMLElement | undefined;
      if (!el || v === serialize(el)) return;
      render(el, v, emojis);
        histories.set(el, { stack: [{ v, off: v.length, pre: v.length }], idx: 0, at: 0 });
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
    });

    return (
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        class={`custom-text-area whitespace-pre-wrap wrap-break-word overflow-y-auto ${cls ?? ''}`}
        style={{ maxHeight: `${maxHeight}px` }}
      />
    );
  },
);
