import { component$, useVisibleTask$ } from '@builder.io/qwik';

const STROKE = '#0095eb';
const FONT   = "'Courier New',monospace";

// Stable data
const BAR_DATA  = [0.23, 0.67, 0.42, 0.89, 0.55, 0.71, 0.34, 0.78];
const LINE_DATA = [0.31, 0.88, 0.45, 0.62, 0.79, 0.53, 0.67, 0.41];

// Unique pie proportions per dot (3 slices each summing to 1)
const PIE_DATA: [number, number, number][] = [
  [0.40, 0.35, 0.25],
  [0.50, 0.20, 0.30],
  [0.30, 0.45, 0.25],
  [0.55, 0.25, 0.20],
  [0.35, 0.40, 0.25],
  [0.45, 0.30, 0.25],
  [0.25, 0.50, 0.25],
  [0.60, 0.15, 0.25],
];
const PIE_LABELS = ['α', 'β', 'γ'];

// Shared axis layout
const W  = 600, H  = 430;
const CL = 50,  CR = 550, CT = 10, CB = 420;
const CH = CB - CT; // 260
const STEP = (CR - CL) / 7;
const BW = 48, BAR_RX = 4;

const f   = (n: number) => n.toFixed(2);
const pX  = (i: number) => CL + i * STEP;
const bTY = (i: number) => CB - BAR_DATA[i]  * CH;  // bar top y (static base)
const lTY = (i: number) => CB - LINE_DATA[i] * CH;  // dot base y

// Bar oscillation
const BAR_MAG    = [7, 12, 5, 14, 9, 11, 6, 13];
const BAR_PERIOD = [3200, 4100, 2800, 4900, 2200, 3700, 4500, 2600];
const BAR_PHASE  = [0.3, 2.1, 4.7, 1.9, 5.2, 3.3, 0.8, 6.1];

// Dot idle oscillation
const DOT_MAG    = [3, 4, 2.5, 5, 3, 4.5, 2, 4];
const DOT_PERIOD = [2800, 3500, 2200, 4200, 3000, 3800, 2500, 3200];
const DOT_PHASE  = [1.1, 3.5, 0.7, 2.8, 4.2, 1.8, 5.1, 2.3];


// Bar: open path – rounded top corners, square bottom, no bottom edge
function barPath(x: number, y: number, w: number, h: number): string {
  if (h < 1) return '';
  const r = Math.min(BAR_RX, w / 2, h / 2);
  return (
    `M${f(x)},${f(y + h)} ` +
    `L${f(x)},${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} ` +
    `L${f(x + w - r)},${f(y)} Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + r)} ` +
    `L${f(x + w)},${f(y + h)}`
  );
}

// Horizontal-exit cubic bezier (STIFFNESS = 0.5)
function bezPath(x1: number, y1: number, x2: number, y2: number): string {
  const h = (x2 - x1) * 0.5;
  return `M${f(x1)},${f(y1)} C${f(x1 + h)},${f(y1)} ${f(x2 - h)},${f(y2)} ${f(x2)},${f(y2)}`;
}

// Pie wedge (arc path)
function piePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
  const large = (a1 - a0 > Math.PI) ? 1 : 0;
  return `M${f(cx)},${f(cy)} L${f(x1)},${f(y1)} A${f(r)},${f(r)} 0 ${large} 1 ${f(x2)},${f(y2)} Z`;
}

// Type-safe SVG element accessor – throws with a clear message if the element is missing
function getSVGEl<T extends SVGElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`DynamicGraphDemo: element #${id} not found`);
  return el as unknown as T;
}

