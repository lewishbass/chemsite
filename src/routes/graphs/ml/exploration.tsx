import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  a: N('a', 'Raw Data', 265, 20, 130, 50, 'rect'),
  b: N('b', 'EDA', 80, 120, 110, 60, 'rect', '#8afff9', {
    svg_content: ICONS.search, svg_viewbox: '0 0 40 40',
  }),
  c: N('c', 'Hypotheses', 450, 120, 130, 50, 'rect'),
  d: N('d', 'Experiments', 80, 220, 130, 50, 'rect'),
  e: N('e', 'Validation', 450, 220, 130, 50, 'rect'),
};

const edges = {
  ab: E('ab', 'a', 'b', { stiffness: 0.35 }),
  ac: E('ac', 'a', 'c', { stiffness: 0.35 }),
  bd: E('bd', 'b', 'd', { speed: 0.8, dash_space: 8 }),
  ce: E('ce', 'c', 'e', { speed: 0.8, dash_space: 8 }),
  de: E('de', 'd', 'e', { dash_space: 12, color: '#64748b' }),
};

export const ExplorationGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
