import { component$, useSignal, useComputed$ } from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';
import { reactions, allReagents } from './db';
import type { Reaction } from './db';
import { ReactionDetail } from './reaction-detail';
import { LuChevronDown, LuChevronUp } from '@qwikest/icons/lucide';

const fetchData = server$(async function () {
    return {
        timestamp: new Date().toISOString(),
        edgeLocation: 'Netlify Edge (serverless)',
    };
});

const statCards = [
    { label: 'Active Runs',  value: '3',      color: 'text-accent'  },
    { label: 'Compounds',    value: '12,841', color: 'text-amber'   },
    { label: 'Alerts',       value: '0',      color: 'text-emerald' },
];

const runs = [
    { id: '#4821', compound: 'Ethanol', status: 'Complete', purity: '99.7%', sc: 'text-emerald' },
    { id: '#4820', compound: 'Acetone', status: 'Complete', purity: '98.1%', sc: 'text-emerald' },
    { id: '#4819', compound: 'Benzene', status: 'Running',  purity: '—',     sc: 'text-accent'  },
    { id: '#4818', compound: 'Toluene', status: 'Failed',   purity: '—',     sc: 'text-amber'   },
];

const reagentCounts = Object.fromEntries(
    allReagents.map(r => [r, reactions.filter(rx => rx.reagents.includes(r)).length])
);

const CRYST_ORD: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

