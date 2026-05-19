import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  a: N('a', 'Raw Input', 40, 90, 120, 50, 'rect'),
  b: N('b', 'Normalize', 220, 90, 120, 50, 'rect'),
  c: N('c', 'Select', 400, 90, 110, 50, 'rect'),
  d: N('d', 'Feature Vec', 560, 75, 130, 70, 'rect', '#8afff9', {
    svg_content: ICONS.list, svg_viewbox: '0 0 40 40',
  }),
};

const edges = {
  ab: E('ab', 'a', 'b', { speed: 1, dash_space: 8 }),
  bc: E('bc', 'b', 'c', { speed: 0.8, dash_space: 8, label: 'rank' }),
  cd: E('cd', 'c', 'd', { speed: 1.2, dash_space: 8 }),
};

export const FeaturesGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
