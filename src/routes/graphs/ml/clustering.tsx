import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  center: N('center', 'Data', 275, 95, 110, 60, 'rect', '#8afff9', {
    svg_content: ICONS.data, svg_viewbox: '0 0 40 40',
  }),
  a: N('a', 'Cluster A', 80, 25, 120, 50, 'rect', '#94a3b8'),
  b: N('b', 'Cluster B', 450, 25, 120, 50, 'rect', '#94a3b8'),
  c: N('c', 'Cluster C', 80, 175, 120, 50, 'rect', '#94a3b8'),
  d: N('d', 'Cluster D', 450, 175, 120, 50, 'rect', '#94a3b8'),
};

const edges = {
  ca: E('ca', 'center', 'a', { speed: 1, dash_space: 8, stiffness: 0.7 }),
  cb: E('cb', 'center', 'b', { speed: 1, dash_space: 8, stiffness: 0.7 }),
  cc: E('cc', 'center', 'c', { speed: 1, dash_space: 8, stiffness: 0.7 }),
  cd: E('cd', 'center', 'd', { speed: 1, dash_space: 8, stiffness: 0.7 }),
};

export const ClusteringGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
