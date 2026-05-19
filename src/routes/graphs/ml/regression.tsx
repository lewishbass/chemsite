import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  a: N('a', 'Features', 30, 80, 120, 50, 'rect'),
  b: N('b', 'Regressor', 210, 80, 110, 60, 'rect', '#8afff9', {
    svg_content: ICONS.robot_arm, svg_viewbox: '0 0 40 40',
  }),
  c: N('c', 'Predictions', 390, 80, 130, 50, 'rect'),
  d: N('d', 'Loss', 390, 185, 120, 50, 'rect', '#fbbf24'),
  e: N('e', 'Optimizer', 210, 185, 120, 50, 'rect'),
};

const edges = {
  ab: E('ab', 'a', 'b', { speed: 1, dash_space: 8 }),
  bc: E('bc', 'b', 'c', { speed: 1, dash_space: 8 }),
  cd: E('cd', 'c', 'd'),
  de: E('de', 'd', 'e', { color: '#fbbf24' }),
  eb: E('eb', 'e', 'b', { speed: 0.6, dash_space: 10, color: '#fbbf24', stiffness: 0.2 }),
};

export const RegressionGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
