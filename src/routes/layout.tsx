import { component$, Slot } from '@builder.io/qwik';

export default component$(() => {
  return (
    <div class="min-h-screen bg-surface text-ink ">



      {/* ── Fixed nav ─────────────────────────────────────── */}
      <header class="fixed top-0 left-0 right-0 z-50 h-[72px] nav-backdrop">
        <div class="w-[var(--outer-width)] mx-auto h-full flex flex-row items-center align-middle gap-3 px-4">
          {/* Logo */}
          <a
            href="/"
            class="text-ink font-bold text-xl tracking-wide hover:opacity-80 transition-opacity flex-grow-1"
          >
            <img src="/icon.svg" alt="Description" width="30" height="30" class="inline-block mr-2" />
            Labby
          </a>

          {/* Centre nav */}
          <nav class="flex gap-8 text-sm w-(--inner-width) flex-row justify-center">
          </nav>

          {/* Right CTA */}
          <div class="flex justify-end flex-grow-1 opacity-0">
            <a href="/dashboard" class="btn-pill active text-xs">
              Open App
            </a>
          </div>
        </div>

      </header>
      <nav class="absolute top-0 right-0 left-0 h-18 z-60 flex gap-8 flex-row justify-center items-center" >
        <a href="/" class="text-muted hover:text-ink transition-colors">Home</a>
        <a href="/dashboard" class="text-muted hover:text-ink transition-colors">Dashboard</a>
        <a href="/chat" class="text-muted hover:text-ink transition-colors">Chat</a>
      </nav>

      {/* ── Page content ──────────────────────────────────── */}
      <main class="pt-[72px] overflow-x-hidden overflow-y-hidden min-h-[calc(100vh-72px)]">
        <Slot />
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer class="border-t border-edge">
        <div class="max-w-[1480px] mx-auto px-8 py-5 flex items-center justify-between text-xs text-muted">
          <span>© 2026 Labby · Chemistry Automation Platform · Northwestern University</span>
          <div class="flex gap-2 flex-col">
            <span>Built by <a class="font-bold text-(--color-accent)" href="https://www.lewisbass.org" target="_blank" rel="noopener noreferrer">Lewis Bass</a> in like 2 days</span>
            <span>Using Qwik + Netlify Edge</span>
          </div>
        </div>
      </footer>
    </div>
  );
});