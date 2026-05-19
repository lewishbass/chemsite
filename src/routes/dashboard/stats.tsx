import { component$, useSignal } from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';
import { LuPlay, LuDatabase, LuCheckCircle2 } from '@qwikest/icons/lucide';

const fetchEdgeData = server$(async function () {
    return {
        timestamp:    new Date().toISOString(),
        edgeLocation: 'Netlify Edge (serverless)',
    };
});

const runs = [
    { id: '#4821', compound: 'Ethanol', status: 'Complete', purity: '99.7%', sc: 'text-emerald' },
    { id: '#4820', compound: 'Acetone', status: 'Complete', purity: '98.1%', sc: 'text-emerald' },
    { id: '#4819', compound: 'Benzene', status: 'Running',  purity: '—',     sc: 'text-accent'  },
    { id: '#4818', compound: 'Toluene', status: 'Failed',   purity: '—',     sc: 'text-amber'   },
];

export const Stats = component$(() => {
    const serverData = useSignal<{ timestamp: string; edgeLocation: string } | null>(null);
    const loading    = useSignal(false);

    return (
        <div>
            {/* ── Stat grid ──────────────────────────────────────────── */}
            <div class="grid grid-cols-3 divide-x divide-edge border-b border-dashed border-rim">
                <div class="px-10 py-6">
                    <LuPlay class="w-6 h-6 mb-2 text-ink" />
                    <p class="text-3xl font-medium text-accent tracking-tight">3</p>
                    <p class="text-sm text-ink mt-1">Active Runs</p>
                    <p class="text-xs text-muted mt-1 tracking-widest uppercase">In Progress</p>
                </div>
                <div class="px-10 py-6">
                    <LuDatabase class="w-6 h-6 mb-2 text-ink" />
                    <p class="text-3xl font-medium text-amber tracking-tight">12,841</p>
                    <p class="text-sm text-ink mt-1">Compounds</p>
                    <p class="text-xs text-muted mt-1 tracking-widest uppercase">In Database</p>
                </div>
                <div class="px-10 py-6">
                    <LuCheckCircle2 class="w-6 h-6 mb-2 text-ink" />
                    <p class="text-3xl font-medium text-emerald tracking-tight">0</p>
                    <p class="text-sm text-ink mt-1">Alerts</p>
                    <p class="text-xs text-muted mt-1 tracking-widest uppercase">Systems Normal</p>
                </div>
            </div>

            {/* ── Edge server probe ──────────────────────────────────── */}
            <div class="px-10 py-8 border-b border-dashed border-rim">
                <h3 class="text-ink font-semibold mb-4">Edge Server Probe</h3>
                <button
                    class="px-4 py-2 bg-accent text-canvas text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick$={async () => {
                        loading.value = true;
                        serverData.value = await fetchEdgeData();
                        loading.value = false;
                    }}
                >
                    {loading.value ? 'Fetching…' : 'Fetch from Server'}
                </button>
                {serverData.value && (
                    <pre class="mt-4 text-xs text-muted bg-surface p-4 overflow-auto border border-edge">
                        {JSON.stringify(serverData.value, null, 2)}
                    </pre>
                )}
            </div>

            {/* ── Recent runs ────────────────────────────────────────── */}
            <div class="subsection-container bg-canvas -mx-10 px-8">
                <div class="corner-decor" />
                <div class="px-5 py-3 border-b border-edge flex items-center justify-between">
                    <h3 class="text-ink font-semibold">Recent Runs</h3>
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
        </div>
    );
});
