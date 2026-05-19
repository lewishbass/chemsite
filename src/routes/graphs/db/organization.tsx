import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';

const nodes = {
  a: N('a', 'Project', 265, 20, 130, 50, 'rect'),
  b: N('b', 'Experiment A', 80, 120, 130, 50, 'rect'),
  c: N('c', 'Experiment B', 450, 120, 130, 50, 'rect'),
  d: N('d', 'Samples', 80, 220, 130, 50, 'rect'),
  e: N('e', 'Metadata', 450, 220, 130, 50, 'rect'),
};

const edges = {
  ab: E('ab', 'a', 'b', { stiffness: 0.7, speed: 0.6, dash_space: 8 }),
  ac: E('ac', 'a', 'c', { stiffness: 0.7, speed: 0.6, dash_space: 8 }),
  bd: E('bd', 'b', 'd', { speed: 0.6, dash_space: 8 }),
  ce: E('ce', 'c', 'e', { speed: 0.6, dash_space: 8 }),
};

export const OrganizationGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
