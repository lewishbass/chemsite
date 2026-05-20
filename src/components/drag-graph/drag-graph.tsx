

// the drag chart does two things
// drag the view
// render flowchart and graphics

// dragging
// when a user clicks and drags, it drags the view of the flowchart and background
// the dragging is implemented updating a css - transform: translate(x, y) on the displayed content

// view
// the entire graphic is a static svg, with a filter effect for a background, and a flowchart in the foreground
// the background is a dot grid, like the current subsection
// the flowchart is supplied as a dict of nodes (key by uuid) and dict of edges (key by uuid)
// nodes:
// - uuid (string) usually a, b, c, d, etc.
// - position (x, y)
// - dimensions (width, height)
// - svg content (string of a svg element)
// - label (string) rendered above block
// - shape (string) 'rect', used for drawing, hitbox
// - tooltip (string) optional, rendered on hover over hitbox
// - color (string) optional, used for rendering block color, default is gray

// edges:
// - uuid (string) usually a-b, b-c, etc.
// - source (string) uuid of the source node
// - target (string) uuid of the target node
// - label (string) optional, rendered along the edge
// - tooltip (string) optional, rendered on hover over edge
// - stiffness (number) optional, higher = straighter, lower = more curved
// - speed (number), optional, used for animating flow along the edge
// - dash_space (number), optional, spacing between dashes in pixels
// - color (string) optional, default is white
// - start_frac (number) optional, 0=start of exit edge, 0.5=middle, 1=end; default 0.5
// - end_frac (number) optional, 0=start of entry edge, 0.5=middle, 1=end; default 0.5

// edges exit/enter perpendicular to the nearest side of each node
// edges render before nodes so that nodes are always on top of edges
// each node has four small corner decoration boxes

// use monospace semibold courier


import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GraphNode {
  uuid: string;
  position: { x: number; y: number };
  dimensions: { width: number; height: number };
  svg_content?: string;
  label?: string;
  shape: 'rect';
  tooltip?: string;
  color?: string;
  /** Fill the node interior with a transparent tint. Default true. */
  fill?: boolean;
  /** Border decoration style. Default 'corners'. */
  border?: 'corners' | 'rounded' | 'dense' | 'none';
  /** viewBox string for svg_content scaling, e.g. "0 0 40 40". */
  svg_viewbox?: string;
  /** Whether to draw an inner border along with the outer border. Default false. */
  inner_border?: boolean;
  /** Optional description shown in an opaque block below the node on hover. Use \n for line breaks. */
  hover_text?: string;
  /** Optional URL to navigate to on a non-drag click. */
  href?: string;
}

export interface GraphEdge {
  uuid: string;
  source: string;
  target: string;
  label?: string;
  tooltip?: string;
  /** Higher = straighter line, lower = more curved. Range [0,1], default 0.5 */
  stiffness?: number;
  /** Flow animation speed along edge. Higher = faster. */
  speed?: number;
  /** Spacing between dashes in pixels. Omit for solid line. */
  dash_space?: number;
  color?: string;
  /** Fractional position along the source node's exit edge. 0=start, 0.5=middle, 1=end. Default 0.5. */
  start_frac?: number;
  /** Fractional position along the target node's entry edge. 0=start, 0.5=middle, 1=end. Default 0.5. */
  end_frac?: number;
}

type DragGraphProps = {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
};

// ── Node / Edge builder helpers ──────────────────────────────────────────────

/** Shorthand constructor for a GraphNode. `opts` accepts fill, border, svg_content, svg_viewbox, tooltip, inner_border. */
export const N = (
  uuid: string, label: string,
  x: number, y: number, w: number, h: number,
  shape: GraphNode['shape'] = 'rect',
  color = '#8afff9',
  opts: Partial<Pick<GraphNode, 'fill' | 'border' | 'svg_content' | 'svg_viewbox' | 'tooltip' | 'inner_border' | 'hover_text' | 'href'>> = {},
): GraphNode => ({ uuid, label, position: { x, y }, dimensions: { width: w, height: h }, shape, color, ...opts });

/** Shorthand constructor for a GraphEdge. */
export const E = (
  uuid: string, source: string, target: string,
  opts: Partial<Omit<GraphEdge, 'uuid' | 'source' | 'target'>> = {},
): GraphEdge => ({ uuid, source, target, ...opts });

// ── Constants ────────────────────────────────────────────────────────────────

const CORNER = 7;
const ROUND_CORNERS = 6;
const DASH_SIZE = 5;
const DASH_SPEED = 3;
const FONT = "font-family:'Courier New',Courier,monospace;font-weight:600;";

// ── Geometry helpers ─────────────────────────────────────────────────────────

type Side = 'left' | 'right' | 'top' | 'bottom';

