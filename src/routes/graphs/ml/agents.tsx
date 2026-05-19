import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  a: N('a', 'User Query', 30, 95, 120, 60, 'rect', '#8afff9', {
    svg_content: ICONS.person, svg_viewbox: '0 0 40 40',
  }),
  b: N('b', 'Planner', 205, 95, 110, 60, 'rect', '#8afff9', {
    svg_content: ICONS.robot_arm, svg_viewbox: '0 0 40 40',
  }),
  c: N('c', 'Tool Use', 375, 40, 120, 50, 'rect'),
  d: N('d', 'Retrieval', 375, 165, 130, 50, 'rect'),
  e: N('e', 'Synthesis', 550, 95, 120, 50, 'rect'),
  f: N('f', 'Response', 690, 80, 110, 70, 'rect'),
};

const edges = {
  ab: E('ab', 'a', 'b', { speed: 1.5, dash_space: 8 }),
  bc: E('bc', 'b', 'c', { speed: 1.2, dash_space: 8 }),
  bd: E('bd', 'b', 'd', { speed: 1.2, dash_space: 8 }),
  ce: E('ce', 'c', 'e', { speed: 1, dash_space: 8 }),
  de: E('de', 'd', 'e', { speed: 1, dash_space: 8 }),
  ef: E('ef', 'e', 'f', { speed: 1.5, dash_space: 8 }),
};

export const AgentsGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
