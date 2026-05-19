import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const nodes = {
  a: N('a', 'Instrument', 40 , 90, 60, 60, 'rect', '#8afff9', { inner_border:true, svg_content: ICONS.search, svg_viewbox: '0 0 40 40', hover_text: 'This is the instrument node, This is the instr\n test part 2', href: 'http://google.com' }),
  b: N('b', 'Raw Data'  , 230, 90, 60, 60, 'rect', '#8afff9', { inner_border:true, svg_content: ICONS.beaker, svg_viewbox: '0 0 40 40', hover_text: 'This is the raw data node', href: '/raw-data', border: 'rounded' }),
  c: N('c', 'Validated' , 420, 90, 60, 60, 'rect', '#8afff9', { inner_border:true, svg_content: ICONS.list, svg_viewbox: '0 0 40 40', hover_text: 'This is the validated node', href: '/validated', border: 'none' }),
  d: N('d', 'Database'  , 575, 75, 60, 60, 'rect', '#8afff9', { inner_border:true, svg_content: ICONS.list, svg_viewbox: '0 0 40 40', hover_text: 'This is the database node', href: '/database', border: 'dense' }),
};

const edges = {
  ab: E('ab', 'a', 'b', { speed: 1.2, dash_space: 8 }),
  bc: E('bc', 'b', 'c', { label: 'validate' }),
  cd: E('cd', 'c', 'd', { speed: 0.8, dash_space: 10 }),
};

export const CollectionGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
