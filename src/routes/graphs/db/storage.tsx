import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  a: N('a', 'Memory', 30, 80, 110, 50, 'rect', '#fbbf24'),
  b: N('b', 'Local Disk', 195, 80, 120, 50, 'rect'),
  c: N('c', 'Cloud', 375, 80, 110, 50, 'rect'),
  d: N('d', 'Archive', 535, 65, 110, 70, 'rect', '#8afff9', {
    svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40',
  }),
  e: N('e', 'Backup', 230, 180, 120, 50, 'rect', '#64748b'),
};

const edges = {
  ab: E('ab', 'a', 'b', { speed: 1.5, dash_space: 8 }),
  bc: E('bc', 'b', 'c', { speed: 0.8, dash_space: 8 }),
  cd: E('cd', 'c', 'd', { speed: 0.5, dash_space: 10 }),
  be: E('be', 'b', 'e', { dash_space: 12, color: '#64748b' }),
};

export const StorageGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
