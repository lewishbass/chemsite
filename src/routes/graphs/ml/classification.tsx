import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';

const nodes = {
  a: N('a', 'Train Set', 30, 55, 120, 50, 'rect'),
  b: N('b', 'Fit Model', 205, 55, 120, 50, 'rect'),
  c: N('c', 'Classifier', 385, 65, 120, 60, 'rect'),
  d: N('d', 'Test Set', 30, 165, 120, 50, 'rect'),
  e: N('e', 'Predict', 205, 165, 120, 50, 'rect'),
  f: N('f', 'Metrics', 385, 165, 120, 50, 'rect'),
};

const edges = {
  ab: E('ab', 'a', 'b', { speed: 1.2, dash_space: 8 }),
  bc: E('bc', 'b', 'c', { speed: 1.2, dash_space: 8 }),
  de: E('de', 'd', 'e'),
  ef: E('ef', 'e', 'f'),
  cf: E('cf', 'c', 'f', { dash_space: 10, color: '#64748b', stiffness: 0.3 }),
};

export const ClassificationGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
