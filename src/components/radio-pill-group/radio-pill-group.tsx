import { component$, useSignal, useVisibleTask$, type Component, type Signal } from '@builder.io/qwik';
import { LuBot, LuChevronDown, LuCompass, LuDatabase, LuFolders, LuHardDrive, LuLayers, LuNetwork, LuPieChart, LuStar, LuTrendingUp } from '@qwikest/icons/lucide';
import './radio-pill-group.css';

const iconMap: Record<string, Component<Record<string, unknown>>> = {
    Collection: LuDatabase,
    Features: LuStar,
    Organization: LuFolders,
    Storage: LuHardDrive,
    Analysis: LuPieChart,
    Classification: LuLayers,
    Regression: LuTrendingUp,
    Clustering: LuNetwork,
    Exploration: LuCompass,
    Agents: LuBot,
};

type RadioPillGroupProps = {
    labels: string[];
    active: Signal<string>;
};

export const RadioPillGroup = component$(({ labels, active }: RadioPillGroupProps) => {
    const highlightLeft = useSignal(0);
    const highlightWidth = useSignal(0);
    const pillsRef = useSignal<HTMLDivElement>();
    const isOpen = useSignal(false);
    const dropdownRef = useSignal<HTMLDivElement>();

    useVisibleTask$(({ track, cleanup }) => {
        track(() => active.value);
        const container = pillsRef.value;
        if (!container) return;

        const measure = () => {
            const activeBtn = container.querySelector('button.active') as HTMLButtonElement | null;
            if (activeBtn) {
                highlightLeft.value = activeBtn.offsetLeft;
                highlightWidth.value = activeBtn.offsetWidth;
            }
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(container);
        cleanup(() => ro.disconnect());
    });

    useVisibleTask$(({ cleanup }) => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
                isOpen.value = false;
            }
        };
        document.addEventListener('mousedown', handler);
        cleanup(() => document.removeEventListener('mousedown', handler));
    });

    return (
        <div class="absolute left-1/2 -translate-x-1/2 top-0 z-50">
            {/* Mobile: expanding pill — active item always rendered first, container clips to 1 item when closed */}
            <div
                ref={dropdownRef}
                class={`radio-pill-mobile${isOpen.value ? ' open' : ''}`}
                style={`--rp-count: ${labels.length}`}
            >
                {[active.value, ...labels.filter(l => l !== active.value)].map((label) => {
                    const isActive = label === active.value;
                    const Icon = iconMap[label];
                    return (
                        <button
                            key={label}
                            class={`radio-pill-option${isActive ? ' active' : ''}`}
                            onClick$={() => {
                                if (isActive) { isOpen.value = !isOpen.value; }
                                else { active.value = label; isOpen.value = false; }
                            }}
                        >
                            {Icon && <Icon class="w-4 h-4 shrink-0" />}
                            {label}
                            {isActive && <LuChevronDown class={`radio-pill-chevron ml-auto${isOpen.value ? ' open' : ''}`} />}
                        </button>
                    );
                })}
            </div>

            {/* Desktop: pill bar */}
            <div ref={pillsRef} class="radio-pill-bar gap-2 flex-nowrap bg-surface border border-rim px-3 py-2 text-xs rounded-full -translate-y-1/2">
                <div
                    class="absolute h-8 rounded-full top-1/2 -translate-y-1/2 transition-[left,width] duration-300 ease-in-out"
                    style={`left:${highlightLeft.value}px;width:${highlightWidth.value}px;background:linear-gradient(135deg,var(--color-accent) -20%, var(--color-emerald) 140%)`}
                />
                {labels.map((label) => {
                    const Icon = iconMap[label];
                    return (
                        <button
                            key={label}
                            class={`z-10 radio-pill flex items-center gap-1.5${active.value === label ? ' active' : ''}`}
                            onClick$={() => { active.value = label; }}
                        >
                            {Icon && <Icon class="w-5 h-5 shrink-0 mr-1" />}
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
});