/** Returns which side of a node is nearest to an external point (tx, ty). */
function nearestSide(node: GraphNode, tx: number, ty: number): Side {
  const cx = node.position.x + node.dimensions.width / 2;
  const cy = node.position.y + node.dimensions.height / 2;
  const dx = tx - cx, dy = ty - cy;
  const dxn = dx / (node.dimensions.width / 2);
  const dyn = dy / (node.dimensions.height / 2);
  if (Math.abs(dxn) >= Math.abs(dyn)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** Connection point on a node side and its outward perpendicular unit vector. */
function sidePoint(
  node: GraphNode,
  side: Side,
  frac: number,
): { x: number; y: number; px: number; py: number } {
  const { x, y } = node.position;
  const { width: w, height: h } = node.dimensions;
  switch (side) {
    case 'right':  return { x: x + w,       y: y + frac * h, px:  1, py:  0 };
    case 'left':   return { x: x,            y: y + frac * h, px: -1, py:  0 };
    case 'top':    return { x: x + frac * w, y: y,            px:  0, py: -1 };
    case 'bottom': return { x: x + frac * w, y: y + h,        px:  0, py:  1 };
  }
}

/** Builds a cubic-bezier path that exits/enters perpendicular to the nearest node edge. */
function buildEdge(
  edge: GraphEdge,
  nodes: Record<string, GraphNode>,
): { path: string; midX: number; midY: number } | null {
  const s = nodes[edge.source], t = nodes[edge.target];
  if (!s || !t) return null;

  const scx = s.position.x + s.dimensions.width / 2;
  const scy = s.position.y + s.dimensions.height / 2;
  const tcx = t.position.x + t.dimensions.width / 2;
  const tcy = t.position.y + t.dimensions.height / 2;

  const sSide = nearestSide(s, tcx, tcy);
  const tSide = nearestSide(t, scx, scy);

  const sp = sidePoint(s, sSide, edge.start_frac ?? 0.5);
  const tp = sidePoint(t, tSide, edge.end_frac ?? 0.5);

  const dx = tp.x - sp.x, dy = tp.y - sp.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const stiffness = Math.min(Math.max(edge.stiffness ?? 0.5, 0), 1);
  const handleLen = dist * (1 - stiffness);
  const f = (n: number) => n.toFixed(2);

  const c1x = sp.x + sp.px * handleLen, c1y = sp.y + sp.py * handleLen;
  const c2x = tp.x + tp.px * handleLen, c2y = tp.y + tp.py * handleLen;

  const path =
    `M${f(sp.x)},${f(sp.y)} ` +
    `C${f(c1x)},${f(c1y)} ` +
    `${f(c2x)},${f(c2y)} ` +
    `${f(tp.x)},${f(tp.y)}`;

  // Cubic bezier midpoint at t=0.5: B(0.5) = (P0 + 3*C1 + 3*C2 + P3) / 8
  const midX = (sp.x + 3 * c1x + 3 * c2x + tp.x) / 8;
  const midY = (sp.y + 3 * c1y + 3 * c2y + tp.y) / 8 - 8;

  return { path, midX, midY };
}

// ── Bounding box ─────────────────────────────────────────────────────────────

function computeBBox(nodes: Record<string, GraphNode>): { cx: number; cy: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of Object.values(nodes)) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + n.dimensions.width);
    maxY = Math.max(maxY, n.position.y + n.dimensions.height);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// ── Component ────────────────────────────────────────────────────────────────

export const DragGraph = component$(({ nodes, edges }: DragGraphProps) => {
  const panX = useSignal(0);
  const panY = useSignal(0);
  const isDragging = useSignal(false);
  const svgRef = useSignal<Element>();

  // Compute bounding-box centre for initial centering (captured as plain numbers by useVisibleTask$)
  const { cx: bboxCx, cy: bboxCy } = computeBBox(nodes);

  // Attach pan listeners directly to the DOM (avoids Qwik serialization overhead).
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const svg = svgRef.value as SVGSVGElement | undefined;
    if (!svg) return;

    // Center graph on mount
    panX.value = svg.clientWidth / 2 - bboxCx;
    panY.value = svg.clientHeight / 2 - bboxCy;

    let dragging = false, startX = 0, startY = 0;
    let downClientX = 0, downClientY = 0, wasDragged = false;

    const onDown = (e: MouseEvent) => {
      dragging = true;
      wasDragged = false;
      isDragging.value = true;
      startX = e.clientX - panX.value;
      startY = e.clientY - panY.value;
      downClientX = e.clientX;
      downClientY = e.clientY;
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      if (!wasDragged) {
        const dx = e.clientX - downClientX, dy = e.clientY - downClientY;
        if (dx * dx + dy * dy > 25) wasDragged = true;
      }
      panX.value = Math.min(Math.max(e.clientX - startX, -700), 700);
      panY.value = Math.min(Math.max(e.clientY - startY, -300), 300);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      isDragging.value = false;
    };
    const onClick = (e: MouseEvent) => {
      if (wasDragged) return;
      let el = e.target as Element | null;
      while (el && el !== svg) {
        const href = el.getAttribute('data-href');
        if (href) { window.location.href = href; break; }
        el = el.parentElement;
      }
    };

    // Hoverboxes are rendered in a separate layer, so bind node hover events explicitly.
    const nodeEls = Array.from(svg.querySelectorAll<SVGGElement>('.dg-node[data-node-id]'));
    const hoverEls = Array.from(svg.querySelectorAll<SVGGElement>('.dg-hoverbox[data-for]'));
    const hoverById = new Map(
      hoverEls
        .map(el => [el.getAttribute('data-for'), el] as const)
        .filter(([id]) => Boolean(id)),
    );
    const removeHoverListeners: Array<() => void> = [];

    nodeEls.forEach(nodeEl => {
      const nodeId = nodeEl.getAttribute('data-node-id');
      if (!nodeId) return;
      const hoverEl = hoverById.get(nodeId);
      if (!hoverEl) return;

      const onEnter = () => hoverEl.classList.add('dg-hoverbox--visible');
      const onLeave = () => hoverEl.classList.remove('dg-hoverbox--visible');

      nodeEl.addEventListener('mouseenter', onEnter);
      nodeEl.addEventListener('mouseleave', onLeave);
      removeHoverListeners.push(() => {
        nodeEl.removeEventListener('mouseenter', onEnter);
        nodeEl.removeEventListener('mouseleave', onLeave);
      });
    });

    svg.addEventListener('mousedown', onDown);
    svg.addEventListener('click', onClick);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    cleanup(() => {
      svg.removeEventListener('mousedown', onDown);
      svg.removeEventListener('click', onClick);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      removeHoverListeners.forEach(remove => remove());
    });
  });

  const nodeList = Object.values(nodes);
  const edgeList = Object.values(edges);
  const tx = panX.value, ty = panY.value;

  return (
    <svg
      ref={svgRef}
      shape-rendering="optimizeSpeed"
      style={`width:100%;height:500px;overflow:hidden;display:block;cursor:${isDragging.value ? 'grabbing' : 'grab'};`}
    >
      <defs>
        {/* Dot-grid background pattern */}
        <pattern id="dg-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="9" cy="9" r="1" style="fill:#888;opacity:0.15;" />
        </pattern>
        {/* Flow animation keyframes for animated edges */}
        <style>{`@keyframes dg-flow{to{stroke-dashoffset:-1000}}@keyframes dg-border{to{stroke-dashoffset:${-(DASH_SIZE * 2)}}}.dg-hoverbox{visibility:hidden;pointer-events:none;opacity:0;}.dg-hoverbox.dg-hoverbox--visible{visibility:visible;opacity:1;}.dg-node[data-href]{cursor:pointer;}`}</style>
      </defs>

      {/* Everything below pans together */}
      <g transform={`translate(${tx},${ty})`}>
        {/* Background: large rect tiled with dot grid */}
        <rect x="-700" y="-300" width="2300" height="1100" style="fill:url(#dg-dots);" shape-rendering="optimizeSpeed" />

        {/* ── Edges (rendered first, under nodes) ── */}
        <g>
          {edgeList.map(edge => {
            const built = buildEdge(edge, nodes);
            if (!built) return null;
            const { path: d, midX, midY } = built;

            const color = edge.color ?? 'white';
            const hasDash = (edge.dash_space ?? 0) > 0;
            const hasFlow = (edge.speed ?? 0) > 0;
            const dashLen = 10;
            const dashGap = hasDash ? edge.dash_space! : hasFlow ? 10 : 0;
            const dashStyle = hasDash || hasFlow ? `stroke-dasharray:${dashLen} ${dashGap};` : '';
            const animStyle = hasFlow
              ? `animation:dg-flow ${(50 / edge.speed!).toFixed(3)}s linear infinite;`
              : '';

            return (
              <g key={edge.uuid}>
                <path
                  d={d}
                  style={`fill:none;stroke:${color};stroke-width:1;${dashStyle}${animStyle}`}
                  shape-rendering="optimizeSpeed"
                >
                  {edge.tooltip && <title>{edge.tooltip}</title>}
                </path>
                {edge.label && (
                  <text
                    x={midX} y={midY}
                    style={`${FONT}font-size:13px;font-weight:100;fill:${color};text-anchor:middle;`}
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* ── Nodes (rendered on top of edges) ── */}
        <g>
          {nodeList.map(node => {
            const { x, y } = node.position;
            const { width, height } = node.dimensions;
            const color = node.color ?? 'gray';
            const PAD = 12;
            const h2 = CORNER / 2;
            const fillOpacity = node.fill === false ? 0 : 0.15;
            const border = node.border ?? 'corners';
            const shapeStyle = `fill:${color};fill-opacity:${fillOpacity};stroke:${color};stroke-width:1;`;
            const cornerStyle = `fill:rgba(0,0,0,1);stroke:${color};stroke-width:1;`;


            return (
              <g key={node.uuid} class="dg-node user-select-none" data-node-id={node.uuid} data-href={node.href} transform={`translate(${x},${y})`}>
                {/* Label above the node */}
                {node.label && (
                  <text
                    x={width / 2} y={-12}
                    style={`${FONT}font-size:14px;font-weight:100;fill:${color};text-anchor:middle;`}
                  >
                    {node.label}
                  </text>
                )}

                {/* Border style: corners (default) */}
                {border === 'corners' ? (
                  <>
                    <rect x={0} y={0} width={width} height={height} style={shapeStyle} shape-rendering="optimizeSpeed">
                      {node.tooltip && <title>{node.tooltip}</title>}
                    </rect>
                    <rect x={-h2}        y={-h2}         width={CORNER} height={CORNER} style={cornerStyle} shape-rendering="optimizeSpeed" />
                    <rect x={width - h2} y={-h2}         width={CORNER} height={CORNER} style={cornerStyle} shape-rendering="optimizeSpeed" />
                    <rect x={-h2}        y={height - h2} width={CORNER} height={CORNER} style={cornerStyle} shape-rendering="optimizeSpeed" />
                    <rect x={width - h2} y={height - h2} width={CORNER} height={CORNER} style={cornerStyle} shape-rendering="optimizeSpeed" />
                  </>
                ) : border === 'rounded' ? (
                  <rect x={0} y={0} width={width} height={height} rx={ROUND_CORNERS} ry={ROUND_CORNERS}
                    style={`${shapeStyle}stroke-dasharray:${DASH_SIZE} ${DASH_SIZE};animation:dg-border ${DASH_SPEED}s linear infinite;`}
                    shape-rendering="optimizeSpeed">
                    {node.tooltip && <title>{node.tooltip}</title>}
                  </rect>
                ) : border === 'dense' ? (
                  <rect x={0} y={0} width={width} height={height}
                    style={`${shapeStyle}stroke-dasharray:2 3;`}
                    shape-rendering="optimizeSpeed">
                    {node.tooltip && <title>{node.tooltip}</title>}
                  </rect>
                ) :
                  ''
                }

                {node.inner_border && (
                  <rect x={PAD/2} y={PAD/2} width={width - PAD} height={height - PAD} rx={10}
                    style={`${shapeStyle}stroke-dasharray:2 3;`}
                    shape-rendering="optimizeSpeed" />
                )}

                {/* Inner SVG content, padded and clipped */}
                {node.svg_content && (
                  <svg
                    x={PAD} y={PAD}
                    width={width - 2 * PAD}
                    height={height - 2 * PAD}
                    viewBox={node.svg_viewbox}
                    style="overflow:hidden;"
                            dangerouslySetInnerHTML={node.svg_content.replaceAll('STROKE_HEX', color)} // dont set _html
                            shape-rendering="auto"
                  />
                )}


              </g>
            );
          })}
          {nodeList.map(node => {
            const hoverLines = node.hover_text ? node.hover_text.split('\n') : [];

            const { x, y } = node.position;
            const { width, height } = node.dimensions;
            const hbLineH = 16, hbPadX = 10, hbPadY = 8;
            const hbMaxChars = hoverLines.reduce((m, l) => Math.max(m, l.length), 0);
            const hbW = Math.max(width, hbMaxChars * 6.7 + hbPadX * 2, 180);
            const hbH = hoverLines.length * hbLineH + hbPadY * 2;
            const hbX = (width - hbW) / 2;
            const hbY = height + 6;
            return (
              <g key={`hover-${node.uuid}`} class="dg-hoverbox" data-for={node.uuid} transform={`translate(${hbX},${hbY})`}>
                <rect x={x} y={y} width={hbW} height={hbH} rx={3}
                  style="fill:rgba(10,10,15,0.95);stroke:rgba(255,255,255,0.15);stroke-width:1;" />
                {hoverLines.map((line, i) => (
                  <text key={i} x={hbPadX + x} y={hbPadY + (i + 0.75) * hbLineH + y}
                    style={`${FONT}font-size:11px;font-weight:400;fill:rgba(220,220,220,0.95);`}>
                    {line || '\u00A0'}
                  </text>
                ))}
              </g>
            )
          }
          )}
        </g>
      </g>
    </svg>
  );
});
