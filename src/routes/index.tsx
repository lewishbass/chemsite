import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';
import { LuBrain, LuGitFork, LuLineChart } from '@qwikest/icons/lucide';
import { ScrollThrough } from '~/components/scroll-through/scroll-through';
import { FadingDisplay, FadingSection } from '~/components/fading-display/fading-display';
import { RadioPillGroup } from '~/components/radio-pill-group/radio-pill-group';
import { CollectionGraph } from './graphs/db/collection';
import { FeaturesGraph } from './graphs/db/features';
import { OrganizationGraph } from './graphs/db/organization';
import { StorageGraph } from './graphs/db/storage';
import { AnalysisGraph } from './graphs/db/analysis';
import { ClassificationGraph } from './graphs/ml/classification';
import { RegressionGraph } from './graphs/ml/regression';
import { ClusteringGraph } from './graphs/ml/clustering';
import { ExplorationGraph } from './graphs/ml/exploration';
import { AgentsGraph } from './graphs/ml/agents';
import { DynamicGraphDemo } from '~/components/graphs/dynamic-graph-demo/dynamic-graph-demo';
import { DynamicGraphDemo2 } from '~/components/graphs/dynamic-graph-demo-2/dynamic-graph-demo-2';
import { DocumentHead } from '@builder.io/qwik-city';

export const head: DocumentHead = {
  title: 'Labby',
  meta: [
    {
      name: 'description',
      content: 'Explore the chemical data ecosystem through interactive graphs. Understand how data flows from experiments to machine learning and back, and discover the tools that power modern chemistry.',
    },
  ],
};

