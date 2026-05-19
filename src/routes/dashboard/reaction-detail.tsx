import { component$, useVisibleTask$ } from '@builder.io/qwik';
import type { Reaction } from './db';

const STROKE = '#0095eb';
const FONT   = "'Courier New', monospace";

// ── NMR ───────────────────────────────────────────────────────────────────────
const NMR_W = 330, NMR_H = 145;
const NMR_BASE = 118, NMR_LEFT = 22, NMR_RIGHT = 312, NMR_PPM = 12;

const REAGENT_NMR: Record<string, Array<[number, number, number]>> = {
    'Terephthalic acid': [[8.10, 70, 0.065]],
    'Trimesic acid':     [[8.82, 62, 0.060], [8.22, 38, 0.065]],
    '2-Methylimidazole': [[7.28, 50, 0.070], [2.35, 42, 0.105]],
    'Triethylamine':     [[2.53, 36, 0.115], [1.03, 52, 0.110]],
    'DABCO':             [[2.78, 66, 0.090]],
    'Fumaric acid':      [[6.50, 58, 0.080]],
    'Acetic acid':       [[2.10, 46, 0.105]],
    'Oxalic acid':       [[11.80, 36, 0.120]],
};

type NMRPeak = { ppm: number; h: number; sigma: number; mag: number; period: number; phase: number };

function buildNMRPeaks(reaction: Reaction): NMRPeak[] {
    const peaks: NMRPeak[] = [];
    const seen = new Set<string>();
    for (const reagent of reaction.reagents) {
        const rp = REAGENT_NMR[reagent];
        if (rp) {
            for (const [ppm, h, sigma] of rp) {
                const key = ppm.toFixed(2);
                if (!seen.has(key)) {
                    seen.add(key);
                    peaks.push({ ppm, h, sigma, mag: 3 + (ppm % 3) * 1.5, period: 2500 + ppm * 150, phase: ppm });
                }
            }
        }
    }
    if (peaks.length === 0) {
        peaks.push(
            { ppm: 7.95, h: 26, sigma: 0.075, mag: 3,   period: 3200, phase: 0.3 },
            { ppm: 2.95, h: 20, sigma: 0.095, mag: 2.5, period: 2800, phase: 1.7 },
        );
    }
    return peaks;
}

const NMR_ZOOM_SIGMA = 60;

function applyNMRZoom(x: number, mouseX: number, amp: number): number {
    const dx = x - mouseX;
    return x + amp * dx * Math.exp(-(dx * dx) / (2 * NMR_ZOOM_SIGMA * NMR_ZOOM_SIGMA));
}