export default component$(() => {
    const serverData       = useSignal<any>(null);
    const loading          = useSignal(false);
    const keyword          = useSignal('');
    const selectedReagents = useSignal<string[]>([]);
    const hoveredReagent   = useSignal<string | null>(null);
    const sortField        = useSignal<string | null>(null);
    const sortAsc          = useSignal(true);
    const selectedRow      = useSignal<string | null>(null);
    const hoveredRow       = useSignal<string | null>(null);

    const filtered = useComputed$(() => {
        const kw  = keyword.value.toLowerCase().trim();
        const sel = selectedReagents.value;
        const sf  = sortField.value;
        const sa  = sortAsc.value;

        let result = reactions.filter((r: Reaction) => {
            const matchesKw =
                !kw ||
                r.id.toLowerCase().includes(kw) ||
                r.reactionType.toLowerCase().includes(kw) ||
                r.reagents.some(re => re.toLowerCase().includes(kw)) ||
                r.solvent.toLowerCase().includes(kw) ||
                (r.modulator?.toLowerCase().includes(kw) ?? false);
            const matchesReagents =
                sel.length === 0 || sel.every(s => r.reagents.includes(s));
            return matchesKw && matchesReagents;
        });

        if (sf) {
            result = [...result].sort((a, b) => {
                let av: number | string, bv: number | string;
                if      (sf === 'reagents')      { av = a.reagents.length;                   bv = b.reagents.length; }
                else if (sf === 'crystallinity') { av = CRYST_ORD[a.crystallinity] ?? 0;    bv = CRYST_ORD[b.crystallinity] ?? 0; }
                else if (sf === 'modulator')     { av = a.modulator ?? 'zzz';               bv = b.modulator ?? 'zzz'; }
                else                             { av = (a as any)[sf] ?? '';              bv = (b as any)[sf] ?? ''; }
                if (typeof av === 'number' && typeof bv === 'number') return sa ? av - bv : bv - av;
                return sa ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
            });
        }

        return result;
    });

    const hoveredRowReagents = useComputed$(() => {
        if (!hoveredRow.value) return [] as string[];
        return reactions.find(r => r.id === hoveredRow.value)?.reagents ?? [];
    });

    return (
        <div class="max-w-[var(--outer-width)] mx-auto px-6 py-10">
            {/* ── Header ─────────────────────────────── */}
            <h1 class="text-2xl font-bold text-ink mb-1">Dashboard [PLACEHOLDER]</h1>
            <p class="text-muted text-sm mb-2">Full of AI generated content, to communicate planned features</p>
            <p class="text-muted text-sm mb-2">will replace with functional optimized content later</p>
            {/* ── Stat cards ─────────────────────────── */}
            <div class="grid sm:grid-cols-3 gap-4 mb-10">
                {statCards.map((s) => (
                    <div key={s.label} class="bg-canvas border border-rim rounded-lg p-5">
                        <p class="text-xs text-muted uppercase tracking-widest mb-2">{s.label}</p>
                        <p class={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* ── Edge probe ─────────────────────────── */}
            <div class="bg-canvas border border-rim rounded-lg p-6 mb-8">
                <h2 class="text-ink font-semibold mb-4">Edge Server Probe</h2>
                <button
                    class="px-4 py-2 rounded bg-accent text-canvas text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick$={async () => {
                        loading.value = true;
                        serverData.value = await fetchData();
                        loading.value = false;
                    }}
                >
                    {loading.value ? 'Fetching…' : 'Fetch from Server'}
                </button>
                {serverData.value && (
                    <pre class="mt-4 text-xs text-muted bg-surface rounded p-4 overflow-auto border border-edge">
                        {JSON.stringify(serverData.value, null, 2)}
                    </pre>
                )}
            </div>

            {/* ── Runs table ─────────────────────────── */}
            <div class="bg-canvas border border-rim rounded-lg overflow-hidden mb-10">
                <div class="px-5 py-3 border-b border-edge flex items-center justify-between">
                    <h2 class="text-ink font-semibold">Recent Runs</h2>
                    <span class="text-xs text-muted">Showing 4 of 128</span>
                </div>
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-edge text-left">
                            <th class="px-5 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Run ID</th>
                            <th class="px-5 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Compound</th>
                            <th class="px-5 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                            <th class="px-5 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Purity</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-edge">
                        {runs.map((r) => (
                            <tr key={r.id} class="hover:bg-surface transition-colors">
                                <td class="px-5 py-3 text-ink font-mono">{r.id}</td>
                                <td class="px-5 py-3 text-ink">{r.compound}</td>
                                <td class={`px-5 py-3 font-medium ${r.sc}`}>{r.status}</td>
                                <td class="px-5 py-3 text-muted">{r.purity}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Database query ─────────────────────── */}
            <div class="bg-canvas border border-rim rounded-lg overflow-hidden">
                <div class="px-5 py-3 border-b border-edge">
                    <h2 class="text-ink font-semibold">Database Query</h2>
                </div>

                {/* Keyword search */}
                <div class="p-5 border-b border-edge">
                    <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                        Keyword Search
                    </label>
                    <input
                        type="text"
                        placeholder="Search by ID, reaction type, reagent, solvent…"
                        class="w-full bg-surface border border-rim rounded px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                        onInput$={(e) => { keyword.value = (e.target as HTMLInputElement).value; }}
                        value={keyword.value}
                    />
                </div>

                {/* Reagent checkboxes */}
                <div class="p-5 border-b border-edge">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-semibold text-muted uppercase tracking-wide">
                            Filter by Reagent
                            {selectedReagents.value.length > 0 && (
                                <span class="ml-2 normal-case font-normal text-accent">— all selected must be present</span>
                            )}
                        </span>
                        {selectedReagents.value.length > 0 && (
                            <button
                                class="text-xs text-muted hover:text-ink transition-colors"
                                onClick$={() => { selectedReagents.value = []; }}
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                    <div class="grid grid-cols-4 gap-0.5">
                        {allReagents.map((reagent) => {
                            const isChecked = selectedReagents.value.includes(reagent);
                            const isHov     = hoveredReagent.value === reagent;
                            const isRowHL   = !isHov && hoveredRowReagents.value.includes(reagent);
                            return (
                                <label
                                    key={reagent}
                                    class={`flex items-center gap-2 cursor-pointer rounded px-2.5 py-1.5 transition-colors select-none
                                        ${isHov ? 'bg-canvas-light' : isRowHL ? 'bg-edge' : 'hover:bg-edge'}`}
                                    onMouseEnter$={() => { hoveredReagent.value = reagent; }}
                                    onMouseLeave$={() => { hoveredReagent.value = null; }}
                                >
                                    <span class={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all
                                        ${isChecked
                                            ? 'bg-accent border-accent'
                                            : isHov    ? 'bg-surface border-accent'
                                            : isRowHL  ? 'bg-surface border-accent/50'
                                            :            'bg-surface border-rim'}`}>
                                        {isChecked && (
                                            <svg viewBox="0 0 10 8" fill="none" class="w-2.5 h-2 text-canvas">
                                                <polyline
                                                    points="1,4 3.5,6.5 9,1"
                                                    stroke="currentColor"
                                                    stroke-width="1.8"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                />
                                            </svg>
                                        )}
                                    </span>
                                    <input
                                        type="checkbox"
                                        class="sr-only"
                                        checked={isChecked}
                                        onChange$={() => {
                                            const curr = selectedReagents.value;
                                            selectedReagents.value = curr.includes(reagent)
                                                ? curr.filter(x => x !== reagent)
                                                : [...curr, reagent];
                                        }}
                                    />
                                    <span class={`text-xs truncate transition-colors
                                        ${isChecked ? 'text-ink font-medium' : isHov || isRowHL ? 'text-ink' : 'text-muted'}`}>
                                        {reagent}
                                        <span class="ml-1 opacity-40 font-normal">({reagentCounts[reagent]})</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                {/* Results count */}
                <div class="px-5 py-2.5 border-b border-edge">
                    <span class="text-xs text-muted">
                        Showing {filtered.value.length} of {reactions.length} reactions
                    </span>
                </div>

                {/* Results table — fixed height, sticky header, fixed columns */}
                <div class="overflow-auto h-196 mini-scroll">
                    <table class="w-full text-sm table-fixed" style="min-width: 820px">
                        <thead class="sticky top-0 z-10">
                            <tr class="border-b border-edge text-left bg-surface">
                                {([
                                    ['id',            'ID',           'w-20'],
                                    ['reactionType',  'Type',         'w-36'],
                                    ['reagents',      'Reagents',     'w-44'],
                                    ['tempC',         'Temp \u00b0C', 'w-20'],
                                    ['timeH',         'Time h',       'w-16'],
                                    ['solvent',       'Solvent',      'w-20'],
                                    ['modulator',     'Modulator',    'w-28'],
                                    ['yieldPct',      'Yield %',      'w-20'],
                                    ['crystallinity', 'Crystallinity','w-28'],
                                ] as const).map(([field, label, w]) => (
                                    <th
                                        key={field}
                                        class={`${w} px-4 py-2.5 text-xs  font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors
                                            ${sortField.value === field ? 'text-accent' : 'text-muted hover:text-ink'}`}
                                        onClick$={() => {
                                            if (sortField.value === field) sortAsc.value = !sortAsc.value;
                                            else { sortField.value = field; sortAsc.value = true; }
                                        }}
                                    >   
                                        <div class='flex flex-row -mb-1'>
                                            <div class={''}>{label}</div>
                                            <div class={`ml-1 flex flex-col -mt-[5px]`}>
                                                <LuChevronUp class={`inline-block w-4 h-4 -mb-1 ${sortField.value === field ? sortAsc.value ? 'text-ink' : 'text-muted opacity-20' : 'text-muted opacity-30'}`} />
                                                <LuChevronDown class={`inline-block w-4 h-4 ${sortField.value === field ?  sortAsc.value ? 'text-muted opacity-20' : 'text-ink' : 'text-muted opacity-30'}`} />
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-edge">
                            {filtered.value.length === 0 ? (
                                <tr>
                                    <td colSpan={9} class="px-4 py-8 text-center text-muted text-sm">
                                        No reactions match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                filtered.value.flatMap((r: Reaction) => {
                                    const isSelected = selectedRow.value === r.id;
                                    const rows: any[] = [
                                        <tr
                                            key={r.id}
                                            class={`transition-colors cursor-pointer ${
                                                isSelected
                                                    ? 'bg-accent/10'
                                                    : hoveredReagent.value && r.reagents.includes(hoveredReagent.value)
                                                        ? 'bg-accent/10'
                                                        : 'hover:bg-surface'
                                            }`}
                                            onClick$={() => { selectedRow.value = isSelected ? null : r.id; }}
                                            onMouseEnter$={() => { hoveredRow.value = r.id; }}
                                            onMouseLeave$={() => { hoveredRow.value = null; }}
                                        >
                                            <td class="px-4 py-3 text-ink font-mono text-xs overflow-hidden whitespace-nowrap">{r.id}</td>
                                            <td class="px-4 py-3 text-ink overflow-hidden whitespace-nowrap">{r.reactionType}</td>
                                            <td class="px-4 py-3 text-muted text-xs overflow-hidden" title={r.reagents.join(', ')}>
                                                <span class="block truncate">{r.reagents.join(', ')}</span>
                                            </td>
                                            <td class="px-4 py-3 text-ink overflow-hidden whitespace-nowrap">{r.tempC}</td>
                                            <td class="px-4 py-3 text-ink overflow-hidden whitespace-nowrap">{r.timeH}</td>
                                            <td class="px-4 py-3 text-ink overflow-hidden whitespace-nowrap">{r.solvent}</td>
                                            <td class="px-4 py-3 text-muted overflow-hidden whitespace-nowrap">{r.modulator ?? '—'}</td>
                                            <td class="px-4 py-3 text-ink overflow-hidden whitespace-nowrap">{r.yieldPct}</td>
                                            <td class={`px-4 py-3 font-medium overflow-hidden whitespace-nowrap ${
                                                r.crystallinity === 'High'   ? 'text-emerald' :
                                                r.crystallinity === 'Medium' ? 'text-amber'   : 'text-muted'
                                            }`}>{r.crystallinity}</td>
                                        </tr>,
                                    ];
                                    if (isSelected) {
                                        rows.push(
                                            <tr key={`${r.id}-exp`}>
                                                <td colSpan={9} class="p-0 border-none">
                                                    <ReactionDetail reaction={r} />
                                                </td>
                                            </tr>
                                        );
                                    }
                                    return rows;
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});