export default component$(() => {
  const activeDbCategory = useSignal('Data Flow');
  const activeMlCategory = useSignal('Classification');
  const svgRef = useSignal<SVGSVGElement>();

  useVisibleTask$(({ cleanup }) => {
    let rafId: number | null = null;
    const onMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const svg = svgRef.value;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const x = clientX - rect.left;
          const y = clientY - rect.top;
          const grad = svg.querySelector('#cursor-grad');
          if (grad) {
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
              grad.setAttribute('cx', '-9999');
              grad.setAttribute('cy', '-9999');
            } else {
              grad.setAttribute('cx', String(x));
              grad.setAttribute('cy', String(y));
            }
          }
        }
        rafId = null;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    cleanup(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
    });
  });

  return (
    <div class="">

      {/* ── Hero ─────────────────────────────────────── */}
      <section class="relative section-container ">
        <div class="hero-section mb-3">
          {/* ── Procedural SVG background ─────────── */}
          <svg ref={svgRef} class="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            <defs>
              <radialGradient id="dot-gradient" cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
                <stop offset="0%" stop-color="white" stop-opacity="0.8" />
                <stop offset="100%" stop-color="white" stop-opacity="0" />
              </radialGradient>
              <pattern id="hero-dots" x="0" y="0" width="7" height="14" patternUnits="userSpaceOnUse">
                <ellipse cx="3.5" cy="7" rx="2" ry="4" fill="url(#dot-gradient)" fill-opacity="0.4" />
              </pattern>
              <radialGradient id="hero-mask-grad" cx="50%" cy="100%" r="100%" gradientUnits="objectBoundingBox">
                <stop offset="0%" stop-color="white" />
                <stop offset="100%" stop-color="black" />
              </radialGradient>
              {/* AND: multiply gradient with animated noise */}
              <filter id="noise-and-grad" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" result="noise">
                  <animate attributeName="seed" values="0;7;19;3;28;11;35;14;42;8" dur="20s" repeatCount="indefinite" calcMode="discrete" />
                </feTurbulence>
                <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
                <feBlend mode="multiply" in="SourceGraphic" in2="grayNoise" />
              </filter>
              {/* OR: cursor spotlight gradient (cx/cy updated via JS) */}
              <radialGradient id="cursor-grad" cx="-9999" cy="-9999" r="150" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="white" stop-opacity="0.9" />
                <stop offset="100%" stop-color="white" stop-opacity="0" />
              </radialGradient>
              <mask id="hero-dot-mask">
                <rect width="100%" height="100%" fill="url(#hero-mask-grad)" filter="url(#noise-and-grad)" />
                <rect width="100%" height="100%" fill="url(#cursor-grad)" />
              </mask>
              <radialGradient id="hero-emerald" cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
                <stop offset="0%" stop-color="#8afff9" stop-opacity="1" />
                <stop offset="100%" stop-color="#8afff9" stop-opacity="0" />
              </radialGradient>
              <filter id="blur" x="-100%" y="-100%" width="400%" height="400%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10 40" />
              </filter>
            </defs>
            <ellipse cx="50%" cy="100%" rx="30%" ry="7%" fill="#8afff9" filter="url(#blur)">
              <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
            </ellipse>
            <rect width="100%" height="100%" fill="url(#hero-dots)" mask="url(#hero-dot-mask)" />
          </svg>
          {/*----------------------------------------------------*/}
          <div class="relative z-10 px-8 py-42 text-center">
            <h1 class="text-ink mb-6">
              Granular chemistry data<br />In one place and one format<br />
            </h1>
            <p class="text-ink font-semibold text-lg max-w-2xl mx-auto mb-10">
              One platform to manage, visualize, combine and learn from all your chemistry data, with real-time insights powered by concrete and agentic AI.
            </p>
            <div class="flex gap-4 justify-center flex-wrap">
              <a
                href="/dashboard"
                class="px-6 py-3 btn-pill alternate"
              >
                Open Dashboard
              </a>
              {/**<a href="#features" class="btn-pill text-sm px-5 py-2">
                Learn More
              </a> */}
            </div>
          </div>
        </div>
      </section>

      {/* ── Database Section ─────────────────────────────────────── */}
      <section class="relative section-container flex flex-row">
        <div class="section-padding dash-left" />
        <div class="flex flex-col w-[var(--inner-width)] max-w-[100vw] mx-auto ">
          <div class="relative dash-left dash-right w-full p-16">
            <h2 class="text-ink text-center mb-6">Catalogue data </h2>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto text-center">
              <ScrollThrough word_list={['log results', 'analyze', 'filter by metadata']} /> dynamically across domains, quickly and safely.
            </p>
          </div>
          <div class="subsection-container bg-(--color-canvas)">
            <div class="corner-decor" />
            <div class="h-[500px] text-center relative">
              {/**categories map and scroll section */}
              <RadioPillGroup labels={['Data Flow', 'Tests', 'Organization', 'Storage', 'Analysis']} active={activeDbCategory} />
              <FadingDisplay active_id={activeDbCategory}>
                <FadingSection id="Data Flow">
                  <CollectionGraph />
                </FadingSection>
                <FadingSection id="Tests">
                  <FeaturesGraph />
                </FadingSection>
                <FadingSection id="Organization">
                  <OrganizationGraph />
                </FadingSection>
                <FadingSection id="Storage">
                  <StorageGraph />
                </FadingSection>
                <FadingSection id="Analysis">
                  <AnalysisGraph />
                </FadingSection>
              </FadingDisplay>
            </div>
          </div>
          <div class="relative dash-left dash-right w-full p-16 overflow-hidden h-120">
            <h2 class="text-ink text-center mb-6 relative z-20 pointer-events-none">Put Graphs Here</h2>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto text-center pointer-events-none pl-20">
              <ScrollThrough word_list={['add', 'more', 'blurbs']} /> static blurb.
            </p>
            <div class="absolute bottom-4 -right-10">
              <DynamicGraphDemo />
            </div>
            <div class="absolute top-0 left-0 z-1 w-[600px] aspect-square max-sm:w-[300px] max-sm:-top-40">
              <DynamicGraphDemo2 />
            </div>
          </div>
        </div>

        <div class="section-padding dash-right" />
      </section>
      <section class="relative section-container flex flex-row">
        <div class="section-padding dash-left" ><div class="absolute inset-[2px] z-20 bg-gradient-to-b from-transparent to-(--color-surface) pointer-events-none" /></div>
        <div class="flex flex-col w-[var(--inner-width)] max-w-[100vw] relative dash-right dash-left">
          <div class="grid grid-cols-3 divide-x divide-edge py-6 das">
            <div class="px-10">
              <LuBrain class="w-6 h-6 mb-2 text-ink" />
              <p class="text-2xl font-medium text-accent tracking-tight">Learn</p>
              <p class="text-xs text-muted mt-1 tracking-widest uppercase">Across Domains</p>
            </div>
            <div class="px-10">
              <LuLineChart class="w-6 h-6 mb-2 text-ink" />
              <p class="text-2xl font-medium text-emerald tracking-tight">Analyze</p>
              <p class="text-xs text-muted mt-1 tracking-widest uppercase">Modes of Failure</p>
            </div>
            <div class="px-10">
              <LuGitFork class="w-6 h-6 mb-2 text-ink" />
              <p class="text-2xl font-medium text-amber tracking-tight">Predict</p>
              <p class="text-xs text-muted mt-1 tracking-widest uppercase">Rates and Results</p>
            </div>
          </div>
          <div class="relative w-full p-16">
            <h2 class="text-ink text-center mb-6">Put Molecule model here</h2>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto text-center">
              <ScrollThrough word_list={['add', 'more', 'blurbs']} /> static blurb.
            </p>
          </div>
        </div>
        <div class="section-padding dash-right" ><div class="absolute inset-[2px] z-20 bg-gradient-to-b from-transparent to-(--color-surface) pointer-events-none" /></div>
      </section>

      {/* ── ML Section ──────────────────────────────── */}
      <section class="relative section-container  flex flex-row solid">
        <div class="section-padding dash-left" />
        <div class="w-[var(--inner-width)] max-w-[100vw] ">

          <div class="relative dash-left dash-right w-full p-16">
            <h2 class="text-ink text-center mb-6">AI powered insights, powered by broad domain data </h2>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto text-center mb-8">
              <ScrollThrough word_list={['classify results', 'predict properties', 'cluster methods', 'plan experiments']} /> with automatic analysis
            </p>

          </div>
          <div class="subsection-container bg-[var(--color-canvas)]">
            <div class="corner-decor" />
            <div class="h-[500px] text-center">
              {/**categories map and scroll section */}
              <RadioPillGroup labels={['Classification', 'Regression', 'Clustering', 'Exploration', 'Agents']} active={activeMlCategory} />
              <FadingDisplay active_id={activeMlCategory}>
                <FadingSection id="Classification">
                  <ClassificationGraph />
                </FadingSection>
                <FadingSection id="Regression">
                  <RegressionGraph />
                </FadingSection>
                <FadingSection id="Clustering">
                  <ClusteringGraph />
                </FadingSection>
                <FadingSection id="Exploration">
                  <ExplorationGraph />
                </FadingSection>
                <FadingSection id="Agents">
                  <AgentsGraph />
                </FadingSection>
              </FadingDisplay>
            </div>
          </div>
          <div class="relative dash-left dash-right w-full p-16">
            <h2 class="text-ink text-center mb-6">Put Clustering Node 3d Graph Here</h2>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto text-center">
              <ScrollThrough word_list={['add', 'more', 'blurbs']} /> static blurb.
            </p>
          </div>
        </div>
        <div class="section-padding dash-right" />


      </section>


    </div>
  );
});