function buildNMRPath(peaks: NMRPeak[], heights: number[], mouseX: number, zoomAmp: number): string {
    const N = 220;
    let d = '';
    for (let k = 0; k <= N; k++) {
        const ppm = NMR_PPM * (1 - k / N);
        const xBase = NMR_LEFT + (k / N) * (NMR_RIGHT - NMR_LEFT);
        const x = zoomAmp > 0 ? applyNMRZoom(xBase, mouseX, zoomAmp) : xBase;
        let intensity = 0;
        for (let j = 0; j < peaks.length; j++) {
            const dp = ppm - peaks[j].ppm;
            intensity += heights[j] * Math.exp(-(dp * dp) / (2 * peaks[j].sigma * peaks[j].sigma));
        }
        const y = NMR_BASE - Math.min(intensity, NMR_BASE - 6);
        d += `${k === 0 ? 'M' : ' L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
}

// ── Pie ───────────────────────────────────────────────────────────────────────
const PIE_W = 165, PIE_H = 165;
const PIE_CX = 82, PIE_CY = 80, PIE_R = 60;
const PIE_SLOW = 0.000032, PIE_FRICTION = 0.018;
const PIE_LABELS  = ['Reaction', 'Work-up', 'Characterisation', 'Preparation'];
const PIE_OPACITY = [0.90, 0.60, 0.75, 0.45];
const PIE_FILLS   = ['#0e3a6a20', '#0c4f7220', '#0b3f5d20', '#091f3b20'];
const PIE_EXPLODE = 6;
const PIE_HOVER_EXPLODE = 16;

function buildPieSlices(reaction: Reaction): number[] {
    const n = reaction.id.charCodeAt(reaction.id.length - 1) % 5;
    const t = [0.60 + n * 0.010, 0.20 - n * 0.004, 0.14 + n * 0.002];
    t.push(1 - t[0] - t[1] - t[2]);
    return t;
}

function sliceAngle(slices: number[], idx: number): number {
    let a = -Math.PI / 2;
    for (let i = 0; i < idx; i++) a += slices[i] * Math.PI * 2;
    return a;
}

function pieSlicePath(a0: number, a1: number, explode: number = PIE_EXPLODE): string {
    const f = (n: number) => n.toFixed(2);
    const midA = (a0 + a1) / 2;
    const cx = PIE_CX + explode * Math.cos(midA);
    const cy = PIE_CY + explode * Math.sin(midA);
    const x1 = cx + PIE_R * Math.cos(a0), y1 = cy + PIE_R * Math.sin(a0);
    const x2 = cx + PIE_R * Math.cos(a1), y2 = cy + PIE_R * Math.sin(a1);
    return `M${f(cx)},${f(cy)} L${f(x1)},${f(y1)} A${f(PIE_R)},${f(PIE_R)} 0 ${a1-a0>Math.PI?1:0} 1 ${f(x2)},${f(y2)} Z`;
}

// ── Temperature profile ───────────────────────────────────────────────────────
const TEMP_W = 290, TEMP_H = 165;
const TEMP_BASE = 128, TEMP_LEFT = 28, TEMP_RIGHT = 280, TEMP_TOP = 20;
const RAMP = 0.15, HOLD = 0.70;

function tempNoiseAtTime(t: number, nPhases: number[], nFreqs: number[], nMags: number[]): number {
    let noise = 0;
    for (let fi = 0; fi < nPhases.length; fi++)noise += nMags[fi] * Math.sin(nFreqs[fi] * t * fi + nPhases[fi]);
    return noise;
}

function buildTempPath(
    reaction: Reaction,
    nPhases: number[], nFreqs: number[], nMags: number[],
    now: number,
): string {
    const N = 180;
    const tMin = 25, tMax = reaction.tempC, tRange = Math.max(tMax - tMin, 1);
    let d = '';
    for (let k = 0; k <= N; k++) {
        const t = k / N;
        let temp: number;
        if      (t < RAMP)            temp = tMin + tRange * (t / RAMP);
        else if (t < RAMP + HOLD)     temp = tMax;
        else                          temp = tMax - tRange * ((t - RAMP - HOLD) / (1 - RAMP - HOLD));
        let noise = tempNoiseAtTime(now + t * 30_000, nPhases, nFreqs, nMags);
        const normT = (temp - tMin) / tRange;
        const x = TEMP_LEFT + t * (TEMP_RIGHT - TEMP_LEFT);
        const y = TEMP_BASE - normT * (TEMP_BASE - TEMP_TOP) + noise;
        d += `${k === 0 ? 'M' : ' L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const ReactionDetail = component$(({ reaction }: { reaction: Reaction }) => {
    const rid = reaction.id; // e.g. 'RXN-001' — hyphens are valid in HTML IDs

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ cleanup }) => {
        function getEl<T extends SVGElement>(id: string): T | null {
            return document.getElementById(id) as T | null;
        }

        const nmrPath  = getEl<SVGPathElement>(`nmr-p-${rid}`);
        const nmrSvg   = getEl<SVGSVGElement>(`nmr-svg-${rid}`);
        const pieGroup = getEl<SVGGElement>(`pie-g-${rid}`);
        const pieSlices = [0,1,2,3].map(i => getEl<SVGPathElement>(`pie-s-${rid}-${i}`));
        const pieLbl   = getEl<SVGTextElement>(`pie-l-${rid}`);
        const tmpPath  = getEl<SVGPathElement>(`tmp-p-${rid}`);
        if (!nmrPath || !pieGroup || !pieLbl || !tmpPath) return;

        // NMR tick elements — positions updated each frame to follow zoom distortion
        const ppmTickValues = [0, 2, 4, 6, 8, 10, 12];
        const nmrTickLines  = ppmTickValues.map(p => getEl<SVGLineElement>(`nmr-tx-${rid}-${p}`));
        const nmrTickTexts  = ppmTickValues.map(p => getEl<SVGTextElement>(`nmr-tl-${rid}-${p}`));

        // ── NMR setup ────────────────────────────────────────────
        const peaks  = buildNMRPeaks(reaction);
        const curH   = peaks.map(p => p.h);
        const nmrPeakLines = peaks.map((_,i) => getEl<SVGLineElement>(`nmr-dl-${rid}-${i}`));
        const nmrPeakTexts = peaks.map((_,i) => getEl<SVGTextElement>(`nmr-dt-${rid}-${i}`));
        for (let j = 0; j < peaks.length; j++) {
            if (nmrPeakTexts[j]) nmrPeakTexts[j]!.textContent = peaks[j].ppm.toFixed(2);
        }
        let nmrMouseX   = (NMR_LEFT + NMR_RIGHT) / 2;
        let nmrZoomAmp  = 0;
        let nmrHovering = false;
        const onNMRMove = (e: MouseEvent) => {
            if (!nmrSvg) return;
            const rect = nmrSvg.getBoundingClientRect();
            nmrMouseX   = (e.clientX - rect.left) * (NMR_W / rect.width);
            nmrHovering = true;
        };
        const onNMRLeave = () => { nmrHovering = false; };
        nmrSvg?.addEventListener('mousemove', onNMRMove);
        nmrSvg?.addEventListener('mouseleave', onNMRLeave);

        // ── Pie setup
        const slices = buildPieSlices(reaction);
        const slicePcts = slices.map(s => Math.round(s * 100));
        for (let i = 0; i < 4; i++) {
            const a0 = sliceAngle(slices, i);
            pieSlices[i]?.setAttribute('d', pieSlicePath(a0, a0 + slices[i] * Math.PI * 2));
        }
        let pieAngle = 0, pieVel = PIE_SLOW;
        // Pie hover
        const pieExplodeArr = [PIE_EXPLODE, PIE_EXPLODE, PIE_EXPLODE, PIE_EXPLODE];
        let hoveredSlice = -1;
        const pieLblHover = getEl<SVGTextElement>(`pie-hl-${rid}`);
        const piePctHover = getEl<SVGTextElement>(`pie-hp-${rid}`);
        const onSliceEnter: Array<() => void> = [];
        const onSliceLeave = () => { hoveredSlice = -1; };
        for (let i = 0; i < 4; i++) {
            const handler = () => { hoveredSlice = i; };
            onSliceEnter.push(handler);
            pieSlices[i]?.addEventListener('mouseenter', handler);
            pieSlices[i]?.addEventListener('mouseleave', onSliceLeave);
        }

        // ── Temp hover setup ─────────────────────────────────────
        const tmpSvg       = getEl<SVGSVGElement>(`tmp-svg-${rid}`);
        const tmpCrossLine = getEl<SVGLineElement>(`tmp-cl-${rid}`);
        const tmpDot       = getEl<SVGCircleElement>(`tmp-cd-${rid}`);
        const tmpTipTime   = getEl<SVGTextElement>(`tmp-tt-${rid}`);
        const tmpTipTemp   = getEl<SVGTextElement>(`tmp-tp-${rid}`);
        let tmpMouseX = (TEMP_LEFT + TEMP_RIGHT) / 2;
        let tmpHovering = false;
        const onTmpMove = (e: MouseEvent) => {
            if (!tmpSvg) return;
            const rect = tmpSvg.getBoundingClientRect();
            tmpMouseX = (e.clientX - rect.left - TEMP_LEFT) * (1) - 2;
            tmpHovering = true;
        };
        const onTmpLeave = () => { tmpHovering = false; };
        tmpSvg?.addEventListener('mousemove', onTmpMove);
        tmpSvg?.addEventListener('mouseleave', onTmpLeave);

        // ── Temp noise — deterministic seed from reaction id ─────
        const seed    = reaction.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const nPhases = Array.from({length: 6}, (_, i) => ((seed * (i + 1) * 137) % 628) / 100);
        const nFreqs  = [0.000830, 0.000210, 0.000330, 0.000170, 0.000290, 0.000410];
        const nMags   = [1.8, 1.2, 0.9, 1.5, 1.0, 0.7];

        let prevNow = 0, raf = 0;

        function frame(now: number) {
            const dt = prevNow === 0 ? 16 : Math.min(now - prevNow, 50);
            prevNow = now;

            // NMR — animate peak heights
            for (let j = 0; j < peaks.length; j++)
                curH[j] = peaks[j].h + peaks[j].mag * Math.sin(now / peaks[j].period + peaks[j].phase);
            // NMR zoom
            const targetAmp = nmrHovering ? 2.0 : 0;
            nmrZoomAmp += (targetAmp - nmrZoomAmp) * 0.1;
            if (Math.abs(nmrZoomAmp) < 0.001) nmrZoomAmp = 0;
            nmrPath?.setAttribute('d', buildNMRPath(peaks, curH, nmrMouseX, nmrZoomAmp));
            // Displace x-axis ticks to match zoom distortion
            for (let ti = 0; ti < ppmTickValues.length; ti++) {
                const tp = ppmTickValues[ti];
                const xBase = NMR_LEFT + (1 - tp / NMR_PPM) * (NMR_RIGHT - NMR_LEFT);
                const x = nmrZoomAmp > 0 ? applyNMRZoom(xBase, nmrMouseX, nmrZoomAmp) : xBase;
                const xs = x.toFixed(1);
                nmrTickLines[ti]?.setAttribute('x1', xs);
                nmrTickLines[ti]?.setAttribute('x2', xs);
                nmrTickTexts[ti]?.setAttribute('x', xs);
            }

            // NMR peak labels
            for (let j = 0; j < peaks.length; j++) {
                let peakIntensity = 0;
                for (let k = 0; k < peaks.length; k++) {
                    const dp = peaks[j].ppm - peaks[k].ppm;
                    peakIntensity += curH[k] * Math.exp(-(dp * dp) / (2 * peaks[k].sigma * peaks[k].sigma));
                }
                const kPeak = 1 - peaks[j].ppm / NMR_PPM;
                const xBase = NMR_LEFT + kPeak * (NMR_RIGHT - NMR_LEFT);
                const x = nmrZoomAmp > 0 ? applyNMRZoom(xBase, nmrMouseX, nmrZoomAmp) : xBase;
                const y = NMR_BASE - Math.min(peakIntensity, NMR_BASE - 6);
                nmrPeakLines[j]?.setAttribute('x1', (x - 12).toFixed(1));
                nmrPeakLines[j]?.setAttribute('x2', (x + 12).toFixed(1));
                nmrPeakLines[j]?.setAttribute('y1', y.toFixed(1));
                nmrPeakLines[j]?.setAttribute('y2', y.toFixed(1));
                nmrPeakTexts[j]?.setAttribute('x', x.toFixed(1));
                nmrPeakTexts[j]?.setAttribute('y', (y - 3).toFixed(1));
            }

            // Pie — slow spin
            pieVel   += (PIE_SLOW - pieVel) * PIE_FRICTION;
            pieAngle += pieVel * dt;
            pieGroup?.setAttribute('transform',
                `rotate(${(pieAngle * 180 / Math.PI).toFixed(3)},${PIE_CX},${PIE_CY})`);
            // Animate per-slice explode on hover
            for (let i = 0; i < 4; i++) {
                const tgt = i === hoveredSlice ? PIE_HOVER_EXPLODE : PIE_EXPLODE;
                pieExplodeArr[i] += (tgt - pieExplodeArr[i]) * 0.15;
                const a0 = sliceAngle(slices, i);
                pieSlices[i]?.setAttribute('d', pieSlicePath(a0, a0 + slices[i] * Math.PI * 2, pieExplodeArr[i]));
            }
            // Hover label / spinning bottom indicator
            if (hoveredSlice !== -1) {
                if (pieLblHover) { pieLblHover.textContent = PIE_LABELS[hoveredSlice]; pieLblHover.setAttribute('opacity', '1'); }
                if (piePctHover) { piePctHover.textContent = `${slicePcts[hoveredSlice]}%`; piePctHover.setAttribute('opacity', '1'); }
                if (pieLbl) pieLbl.setAttribute('opacity', '0');
            } else {
                if (pieLblHover) pieLblHover.setAttribute('opacity', '0');
                if (piePctHover) piePctHover.setAttribute('opacity', '0');
                if (pieLbl) pieLbl.setAttribute('opacity', '1');
                const norm = ((Math.PI / 2 - pieAngle - (-Math.PI / 2)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                let cum = 0, botIdx = 3;
                for (let j = 0; j < 4; j++) { cum += slices[j] * Math.PI * 2; if (norm < cum) { botIdx = j; break; } }
                if (pieLbl) pieLbl.textContent = PIE_LABELS[botIdx];
            }

            // Temperature — shimmer noise
            tmpPath?.setAttribute('d', buildTempPath(reaction, nPhases, nFreqs, nMags, now));
            // Crosshair + tooltip
            if (tmpHovering && tmpMouseX >= TEMP_LEFT && tmpMouseX <= TEMP_RIGHT) {
                // Map x → path parameter k ∈ [0, N] using only the draw domain
                const N_P = 180;
                const kExact = (tmpMouseX - TEMP_LEFT) / (TEMP_RIGHT - TEMP_LEFT) * N_P;
                const k0 = Math.floor(kExact), k1 = Math.min(k0 + 1, N_P);
                const alpha = kExact - k0;
                const t = kExact / N_P; // normalised [0,1] for tooltip values
                // Compute the SVG y at a discrete path index exactly as buildTempPath does,
                // so the dot sits on the animated polyline with correct noise baked in
                const pathYAtK = (ki: number): number => {
                    const tp = ki / N_P;
                    const pMin = 25, pMax = reaction.tempC, pRange = Math.max(pMax - pMin, 1);
                    let pTemp: number;
                    if (tp < RAMP) pTemp = pMin + pRange * (tp / RAMP);
                    else if (tp < RAMP + HOLD) pTemp = pMax;
                    else pTemp = pMax - pRange * ((tp - RAMP - HOLD) / (1 - RAMP - HOLD));
                    let pNoise = 0;
                    for (let fi = 0; fi < nPhases.length; fi++)
                        pNoise += nMags[fi] * Math.sin(nFreqs[fi] * now + tp * 5 + nPhases[fi]);
                    return TEMP_BASE - ((pTemp - pMin) / pRange) * (TEMP_BASE - TEMP_TOP) + pNoise;
                };
                const dotY = pathYAtK(k0) + alpha * (pathYAtK(k1) - pathYAtK(k0)) + tempNoiseAtTime(now + t * 30_000, nPhases, nFreqs, nMags);
                // Noiseless temperature for the readable tooltip value
                const tMin = 25, tMax = reaction.tempC, tRange = Math.max(tMax - tMin, 1);
                let tTemp: number;
                if      (t < RAMP)            tTemp = tMin + tRange * (t / RAMP);
                else if (t < RAMP + HOLD)     tTemp = tMax;
                else tTemp = tMax - tRange * ((t - RAMP - HOLD) / (1 - RAMP - HOLD));
                const mx = tmpMouseX.toFixed(1);
                tmpCrossLine?.setAttribute('x1', mx); tmpCrossLine?.setAttribute('x2', mx);
                tmpCrossLine?.setAttribute('opacity', '0.45');
                tmpDot?.setAttribute('cx', mx); tmpDot?.setAttribute('cy', dotY.toFixed(1));
                tmpDot?.setAttribute('opacity', '1');
                const rightHalf = tmpMouseX > (TEMP_LEFT + TEMP_RIGHT) / 2;
                const tipX = (rightHalf ? tmpMouseX - 5 : tmpMouseX + 5).toFixed(1);
                const anchor = rightHalf ? 'end' : 'start';
                if (tmpTipTime) { tmpTipTime.textContent = (t * reaction.timeH).toFixed(1) + ' h'; tmpTipTime.setAttribute('x', tipX); tmpTipTime.setAttribute('text-anchor', anchor); tmpTipTime.setAttribute('opacity', '1'); }
                if (tmpTipTemp) { tmpTipTemp.textContent = Math.round(tTemp) + ' °C'; tmpTipTemp.setAttribute('x', tipX); tmpTipTemp.setAttribute('text-anchor', anchor); tmpTipTemp.setAttribute('opacity', '1'); }
            } else {
                tmpCrossLine?.setAttribute('opacity', '0');
                tmpDot?.setAttribute('opacity', '0');
                tmpTipTime?.setAttribute('opacity', '0');
                tmpTipTemp?.setAttribute('opacity', '0');
            }

            raf = requestAnimationFrame(frame);
        }

        raf = requestAnimationFrame(frame);
        cleanup(() => {
            cancelAnimationFrame(raf);
            nmrSvg?.removeEventListener('mousemove', onNMRMove);
            nmrSvg?.removeEventListener('mouseleave', onNMRLeave);
            for (let i = 0; i < 4; i++) {
                pieSlices[i]?.removeEventListener('mouseenter', onSliceEnter[i]);
                pieSlices[i]?.removeEventListener('mouseleave', onSliceLeave);
            }
            tmpSvg?.removeEventListener('mousemove', onTmpMove);
            tmpSvg?.removeEventListener('mouseleave', onTmpLeave);
        });
    });

    const ppmTicks = [0, 2, 4, 6, 8, 10, 12];
    const nmrPeaks = buildNMRPeaks(reaction);

    return (
        <div class="grid grid-cols-3 gap-6 px-5 py-4 bg-surface border-t border-edge">

            {/* ── 1H NMR ──────────────────────────────────────── */}
            <div>
                <p class="text-xs text-muted tracking-widest uppercase mb-2 font-mono">1H NMR Spectrum</p>
                <svg id={`nmr-svg-${rid}`} width="100%" height={NMR_H} viewBox={`0 0 ${NMR_W} ${NMR_H}`} style="display:block;overflow:visible">
                    {/* Baseline */}
                    <line x1={NMR_LEFT} y1={NMR_BASE} x2={NMR_RIGHT} y2={NMR_BASE}
                          stroke={STROKE} stroke-width="0.5" opacity="0.35" />
                    {ppmTicks.map(ppm => {
                        const x = NMR_LEFT + (1 - ppm / NMR_PPM) * (NMR_RIGHT - NMR_LEFT);
                        return (
                            <g key={ppm}>
                                <line id={`nmr-tx-${rid}-${ppm}`} x1={x} y1={NMR_BASE} x2={x} y2={NMR_BASE + 4}
                                      stroke={STROKE} stroke-width="0.5" opacity="0.35" />
                                <text id={`nmr-tl-${rid}-${ppm}`} x={x} y={NMR_BASE + 13} text-anchor="middle"
                                      fill="#98a1a5" font-size="11" font-family={FONT}>{ppm}</text>
                            </g>
                        );
                    })}
                    <text x={(NMR_LEFT + NMR_RIGHT) / 2} y={NMR_H - 1}
                          text-anchor="middle" fill="#98a1a5" font-size="11" font-family={FONT}>δ (ppm)</text>
                    {/* Animated trace */}
                    <path id={`nmr-p-${rid}`} d="" fill="none" stroke={STROKE} stroke-width="1" />
                    {/* Peak labels — positions updated in animation loop */}
                    {nmrPeaks.map((peak, i) => (
                        <g key={peak.ppm}>
                            <line id={`nmr-dl-${rid}-${i}`} x1="0" x2="0" y1="0" y2="0"
                                  stroke={STROKE} stroke-width="0.6" stroke-dasharray="3,2.5" opacity="0.65" />
                            <text id={`nmr-dt-${rid}-${i}`} x="0" y="0"
                                  fill="#98a1a5" font-size="10" font-family={FONT} text-anchor="middle" opacity="0.8" />
                        </g>
                    ))}
                </svg>
            </div>

            {/* ── Time breakdown pie ───────────────────────────── */}
            <div>
                <p class="text-xs text-muted tracking-widest uppercase mb-2 font-mono">Time Breakdown</p>
                <svg width="100%" height={PIE_H} viewBox={`0 0 ${PIE_W} ${PIE_H}`} style="display:block">
                    <g id={`pie-g-${rid}`} style="cursor:pointer">
                        {[0,1,2,3].map(i => (
                            <path key={i} id={`pie-s-${rid}-${i}`} d=""
                                  fill={PIE_FILLS[i]}
                                  stroke={STROKE}      stroke-width="1"
                                  stroke-linejoin="round"
                                  stroke-opacity={PIE_OPACITY[i].toFixed(2)} />
                        ))}
                    </g>
                    {/* Hover: label + percentage in pie centre */}
                    <text id={`pie-hl-${rid}`}
                          x={PIE_CX-3} y={PIE_H - 4}
                          text-anchor="start" fill="#98a1a5"
                          font-size="12" font-family={FONT} opacity="0" />
                    <text id={`pie-hp-${rid}`}
                          x={PIE_CX-15} y={PIE_H - 4}
                          text-anchor="end" fill={STROKE}
                          font-size="12" font-family={FONT} opacity="0" />
                    {/* Spinning bottom-slice label */}
                    <text id={`pie-l-${rid}`}
                          x={PIE_CX} y={PIE_H - 4}
                          text-anchor="middle" fill="#98a1a5"
                          font-size="12" font-family={FONT} />
                </svg>
            </div>

            {/* ── Temperature profile ──────────────────────────── */}
            <div>
                <p class="text-xs text-muted tracking-widest uppercase mb-2 font-mono">Temperature Profile</p>
                <svg id={`tmp-svg-${rid}`} width="100%" height={TEMP_H} viewBox={`0 0 ${TEMP_W} ${TEMP_H}`} style="display:block;overflow:visible;cursor:crosshair">
                    {/* Baseline */}
                    <line x1={TEMP_LEFT} y1={TEMP_BASE} x2={TEMP_RIGHT} y2={TEMP_BASE}
                          stroke={STROKE} stroke-width="0.5" opacity="0.35" />
                    {/* Y-axis guide */}
                    <line x1={TEMP_LEFT} y1={TEMP_TOP} x2={TEMP_LEFT} y2={TEMP_BASE}
                          stroke={STROKE} stroke-width="0.5" opacity="0.2" stroke-dasharray="3,3" />
                    {/* Y labels */}
                    <text x={TEMP_LEFT - 3} y={TEMP_BASE + 3} text-anchor="end"
                          fill="#98a1a5" font-size="11" font-family={FONT}>25°</text>
                    <text x={TEMP_LEFT - 3} y={TEMP_TOP + 6} text-anchor="end"
                          fill="#98a1a5" font-size="11" font-family={FONT}>{reaction.tempC}°</text>
                    {/* X labels */}
                    <text x={TEMP_LEFT} y={TEMP_BASE + 13} text-anchor="middle"
                          fill="#98a1a5" font-size="11" font-family={FONT}>0</text>
                    <text x={TEMP_RIGHT} y={TEMP_BASE + 13} text-anchor="middle"
                          fill="#98a1a5" font-size="11" font-family={FONT}>{reaction.timeH}h</text>
                    {/* Animated trace */}
                    <path id={`tmp-p-${rid}`} d="" fill="none" stroke={STROKE} stroke-width="1" />
                    {/* Hover crosshair */}
                    <line id={`tmp-cl-${rid}`} x1="0" x2="0" y1={TEMP_TOP} y2={TEMP_BASE}
                          stroke={STROKE} stroke-width="0.75" stroke-dasharray="3,2" opacity="0" />
                    <circle id={`tmp-cd-${rid}`} r="3" fill={STROKE} opacity="0" />
                    {/* Tooltip — positioned below baseline */}
                    <text id={`tmp-tt-${rid}`} y={TEMP_BASE + 22}
                          fill="#98a1a5" font-size="10" font-family={FONT} opacity="0" />
                    <text id={`tmp-tp-${rid}`} y={TEMP_BASE + 34}
                          fill={STROKE} font-size="10" font-family={FONT} opacity="0" />
                </svg>
            </div>
        </div>
    );
});