export const DynamicGraphDemo = component$(() => {
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    // Bar elements
    const barPaths = Array.from({ length: 8 }, (_, i) => getSVGEl<SVGPathElement>(`dgb-path-${i}`));
    const barHits  = Array.from({ length: 8 }, (_, i) => getSVGEl<SVGRectElement>(`dgb-hit-${i}`));
    const barVals  = Array.from({ length: 8 }, (_, i) => getSVGEl<SVGTextElement>(`dgb-val-${i}`));

    // Dot elements
    const dots        = Array.from({ length: 8 }, (_, i) => getSVGEl<SVGCircleElement>(`dgl-dot-${i}`));
    const dotHits     = Array.from({ length: 8 }, (_, i) => getSVGEl<SVGCircleElement>(`dgl-hit-${i}`));
    const dotTips     = Array.from({ length: 8 }, (_, i) => getSVGEl<SVGTextElement>(`dgl-tip-${i}`));
    const legendTexts = Array.from({ length: 8 }, (_, i) =>
      [0, 1, 2].map(s => getSVGEl<SVGTextElement>(`dgl-legend-text-${i}-${s}`))
    );

    const segs   = Array.from({ length: 7 }, (_, i) => getSVGEl<SVGPathElement>(`dgl-seg-${i}`));
    const clipCs = Array.from({ length: 8 }, (_, i) => getSVGEl<SVGCircleElement>(`dgl-clipc-${i}`));
    const pies   = Array.from({ length: 8 }, (_, i) =>
      [0, 1, 2].map(s => getSVGEl<SVGPathElement>(`dgl-pie-${i}-${s}`))
    );


    // Bar state
    const BAR_BASE_H  = BAR_DATA.map(v => v * CH);
    const barHovered  = new Array<boolean>(8).fill(false);
    const barCurMag   = BAR_MAG.slice();
    const barCurShift = new Array<number>(8).fill(0);
    const barCurValOp = new Array<number>(8).fill(0);

    // Dot state
    const dotHovered       = new Array<boolean>(8).fill(false);
    const dotCurR          = new Array<number>(8).fill(5);
    const dotCurXOff       = new Array<number>(8).fill(0);
    const dotCurPieOp      = new Array<number>(8).fill(0);
    const dotCurTipOp      = new Array<number>(8).fill(0);
    const dotCurIdleMag    = DOT_MAG.slice();
    const dotCurLegendDrop = new Array<number>(8).fill(-12);

    // Pie slice state
    const pieSliceHovered   = Array.from({ length: 8 }, () => new Array<boolean>(3).fill(false));
    const dotCurSliceFillOp = Array.from({ length: 8 }, () => new Array<number>(3).fill(0));


    const SPRING = 0.08;

    barHits.forEach((el, i) => {
      el.addEventListener('mouseenter', () => { barHovered[i] = true; });
      el.addEventListener('mouseleave', () => { barHovered[i] = false; });
    });
    dotHits.forEach((el, i) => {
      el.addEventListener('mouseenter', () => { dotHovered[i] = true; });
      el.addEventListener('mouseleave', () => { dotHovered[i] = false; });
    });
    for (let i = 0; i < 8; i++) {
      for (let s = 0; s < 3; s++) {
        pies[i][s].addEventListener('mouseenter', () => { pieSliceHovered[i][s] = true; });
        pies[i][s].addEventListener('mouseleave', () => { pieSliceHovered[i][s] = false; });
      }
    }

    let raf: number;
    function frame(now: number) {
      // ── Bars ───────────────────────────────────────────────────
      for (let i = 0; i < 8; i++) {
        barCurMag[i]   += ((barHovered[i] ? 0  : BAR_MAG[i]) - barCurMag[i])   * SPRING;
        barCurShift[i] += ((barHovered[i] ? 20 : 0)           - barCurShift[i]) * SPRING;
        const osc = barCurMag[i] * Math.sin(now / BAR_PERIOD[i]*2 + BAR_PHASE[i]);
        const h   = Math.max(2, BAR_BASE_H[i] + osc + barCurShift[i]);
        barPaths[i].setAttribute('d', barPath(pX(i) - BW / 2, CB - h, BW, h));
        barCurValOp[i] += ((barHovered[i] ? 1 : 0) - barCurValOp[i]) * SPRING;
        barVals[i].setAttribute('opacity', barCurValOp[i].toFixed(3));
        barVals[i].setAttribute('y', (CB - h - 6).toFixed(1));
      }

      // ── Dots ───────────────────────────────────────────────────
      let hovI = -1;
      for (let i = 0; i < 8; i++) if (dotHovered[i]) { hovI = i; break; }

      const cx = new Array<number>(8);
      const cy = new Array<number>(8);

      for (let i = 0; i < 8; i++) {
        dotCurR[i]       += ((dotHovered[i] ? 30 : 5)        - dotCurR[i])       * SPRING;
        dotCurIdleMag[i] += ((dotHovered[i] ? 0 : DOT_MAG[i]) - dotCurIdleMag[i]) * SPRING;

        let tXOff = 0;
        if (hovI >= 0 && i !== hovI) {
          const d   = i - hovI;
          const mag = [0, 20, 10, 5, 2, 1][Math.min(Math.abs(d), 5)];
          tXOff = mag * Math.sign(d) * (i == 0 || i == 7 ? 0 : 1);
        }
        dotCurXOff[i] += (tXOff - dotCurXOff[i]) * SPRING;
        cx[i] = pX(i) + dotCurXOff[i];
        cy[i] = lTY(i) + dotCurIdleMag[i] * Math.sin(now / DOT_PERIOD[i]*2 + DOT_PHASE[i]);

        dots[i].setAttribute('cx', cx[i].toFixed(2));
        dots[i].setAttribute('cy', cy[i].toFixed(2));
        dots[i].setAttribute('r',  dotCurR[i].toFixed(2));
        dotHits[i].setAttribute('cx', cx[i].toFixed(2));
        dotHits[i].setAttribute('cy', cy[i].toFixed(2));
        dotHits[i].setAttribute('r',  Math.max(dotCurR[i], 12).toFixed(2));
        clipCs[i].setAttribute('cx', cx[i].toFixed(2));
        clipCs[i].setAttribute('cy', cy[i].toFixed(2));
        clipCs[i].setAttribute('r',  dotCurR[i].toFixed(2));

        const tOp = dotHovered[i] ? 1 : 0;
        dotCurPieOp[i] += (tOp - dotCurPieOp[i]) * SPRING;
        dotCurTipOp[i] += (tOp - dotCurTipOp[i]) * SPRING;

        const pieR = Math.max(1, dotCurR[i] - 4);
        let a = -Math.PI / 2;
        for (let s = 0; s < 3; s++) {
          const da = PIE_DATA[i][s] * Math.PI * 2;
          pies[i][s].setAttribute('d', piePath(cx[i], cy[i], pieR, a, a + da));
          pies[i][s].setAttribute('stroke-opacity', (dotCurPieOp[i] * 0.55).toFixed(3));
          dotCurSliceFillOp[i][s] += ((pieSliceHovered[i][s] ? 0.3 : 0) - dotCurSliceFillOp[i][s]) * SPRING;
          pies[i][s].setAttribute('fill-opacity', dotCurSliceFillOp[i][s].toFixed(3));
          a += da;
        }

        // Legend: drop-in animation and per-slice bold highlight
        if (!dotHovered[i]) {
          dotCurLegendDrop[i] = -12; // instant reset while hidden so next hover re-plays the drop
        } else {
          dotCurLegendDrop[i] += (0 - dotCurLegendDrop[i]) * SPRING;
        }
        for (let s = 0; s < 3; s++) {
          const legY = cy[i] + dotCurR[i] + 14 + s * 14 + dotCurLegendDrop[i];
          legendTexts[i][s].setAttribute('y', legY.toFixed(2));
          legendTexts[i][s].setAttribute('x', cx[i].toFixed(2));
          legendTexts[i][s].setAttribute('opacity', dotCurPieOp[i].toFixed(3));
          legendTexts[i][s].setAttribute('fill', pieSliceHovered[i][s] ? '#fff' : '#fff8');
          legendTexts[i][s].setAttribute('font-weight', pieSliceHovered[i][s] ? 'bold' : 'normal');
        }

        dotTips[i].setAttribute('opacity', dotCurTipOp[i].toFixed(3));
        dotTips[i].setAttribute('x', cx[i].toFixed(2));
        dotTips[i].setAttribute('y', (cy[i] - dotCurR[i] - 8).toFixed(2));
      }

      // ── Segments ───────────────────────────────────────────────
      for (let i = 0; i < 7; i++) {
        const x1 = cx[i] + dotCurR[i], x2 = cx[i + 1] - dotCurR[i + 1];
        segs[i].setAttribute('d', x2 > x1 ? bezPath(x1, cy[i], x2, cy[i + 1]) : '');
      }

      

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    cleanup(() => cancelAnimationFrame(raf));
  });

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style="display:block;overflow:hidden;"
    >
      <defs>
        {LINE_DATA.map((_, i) => (
          <clipPath key={i} id={`dgl-clip-${i}`}>
            <circle id={`dgl-clipc-${i}`} cx={pX(i)} cy={lTY(i)} r="5" />
          </clipPath>
        ))}
      </defs>

      {/* Shared axis */}
      <line x1={CL-60} y1={CB} x2={CR+60} y2={CB} stroke={STROKE} stroke-width="1" shape-rendering="optimizeSpeed" opacity="1" />

      {/* Bar chart (behind line chart) */}
      {BAR_DATA.map((v, i) => {
        const bx = pX(i) - BW / 2;
        const h  = v * CH;
        return (
          <g key={i}>
            <path id={`dgb-path-${i}`} d={barPath(bx, CB - h, BW, h)} fill="none" stroke={STROKE} stroke-width="1" shape-rendering="optimizeSpeed" />
            <rect id={`dgb-hit-${i}`}  x={bx - 5} y={CT} width={BW + 10} height={CH} fill="transparent" stroke="none" style="cursor:default;" />
            <text id={`dgb-val-${i}`}  x={pX(i)}  y={CB - h - 6} text-anchor="middle" fill={'#fff'} font-size="13" font-family={FONT} opacity="0" shape-rendering="optimizeSpeed">
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* Line chart (on top) */}
      {Array.from({ length: 7 }, (_, i) => (
        <path
          key={i}
          id={`dgl-seg-${i}`}
          d={bezPath(pX(i) + 5, lTY(i), pX(i + 1) - 5, lTY(i + 1))}
          fill="none"
          stroke={STROKE}
          stroke-width="1"
          shape-rendering="optimizeSpeed"
        />
      ))}
      {LINE_DATA.map((v, i) => (
        <g key={i}>
          <g clip-path={`url(#dgl-clip-${i})`}>
            {[0, 1, 2].map(s => (
              <path
                key={s}
                id={`dgl-pie-${i}-${s}`}
                d=""
                fill={STROKE}
                fill-opacity="0"
                stroke={STROKE}
                stroke-width="1"
                stroke-opacity="0"
                pointer-events="all"
                style="cursor:default;"
                shape-rendering="optimizeSpeed"
              />
            ))}
          </g>
          <circle id={`dgl-dot-${i}`} cx={pX(i)} cy={lTY(i)} r="5"  fill="none" stroke={STROKE} stroke-width="1" shape-rendering="optimizeSpeed" />
          <circle id={`dgl-hit-${i}`} cx={pX(i)} cy={lTY(i)} r="12" fill="transparent" stroke="none" style="cursor:default;" />
              <text id={`dgl-tip-${i}`} x={pX(i)} y={lTY(i) - 15} text-anchor="middle" fill={'#fff'} font-size="13" font-family={FONT} opacity="0" shape-rendering="optimizeSpeed">
                  {`${i.toFixed(0)}, ${v.toFixed(2)}`}
              </text>
            {[0, 1, 2].map(s => (
              <text
                key={s}
                id={`dgl-legend-text-${i}-${s}`}
                x={pX(i)}
                y={lTY(i) + 15 + s * 14}
                text-anchor="middle"
                fill={'#fff8'}
                font-size="11"
                font-family={FONT}
                opacity="0"
                shape-rendering="optimizeSpeed"
              >
                {`${PIE_LABELS[s]}: ${(PIE_DATA[i][s] * 100).toFixed(0)}%`}
              </text>
            ))}
        </g>
        
      ))}

    </svg>
  );
});
