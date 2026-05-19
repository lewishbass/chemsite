import { component$ } from '@builder.io/qwik';
import { useLocation, useNavigate } from '@builder.io/qwik-city';
import { LuDatabase, LuFlaskConical, LuLayoutDashboard } from '@qwikest/icons/lucide';
import { DatabaseQuery } from './database-query';
import { CommandCenter } from './command-center';
import { Stats } from './stats';
import './dashboard.css';

type Tab = 'db' | 'cmd' | 'stats';
const VALID_TABS: readonly Tab[] = ['db', 'cmd', 'stats'];

export default component$(() => {
    const loc = useLocation();
    const nav = useNavigate();

    const rawTab = loc.url.searchParams.get('tab') ?? 'db';
    const activeTab: Tab = (VALID_TABS as readonly string[]).includes(rawTab) ? rawTab as Tab : 'db';

    return (
        <div class="flex flex-row min-h-[calc(100vh-72px)]">
            <div class="section-padding -mt-18 dash-right" />

            <div class="flex flex-col w-(--outer-width) max-w-[100vw] relative ">

                {/* ── Header ─────────────────────────────── */}
                <div class="px-10 pt-10 pb-8 border-b border-edge">
                    <h2 class="text-ink mb-2">Dashboard <span class="text-muted text-xl font-normal">[PLACEHOLDER]</span></h2>
                    <p class="text-muted text-sm mt-2">Full of AI generated content to communicate planned features</p>
                    <p class="text-muted text-sm">Will replace with functional optimized content later</p>
                </div>

                {/* ── Tabs ─────────────────────────────────── */}
                <div class="flex gap-2 px-10 py-4 border-b border-edge">
                    <button
                        class={`btn-pill nav-tab ${activeTab === 'db' ? 'active' : ''}`}
                        onClick$={() => nav('/dashboard?tab=db')}
                    >
                        <LuDatabase class="w-4 h-4 shrink-0" />
                        Database
                    </button>
                    <button
                        class={`btn-pill nav-tab ${activeTab === 'cmd' ? 'active' : ''}`}
                        onClick$={() => nav('/dashboard?tab=cmd')}
                    >
                        <LuFlaskConical class="w-4 h-4 shrink-0" />
                        Command Center
                    </button>
                    <button
                        class={`btn-pill nav-tab ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick$={() => nav('/dashboard?tab=stats')}
                    >
                        <LuLayoutDashboard class="w-4 h-4 shrink-0" />
                        Overview
                    </button>
                </div>

                {/* ── Tab content ──────────────────────────── */}
                <div class="p-10">
                    {activeTab === 'db' && <DatabaseQuery />}
                    {activeTab === 'cmd' && <CommandCenter />}
                    {activeTab === 'stats' && <Stats />}
                </div>

            </div>

            <div class="section-padding -mt-18 dash-left" />
        </div>
    );
});