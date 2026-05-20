import { component$, useVisibleTask$ } from '@builder.io/qwik';

const STROKE = '#0095eb';

const W  = 600, H  = 600;
const CX = W / 4, CY = H / 4;
const R  = 250;

const SLOW_SPIN = 0.000045; // rad/ms (~0.26°/s)
const FRICTION  = 0.025;    // velocity decays toward SLOW_SPIN each frame

// 7 slices, proportions sum to 1
const SLICE_DATA = [0.08, 0.12, 0.26, 0.14, 0.10, 0.20, 0.10];
const SLICE_LABELS = ['HPLC', 'MS', 'NMR', 'UV-Vis', 'IR', 'Other', 'Manual'];
const RADIAL_DATA =
  Array.from({ length: 5 }, () =>
    Array.from({ length: 20 }, (_, i) =>
    (Math.random() * 0.5 + 0.5) * (Math.sin(i/20 * Math.PI * 2)+1.5) * 0.35  , // random radial "bumpiness" for each slice
));

// Per-slice resting radial offset from center
const BASE_OFFSET = [8, 6, 10, 7, 9, 5, 8];

// Per-slice idle oscillation params (breathe in/out)
const IDLE_MAG    = [6,    9,    5,    8,    7,    10,   6   ];
const IDLE_PERIOD = [3800, 4500, 2900, 5200, 3200, 4100, 3600];
const IDLE_PHASE  = [0.3,  2.1,  4.7,  1.5,  3.8,  0.9,  5.2 ];

// Precomputed start angles (from 12 o'clock / -π/2)
const SLICE_ANGLES = SLICE_DATA.reduce<number[]>((acc, _v, i) => {
  acc.push(i === 0 ? -Math.PI / 2 : acc[i - 1] + SLICE_DATA[i - 1] * Math.PI * 2);
  return acc;
}, []);

const f = (n: number) => n.toFixed(2);

function getSVGEl2<T extends SVGElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`DynamicGraphDemo2: #${id} not found`);
  return el as unknown as T;
}

/** Draw a pie wedge centred at (CX, CY) with radius R. */
function slicePath(a0: number, a1: number): string {
  const x1 = CX + R * Math.cos(a0), y1 = CY + R * Math.sin(a0);
  const x2 = CX + R * Math.cos(a1), y2 = CY + R * Math.sin(a1);
  const large = (a1 - a0 > Math.PI) ? 1 : 0;
  return `M${f(CX)},${f(CY)} L${f(x1)},${f(y1)} A${f(R)},${f(R)} 0 ${large} 1 ${f(x2)},${f(y2)} Z`;
}

