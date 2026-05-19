import { component$, useSignal, useComputed$, useVisibleTask$ } from '@builder.io/qwik';
import { reactions } from './db';
import type { Reaction } from './db';
import {
    LuPlus, LuX, LuSquare, LuCheckCircle2, LuPlay, LuClock,
    LuChevronUp, LuChevronDown,
} from '@qwikest/icons/lucide';

type QueueStatus = 'waiting' | 'running' | 'complete' | 'terminated';

interface QueueItem {
    uid:         string;
    rxn:         Reaction;
    durationMs:  number;
    startedAt:   number | null;
    progress:    number;
    status:      QueueStatus;
    resultYield?: number;
    resultCryst?: 'High' | 'Medium' | 'Low';
}

interface StoredItem {
    uid:         string;
    rxnId:       string;
    durationMs:  number;
    startedAt:   number | null;
    progress:    number;
    status:      QueueStatus;
    resultYield?: number;
    resultCryst?: 'High' | 'Medium' | 'Low';
}

const STORAGE_KEY = 'chemsite-cc-queue';

export const CommandCenter = component$(() => {
    const selectedId = useSignal(reactions[0].id);
    const queue      = useSignal<QueueItem[]>([]);
    const hasLoaded  = useSignal(false);

    // Load queue from localStorage on mount
    useVisibleTask$(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed: StoredItem[] = JSON.parse(raw);
                queue.value = parsed.map(item => ({
                    uid:         item.uid,
                    rxn:         reactions.find(r => r.id === item.rxnId) ?? reactions[0],
                    durationMs:  item.durationMs,
                    startedAt:   item.status === 'running' ? null : item.startedAt,
                    progress:    item.status === 'running' ? 0 : item.progress,
                    status:      (item.status === 'running' ? 'waiting' : item.status) as QueueStatus,
                    resultYield: item.resultYield,
                    resultCryst: item.resultCryst,
                }));
            }
        } catch { /* ignore corrupt data */ }
        hasLoaded.value = true;
    });

    // Save queue to localStorage whenever it changes (after initial load)
    useVisibleTask$(({ track }) => {
        const q      = track(() => queue.value);
        const loaded = track(() => hasLoaded.value);
        if (!loaded) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(
                q.map(item => ({
                    uid:         item.uid,
                    rxnId:       item.rxn.id,
                    durationMs:  item.durationMs,
                    startedAt:   item.startedAt,
                    progress:    item.progress,
                    status:      item.status,
                    resultYield: item.resultYield,
                    resultCryst: item.resultCryst,
                }))
            ));
        } catch { /* ignore */ }
    });

    // Client-side timer drives queue progress
    useVisibleTask$(({ cleanup }) => {
        const interval = setInterval(() => {
            const q = queue.value;
            const runIdx = q.findIndex(i => i.status === 'running');

            if (runIdx !== -1) {
                const item     = q[runIdx];
                const elapsed  = Date.now() - (item.startedAt ?? Date.now());
                const progress = Math.min(100, (elapsed / item.durationMs) * 100);

                if (progress >= 100) {
                    const variance = (Math.random() - 0.5) * 10;
                    queue.value = q.map((it, i): QueueItem =>
                        i === runIdx
                            ? {
                                ...it,
                                progress:    100,
                                status:      'complete',
                                resultYield: Math.max(5, Math.min(99, Math.round(it.rxn.yieldPct + variance))),
                                resultCryst: it.rxn.crystallinity,
                              }
                            : it
                    );
                } else {
                    queue.value = q.map((it, i): QueueItem =>
                        i === runIdx ? { ...it, progress } : it
                    );
                }
            } else {
                // Start next waiting item
                const waitIdx = q.findIndex(i => i.status === 'waiting');
                if (waitIdx !== -1) {
                    queue.value = q.map((it, i): QueueItem =>
                        i === waitIdx
                            ? { ...it, status: 'running', startedAt: Date.now() }
                            : it
                    );
                }
            }
        }, 250);

        cleanup(() => clearInterval(interval));
    });

    const selected = useComputed$(() =>
        reactions.find(r => r.id === selectedId.value) ?? reactions[0]
    );

    const activeCount = useComputed$(() =>
        queue.value.filter(i => i.status === 'waiting' || i.status === 'running').length
    );

    const hasFinished = useComputed$(() =>
        queue.value.some(i => i.status === 'complete' || i.status === 'terminated')
    );

    return (
        <div>
            {/* ── Dispatch panel ───────────────────────── */}
            <div class="subsection-container bg-canvas p-6 -mx-10 px-8">
                <div class="corner-decor" />
                <h3 class="text-ink font-semibold mb-4">Dispatch Reaction</h3>
                <div class="flex flex-col sm:flex-row gap-3">
                    <select
                        class="reaction-select flex-1 mini-scroll"
                        value={selectedId.value}
                        onChange$={(e) => { selectedId.value = (e.target as HTMLSelectElement).value; }}
                    >
                        {reactions.map(r => (
                            <option key={r.id} value={r.id}>
                                {`${r.id} — ${r.reactionType} · ${r.reagents.slice(0, 2).join(', ')}${r.reagents.length > 2 ? '…' : ''}`}
                            </option>
                        ))}
                    </select>
                    <button
                        class="flex items-center justify-center gap-2 px-4 py-2 rounded bg-accent text-canvas text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
                        onClick$={() => {
                            const rxn = reactions.find(r => r.id === selectedId.value);
                            if (!rxn) return;
                            queue.value = [...queue.value, {
                                uid:        `${rxn.id}-${Date.now()}`,
                                rxn,
                                durationMs: 5000 + Math.random() * 25000,
                                startedAt:  null,
                                progress:   0,
                                status:     'waiting',
                            }];
                        }}
                    >
                        <LuPlus class="w-4 h-4" />
                        Add to Queue
                    </button>
                </div>

                {/* Reaction preview */}
                <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                        ['Type',    selected.value.reactionType],
                        ['Temp',    `${selected.value.tempC} °C`],
                        ['Time',    `${selected.value.timeH} h`],
                        ['Solvent', selected.value.solvent],
                    ] as [string, string][]).map(([k, v]) => (
                        <div key={k} class="bg-surface px-3 py-2">
                            <div class="text-xs text-muted mb-0.5">{k}</div>
                            <div class="text-sm text-ink font-medium">{v}</div>
                        </div>
                    ))}
                </div>
                <div class="mt-2 bg-surface px-3 py-2">
                    <div class="text-xs text-muted mb-0.5">Reagents</div>
                    <div class="text-sm text-ink">{selected.value.reagents.join(', ')}</div>
                </div>
                {selected.value.modulator && (
                    <div class="mt-2 bg-surface px-3 py-2">
                        <div class="text-xs text-muted mb-0.5">Modulator</div>
                        <div class="text-sm text-ink">{selected.value.modulator}</div>
                    </div>
                )}
            </div>

            {/* ── Queue ────────────────────────────────── */}
            <div>
                <div class="px-5 py-3 border-t border-b border-dashed border-rim flex items-center justify-between">
                    <h3 class="text-ink font-semibold">
                        Queue
                        {activeCount.value > 0 && (
                            <span class="ml-2 text-xs font-normal text-muted">
                                {activeCount.value} active
                            </span>
                        )}
                    </h3>
                    <div class="flex items-center gap-3">
                        {queue.value.some(i => i.status === 'waiting') && (
                            <button
                                class="text-xs text-muted hover:text-amber transition-colors"
                                onClick$={() => {
                                    queue.value = queue.value.filter(i => i.status !== 'waiting');
                                }}
                            >
                                Clear waiting
                            </button>
                        )}
                        {hasFinished.value && (
                            <button
                                class="text-xs text-muted hover:text-ink transition-colors"
                                onClick$={() => {
                                    queue.value = queue.value.filter(i => i.status !== 'complete' && i.status !== 'terminated');
                                }}
                            >
                                Clear finished
                            </button>
                        )}
                    </div>
                </div>

                {queue.value.length === 0 ? (
                    <div class="px-5 py-10 text-center text-muted text-sm">
                        Queue is empty — dispatch a reaction above to get started.
                    </div>
                ) : (
                    <div class="divide-y divide-edge">
                        {queue.value.map((item, idx) => {
                            const uid        = item.uid;
                            const isRunning  = item.status === 'running';
                            const isWaiting  = item.status === 'waiting';
                            const isComplete = item.status === 'complete';
                            const isDone     = isComplete || item.status === 'terminated';
                            const canMoveUp   = isWaiting && idx > 0 && queue.value[idx - 1]?.status === 'waiting';
                            const canMoveDown = isWaiting && idx < queue.value.length - 1 && queue.value[idx + 1]?.status === 'waiting';
                            const waitingPos  = isWaiting
                                ? queue.value.filter(i => i.status === 'waiting').findIndex(i => i.uid === uid)
                                : -1;
                            return (
                                <div
                                    key={uid}
                                    class={`px-5 py-4 transition-colors ${
                                        isRunning              ? 'bg-accent/5' :
                                        isComplete             ? 'bg-emerald/5' :
                                        item.status === 'terminated' ? 'bg-amber/5' : ''
                                    }`}
                                >
                                    <div class="flex items-start justify-between gap-4">
                                        <div class="flex items-start gap-3 min-w-0">
                                            <div class="mt-0.5 shrink-0 w-5 flex justify-center">
                                                {isRunning
                                                    ? <LuPlay class="w-4 h-4 text-accent" />
                                                    : isComplete
                                                        ? <LuCheckCircle2 class="w-4 h-4 text-emerald" />
                                                        : item.status === 'terminated'
                                                            ? <LuX class="w-4 h-4 text-amber" />
                                                            : <LuClock class="w-3.5 h-3.5 text-muted" />
                                                }
                                            </div>
                                            <div class="min-w-0">
                                                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                    <span class="text-sm font-medium text-ink font-mono">{item.rxn.id}</span>
                                                    <span class="text-xs text-muted">·</span>
                                                    <span class="text-xs text-muted">{item.rxn.reactionType}</span>
                                                    {isRunning && (
                                                        <span class="text-xs font-semibold text-accent uppercase tracking-wide">Running</span>
                                                    )}
                                                    {isWaiting && (
                                                        <span class="text-xs text-muted">#{waitingPos + 1} in queue</span>
                                                    )}
                                                    {isComplete && (
                                                        <>
                                                            <span class="text-xs text-muted">·</span>
                                                            <span class="text-xs text-ink">
                                                                Yield: <span class="font-semibold text-emerald">{item.resultYield}%</span>
                                                            </span>
                                                            <span class="text-xs text-muted">·</span>
                                                            <span class={`text-xs font-medium ${
                                                                item.resultCryst === 'High'   ? 'text-emerald' :
                                                                item.resultCryst === 'Medium' ? 'text-amber'   : 'text-muted'
                                                            }`}>{item.resultCryst} crystallinity</span>
                                                        </>
                                                    )}
                                                    {item.status === 'terminated' && (
                                                        <span class="text-xs font-semibold text-amber">Terminated</span>
                                                    )}
                                                </div>
                                                <div class="text-xs text-muted truncate mt-0.5">{item.rxn.reagents.join(', ')}</div>
                                            </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div class="flex items-center gap-1 shrink-0 mt-0.5">
                                            {isWaiting && (
                                                <>
                                                    <button
                                                        class={`p-1 rounded transition-colors ${canMoveUp ? 'text-muted hover:text-ink hover:bg-surface' : 'text-rim cursor-not-allowed'}`}
                                                        disabled={!canMoveUp}
                                                        title="Move up in queue"
                                                        onClick$={() => {
                                                            const q   = [...queue.value];
                                                            const cur = q.findIndex(i => i.uid === uid);
                                                            if (cur > 0 && q[cur - 1]?.status === 'waiting') {
                                                                [q[cur - 1], q[cur]] = [q[cur], q[cur - 1]];
                                                                queue.value = q;
                                                            }
                                                        }}
                                                    >
                                                        <LuChevronUp class="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        class={`p-1 rounded transition-colors ${canMoveDown ? 'text-muted hover:text-ink hover:bg-surface' : 'text-rim cursor-not-allowed'}`}
                                                        disabled={!canMoveDown}
                                                        title="Move down in queue"
                                                        onClick$={() => {
                                                            const q   = [...queue.value];
                                                            const cur = q.findIndex(i => i.uid === uid);
                                                            if (cur < q.length - 1 && q[cur + 1]?.status === 'waiting') {
                                                                [q[cur], q[cur + 1]] = [q[cur + 1], q[cur]];
                                                                queue.value = q;
                                                            }
                                                        }}
                                                    >
                                                        <LuChevronDown class="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                class={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
                                                    isRunning
                                                        ? 'border-amber/40 text-amber hover:bg-amber/10'
                                                        : 'border-rim text-muted hover:text-ink hover:border-ink/30'
                                                }`}
                                                onClick$={() => {
                                                    if (isRunning) {
                                                        queue.value = queue.value.map((it): QueueItem =>
                                                            it.uid === uid ? { ...it, status: 'terminated' } : it
                                                        );
                                                    } else {
                                                        queue.value = queue.value.filter(it => it.uid !== uid);
                                                    }
                                                }}
                                            >
                                                {isRunning
                                                    ? <><LuSquare class="w-3 h-3" /> Terminate</>
                                                    : isDone
                                                        ? <LuX class="w-3.5 h-3.5" />
                                                        : <><LuX class="w-3 h-3" /> Remove</>
                                                }
                                            </button>
                                        </div>
                                    </div>

                                    {isRunning && (
                                        <div class="mt-3 pl-8">
                                            <div class="flex justify-between text-xs mb-1.5">
                                                <span class="text-muted">Progress</span>
                                                <span class="font-mono text-accent">{Math.round(item.progress)}%</span>
                                            </div>
                                            <div class="dash-progress-track">
                                                <div
                                                    class="dash-progress-bar"
                                                    style={{ width: `${item.progress}%` }}
                                                />
                                            </div>
                                            <div class="text-xs text-muted mt-1.5">
                                                ~{Math.max(1, Math.ceil((item.durationMs * (1 - item.progress / 100)) / 1000))}s remaining
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
});
