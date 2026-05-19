import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  a: N('a', 'Data', 40, 90, 110, 50, 'rect'),
  b: N('b', 'Preprocess', 205, 90, 130, 50, 'rect'),
  c: N('c', 'Statistics', 395, 90, 120, 50, 'rect'),
  d: N('d', 'Visualize', 570, 75, 110, 70, 'rect', '#8afff9', {
    svg_content: ICONS.search, svg_viewbox: '0 0 40 40',
  }),
};

const edges = {
  ab: E('ab', 'a', 'b', { speed: 1, dash_space: 8 }),
  bc: E('bc', 'b', 'c', { speed: 1, dash_space: 8 }),
  cd: E('cd', 'c', 'd', { speed: 1, dash_space: 8 }),
};

export const AnalysisGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