export const DynamicGraphDemo2 = component$(() => {
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const svgEl   = getSVGEl2<SVGSVGElement>('dgp2-svg');
    const rootG   = getSVGEl2<SVGGElement>('dgp2-root');
    const sliceGs = Array.from({ length: 7 }, (_, i) => getSVGEl2<SVGGElement>(`dgp2-sg-${i}`));
    const paths   = Array.from({ length: 7 }, (_, i) => getSVGEl2<SVGPathElement>(`dgp2-path-${i}`));
    const hits    = Array.from({ length: 7 }, (_, i) => getSVGEl2<SVGPathElement>(`dgp2-hit-${i}`));
    const indDot  = getSVGEl2<SVGCircleElement>('dgp2-ind-dot');
    const indLine = getSVGEl2<SVGLineElement>('dgp2-ind-line');
    const indText = getSVGEl2<SVGTextElement>('dgp2-ind-text');

    const N_RAD   = 20;
    const N_RINGS = 5;
    const radialLines = Array.from({ length: N_RINGS }, (_, j) =>
      Array.from({ length: N_RAD }, (_, i) => getSVGEl2<SVGLineElement>(`dgp2-radial-${j}-${i}`))
    );

    // ── Rotation state ────────────────────────────────────────────
    let totalAngle    = 0;
    let spinVelocity  = SLOW_SPIN;
    let isDragging    = false;
    let lastDragAngle = 0;
    let lastDragTime  = 0;
    let dragVelocity  = 0;
    let prevNow       = 0;

    let mouseTheta    = 0;
    let mouseInSVG    = false;
    const radialPerturb = new Array<number>(N_RAD).fill(0);

    // ── Per-slice spring state ────────────────────────────────────
    const sliceHovered = new Array<boolean>(7).fill(false);
    const curOffset    = BASE_OFFSET.slice() as number[];
    const curMag       = IDLE_MAG.slice()    as number[];
    const curFillOp    = new Array<number>(7).fill(0.10);
    const SPRING       = 0.08;

    hits.forEach((el, i) => {
      el.addEventListener('mouseenter', () => { sliceHovered[i] = true; });
      el.addEventListener('mouseleave', () => { sliceHovered[i] = false; });
    });

    // ── Drag / rotation helpers ───────────────────────────────────
    function pointerAngle(e: PointerEvent): number {
      const rect = svgEl.getBoundingClientRect();
      return Math.atan2(
        (e.clientY - rect.top)  * (H / rect.height) - CY,
        (e.clientX - rect.left) * (W / rect.width)  - CX,
      );
    }

    function onPointerDown(e: PointerEvent) {
      isDragging    = true;
      lastDragAngle = pointerAngle(e);
      lastDragTime  = e.timeStamp;
      dragVelocity  = 0;
      svgEl.setPointerCapture(e.pointerId);
      svgEl.style.cursor = 'grabbing';
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDragging) return;
      const newA = pointerAngle(e);
      let delta  = newA - lastDragAngle;
      // Unwrap to [-π, π] to avoid wrap-around jumps
      if (delta >  Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      const dt = e.timeStamp - lastDragTime;
      if (dt > 0) dragVelocity = delta / dt;
      totalAngle   += delta;
      lastDragAngle = newA;
      lastDragTime  = e.timeStamp;
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging   = false;
      spinVelocity = dragVelocity; // hand off momentum to physics
      svgEl.style.cursor = 'grab';
    }

    function onMouseMove(e: MouseEvent) {
      const rect = svgEl.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width)  - CX;
      const my = (e.clientY - rect.top)  * (H / rect.height) - CY;
      mouseTheta = Math.atan2(my, mx);
      mouseInSVG = true;
    }
    function onMouseLeave() { mouseInSVG = false; }

    svgEl.addEventListener('pointerdown',   onPointerDown);
    svgEl.addEventListener('pointermove',   onPointerMove);
    svgEl.addEventListener('pointerup',     onPointerUp);
    svgEl.addEventListener('pointercancel', onPointerUp);
    svgEl.addEventListener('mousemove',     onMouseMove);
    svgEl.addEventListener('mouseleave',    onMouseLeave);

    // ── Animation loop ────────────────────────────────────────────
    let raf: number;

    function frame(now: number) {
      const dt = prevNow === 0 ? 16 : Math.min(now - prevNow, 50);
      prevNow = now;

      if (!isDragging) {
        // Spring velocity back toward the slow background spin
        spinVelocity += (SLOW_SPIN - spinVelocity) * FRICTION;
        totalAngle   += spinVelocity * dt;
        }
        totalAngle = totalAngle % (2 * Math.PI); // keep in [0, 2π] for easier reasoning about bottom slice

      rootG.setAttribute(
        'transform',
        `rotate(${(totalAngle * 180 / Math.PI).toFixed(4)}, ${CX}, ${CY})`,
      );

      let a = -Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const da   = SLICE_DATA[i] * Math.PI * 2;
        const midA = a + da / 2;

        // Spring toward hover targets
        curMag[i]    += ((sliceHovered[i] ? 0          : IDLE_MAG[i])    - curMag[i])    * SPRING;
        curOffset[i] += ((sliceHovered[i] ? 40         : BASE_OFFSET[i]) - curOffset[i]) * SPRING;
        curFillOp[i] += ((sliceHovered[i] ? 0.28       : 0.0)           - curFillOp[i]) * SPRING;

        // Oscillation contributes to radial offset
        const totalOff = curOffset[i] + curMag[i] * (Math.sin(now / IDLE_PERIOD[i] + IDLE_PHASE[i]) + 1);
        const dx = totalOff * Math.cos(midA);
        const dy = totalOff * Math.sin(midA);

        const d = slicePath(a, a + da);
        sliceGs[i].setAttribute('transform',   `translate(${f(dx)}, ${f(dy)})`);
        paths[i].setAttribute('d',             d);
        paths[i].setAttribute('fill-opacity',  curFillOp[i].toFixed(3));
        hits[i].setAttribute('d',              d);

        a += da;
      }

      // ── Bottom indicator ────────────────────────────────────────
      // Find which slice is currently at the absolute bottom (angle π/2)
      const bottomInLocal = Math.PI / 2 - totalAngle;
      const normAngle = ((bottomInLocal - (-Math.PI / 2)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      let bottomIdx = 6;
      let cumAngleFinder = 0;
      for (let j = 0; j < 7; j++) {
        cumAngleFinder += SLICE_DATA[j] * Math.PI * 2;
        if (normAngle < cumAngleFinder) { bottomIdx = j; break; }
      }

      // Local midpoint angle of the bottom slice → rotate to absolute space
      let localA = -Math.PI / 2;
      for (let j = 0; j < bottomIdx; j++) localA += SLICE_DATA[j] * Math.PI * 2;
      const midA_abs = localA + SLICE_DATA[bottomIdx] * Math.PI + totalAngle;
      const bOff = curOffset[bottomIdx] + curMag[bottomIdx] * (Math.sin(now / IDLE_PERIOD[bottomIdx] + IDLE_PHASE[bottomIdx]) + 1);

      // Outer edge of the bottom slice at the absolute bottom position
      const indY = CY + R + bOff * Math.sin(midA_abs);

      indDot.setAttribute('cy', indY.toFixed(2));
      indLine.setAttribute('y1', (indY + 5).toFixed(2));
      indLine.setAttribute('y2', (indY + 35).toFixed(2));
      indText.setAttribute('y',  (indY + 50).toFixed(2));
      indText.textContent = `[${SLICE_LABELS[bottomIdx]}] ${(SLICE_DATA[bottomIdx] * 100).toFixed(0)}%`;

      // ── Radial perturbation ──────────────────────────────────────
      const localTheta  = mouseTheta - totalAngle;
      const PERTURB_MAG = 60;
      const SIGMA2      = 0.16; // σ ≈ 0.4 rad
      for (let i = 0; i < N_RAD; i++) {
        const ang = i / N_RAD * Math.PI * 2;
        let diff  = localTheta - ang;
        if (diff >  Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        const target = mouseInSVG ? PERTURB_MAG * Math.exp(-diff * diff / (2 * SIGMA2)) : 0;
        radialPerturb[i] += (target - radialPerturb[i]) * 0.12;
      }
      for (let j = 0; j < N_RINGS; j++) {
        const arr   = RADIAL_DATA[j];
        const scale = 1 - j * 0.2;
        for (let i = 0; i < N_RAD; i++) {
          const ip1     = (i + 1) % N_RAD;
          const ang_i   = i   / N_RAD * Math.PI * 2;
          const ang_ip1 = ip1 / N_RAD * Math.PI * 2;
          const ri   = scale * R * arr[i]   + radialPerturb[i];
          const rip1 = scale * R * arr[ip1] + radialPerturb[ip1];
          radialLines[j][i].setAttribute('x1', (CX + rip1 * Math.cos(ang_ip1)).toFixed(2));
          radialLines[j][i].setAttribute('y1', (CY + rip1 * Math.sin(ang_ip1)).toFixed(2));
          radialLines[j][i].setAttribute('x2', (CX + ri   * Math.cos(ang_i)).toFixed(2));
          radialLines[j][i].setAttribute('y2', (CY + ri   * Math.sin(ang_i)).toFixed(2));
        }
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    cleanup(() => {
      cancelAnimationFrame(raf);
      svgEl.removeEventListener('pointerdown',   onPointerDown);
      svgEl.removeEventListener('pointermove',   onPointerMove);
      svgEl.removeEventListener('pointerup',     onPointerUp);
      svgEl.removeEventListener('pointercancel', onPointerUp);
      svgEl.removeEventListener('mousemove',     onMouseMove);
      svgEl.removeEventListener('mouseleave',    onMouseLeave);
    });
  });

  return (
    <svg
      id="dgp2-svg"
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style="display:block;overflow:hidden;cursor:grab;user-select:none;"
    >
      <g id="dgp2-root">
        {SLICE_DATA.map((v, i) => (
          <g key={i} id={`dgp2-sg-${i}`}>
            {/* Visible slice */}
            <path
              id={`dgp2-path-${i}`}
              d={slicePath(SLICE_ANGLES[i], SLICE_ANGLES[i] + v * Math.PI * 2)}
              fill={STROKE}
              fill-opacity="0.0"
              stroke={STROKE}
              stroke-width="1"
              stroke-linejoin="round"
              shape-rendering="optimizeSpeed"
            />
            {/* Transparent hit area (same shape, no pointer-events gap between strokes) */}
            <path
              id={`dgp2-hit-${i}`}
              d={slicePath(SLICE_ANGLES[i], SLICE_ANGLES[i] + v * Math.PI * 2)}
              fill="transparent"
              stroke="none"
              style="cursor:default;"
            />
          </g>
        ))}
          <g id="radial-map">
              {RADIAL_DATA.map((arr, j) =>arr.map((r, i) => (
                  <line key={`${j}-${i}`} id={`dgp2-radial-${j}-${i}`}
                      x1={(CX + (1-(j*0.2)) * R * arr[(i+1) % arr.length]  * Math.cos((i+1) / arr.length * 2 * Math.PI)).toFixed(2)}
                      y1={(CY + (1-(j*0.2)) * R * arr[(i+1) % arr.length]  * Math.sin((i+1) / arr.length * 2 * Math.PI)).toFixed(2)}
                      x2={(CX + (1-(j*0.2)) * R * r * Math.cos(i / arr.length * 2 * Math.PI)).toFixed(2)}
                      y2={(CY + (1-(j*0.2)) * R * r * Math.sin(i / arr.length * 2 * Math.PI)).toFixed(2)}
                      stroke={STROKE}
                      opacity={1/(j+1)}
                    />
              )))}
          </g>
          </g>

      {/* Bottom indicator – outside rotating group, fixed at center-x */}
      <circle
        id="dgp2-ind-dot"
        cx={CX}
        cy={CY + R}
        r={5}
        fill="none"
        stroke="white"
        stroke-width="1.5"
      />
      <line
        id="dgp2-ind-line"
        x1={CX} y1={CY + R + 5}
        x2={CX} y2={CY + R + 35}
        stroke="white"
        stroke-width="1"
      />
      <text
        id="dgp2-ind-text"
        x={CX}
        y={CY + R + 50}
        fill="white"
        font-family="Courier New, Courier, monospace"
        font-size="13"
        text-anchor="middle"
      />
    </svg>
  );
});
