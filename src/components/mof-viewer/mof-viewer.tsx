/**
 * mof-viewer.tsx
 * Animated SVG molecule viewer for CIF crystal structure files.
 *
 * Renders atoms as blue outlines (sized by element radius + depth-perspective)
 * and bonds as lines (rim-to-rim offset), matching the dynamic-graph-demo
 * blue-outline aesthetic.  Supports CPK color mode and multi-molecule navigation.
 *
 * Props:
 *   cifPaths – array of CIF URLs to cycle through, e.g.
 *              ['/cool_mofs/gustun01_P1.cif', '/cool_mofs/pasmut_P1.cif']
 */

import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';
import { parseCif, type Molecule } from './parse-cif';

// ── Visual constants ───────────────────────────────────────────────────────── //

const STROKE = '#0095eb';
const W = 600, H = 600;

// ── Camera / projection ────────────────────────────────────────────────────── //
// Adjust FOV and CAM_DIST to change perspective strength and zoom level.
const FOV = 480;  // focal length in px (higher = less perspective distortion)
const CAM_DIST = 300;  // camera distance from origin in px (higher = zoom out)

// ── Rotation ────────────────────────────────────────────────────────────────── //
const SLOW_SPIN = 0.000038;   // rad / ms — background auto-rotation speed
const DRAG_SENSE = -0.006;     // rad / px — pointer drag sensitivity
const MOMENTUM_TAU = 2200;    // ms — time constant for momentum → slow-spin decay

// ── Atom display ────────────────────────────────────────────────────────────── //
// Atom display radius = element_radius_Å × REF_PX_PER_ANG × molScale × perspScale × ATOM_SCALE
const REF_PX_PER_ANG = 18.0;
const ATOM_SCALE = 0.035;  // tuning knob — increase to make atoms larger

// CPK / van-der-Waals display radii in Å
const ATOM_RADII: Record<string, number> = {
  H: 0.33, C: 0.72, N: 0.70, O: 0.68, S: 0.98, P: 0.97, F: 0.62,
  Cl: 0.93, Br: 1.04, I: 1.15, Fe: 1.12, Cu: 1.12, Zn: 1.15, Zr: 1.30,
  Al: 1.06, Si: 1.11, Ca: 1.28, Tb: 1.50, Ce: 1.55, Eu: 1.52, Gd: 1.53,
  La: 1.58, Y: 1.45, Mn: 1.17, Co: 1.11, Ni: 1.10, Mo: 1.29, Cr: 1.18,
  Ti: 1.32, V: 1.22,
};
const DEFAULT_RADIUS = 1.0;

// ── Depth-opacity range ──────────────────────────────────────────────────────── //
const OPACITY_NEAR = 1.0;
const OPACITY_FAR = 0.12;

// ── CPK hex colors ────────────────────────────────────────────────────────── //
const CPK: Record<string, string> = {
  H: '#dcdcdc', C: '#464646', N: '#3250f0', O: '#f03232',
  S: '#e6d214', P: '#eb8228', F: '#46d746', Cl: '#1ed21e',
  Br: '#a03c14', I: '#8c1496', Fe: '#b4643c', Cu: '#c86928',
  Zn: '#78a5c8', Zr: '#28a5cd', Al: '#afbec8', Si: '#af9682',
  Ca: '#50cd50', Tb: '#78d27d', Ce: '#82c882', Eu: '#91c891',
  Gd: '#96c896', La: '#a0d7a0', Y: '#a5d2a5', Mn: '#aa64c8',
  Co: '#5050c8', Ni: '#50a050', Mo: '#5a7391', Cr: '#5064a0',
  Ti: '#9b9b9b', V: '#a5a5c8',
};
const CPK_DEFAULT = '#969696';

// ── 3×3 row-major rotation-matrix helpers ─────────────────────────────────── //

function mm(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}
function rx(a: number): number[] { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function ry(a: number): number[] { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function applyMat(m: number[], x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

// ── Hill-order formula from atom list ─────────────────────────────────────── //
function computeFormula(mol: Molecule): string {
  const counts: Record<string, number> = {};
  for (const a of mol.atoms) counts[a.element] = (counts[a.element] || 0) + 1;
  const els = Object.keys(counts).sort((a, b) => {
    if (a === 'C') return -1; if (b === 'C') return 1;
    if (a === 'H') return -1; if (b === 'H') return 1;
    return a.localeCompare(b);
  });
  const parts = els.slice(0, 8).map(el => `${el}${counts[el] > 1 ? counts[el] : ''}`);
  return parts.join('') + (els.length > 8 ? '…' : '');
}

// ── Component ──────────────────────────────────────────────────────────────── //

export const MofViewer = component$<{ cifPaths: string[] }>(({ cifPaths }) => {
  const svgRef = useSignal<SVGSVGElement>();
  const statsRef = useSignal<SVGSVGElement>();
  const btnsRef = useSignal<SVGSVGElement>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ cleanup }) => {
    const svg = svgRef.value;
    const statsSvg = statsRef.value;
    const btnsSvg = btnsRef.value;
    if (!svg || !statsSvg || !btnsSvg || !cifPaths.length) return;

    const NS = 'http://www.w3.org/2000/svg';
    const FONT = "'Courier New',monospace";

    // ── Persistent SVG groups ─────────────────────────────────────────── //
    const bondsG = document.createElementNS(NS, 'g');
    const atomsG = document.createElementNS(NS, 'g');
    svg.appendChild(bondsG);
    svg.appendChild(atomsG);

    // ── Info text lines ───────────────────────────────────────────────── //
    function mkText(x: number, y: number, size = 10, op = 0.65): SVGTextElement {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
      t.setAttribute('fill', STROKE); t.setAttribute('font-family', FONT);
      t.setAttribute('font-size', String(size));
      t.setAttribute('opacity', String(op));
      return t;
    }
    const txtName = mkText(10, 16, 13, 0.90);
    const txtCounts = mkText(10, 30, 12, 0.65);
    const txtCell = mkText(10, 44, 12, 0.55);
    const txtFormula = mkText(10, 58, 12, 0.55);
    const txtIdx = mkText(10, 79, 11, 0.35);
    [txtName, txtCounts, txtCell, txtFormula, txtIdx].forEach(t => statsSvg.appendChild(t));

    // ── Button helper ─────────────────────────────────────────────────── //
    function mkBtn(container: SVGSVGElement, x: number, y: number, w: number, label: string, onClick: () => void) {
      const g = document.createElementNS(NS, 'g');
      g.style.cursor = 'pointer';
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(x)); rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(w)); rect.setAttribute('height', '20');
      rect.setAttribute('rx', '3'); rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', STROKE); rect.setAttribute('stroke-width', '1');
      rect.setAttribute('opacity', '0.6');
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(x + w * 0.5)); text.setAttribute('y', String(y + 13.5));
      text.setAttribute('fill', STROKE); text.setAttribute('font-family', FONT);
      text.setAttribute('font-size', '13'); text.setAttribute('text-anchor', 'middle');
      text.setAttribute('opacity', '0.6');
      text.textContent = label;
      g.appendChild(rect); g.appendChild(text);
      g.addEventListener('mouseenter', () => {
        rect.setAttribute('fill', '#0095eb22');
        rect.setAttribute('opacity', '1'); text.setAttribute('opacity', '1');
      });
      g.addEventListener('mouseleave', () => {
        rect.setAttribute('fill', 'none');
        rect.setAttribute('opacity', '0.6'); text.setAttribute('opacity', '0.6');
      });
      g.addEventListener('click', onClick);
      container.appendChild(g);
      return { g, rect, text };
    }

    // ── Mutable viewer state ──────────────────────────────────────────── //
    let currentIdx = 0;
    let useCpk = false;

    // Molecule state (replaced on each load)
    let mol: Molecule | null = null;
    let positions: [number, number, number][] = [];
    let atomRadiiAng: number[] = [];
    let bondPairs: [number, number][] = [];
    let atomEls: SVGCircleElement[] = [];
    let bondEls: SVGLineElement[] = [];
    let molScale = 1;

    // Camera state
    let camX = 0;
    let camY = 0;
    let camDist = CAM_DIST;

    // Rotation / animation
    let rotMat: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    let raf: number | null = null;
    let prevNow = 0;
    let loadGen = 0;

    // Momentum (rad/ms); omegaY drives Y-axis spin, omegaX drives X-axis
    let omegaY = SLOW_SPIN;
    let omegaX = 0;

    // Freeze state
    let isFrozen = true;

    // Drag velocity tracking
    let lastPointerTime = 0;

    // ── Apply blue / CPK color mode to current atom elements ─────────── //
    function applyColors() {
      if (!mol) return;
      for (let i = 0; i < atomEls.length; i++) {
        if (useCpk) {
          const c = CPK[mol.atoms[i].element] ?? CPK_DEFAULT;
          atomEls[i].setAttribute('fill', c);
          atomEls[i].setAttribute('stroke', c);
          atomEls[i].setAttribute('fill-opacity', '0.12');
          atomEls[i].removeAttribute('opacity');
        } else {
          atomEls[i].setAttribute('fill', 'none');
          atomEls[i].setAttribute('stroke', STROKE);
          atomEls[i].removeAttribute('fill-opacity');
          atomEls[i].removeAttribute('stroke-opacity');
        }
      }
    }

    // ── Load a molecule by index ──────────────────────────────────────── //
    async function loadMol(idx: number) {
      const gen = ++loadGen;
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }

      // Clear old molecule elements
      while (bondsG.firstChild) bondsG.removeChild(bondsG.firstChild);
      while (atomsG.firstChild) atomsG.removeChild(atomsG.firstChild);
      atomEls = []; bondEls = []; mol = null;
      rotMat = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      // start slightly rotated
      rotMat = mm(ry(0.6), mm(rx(-0.5), rotMat));
      omegaY = SLOW_SPIN;
      omegaX = 0;
      prevNow = 0;

      txtName.textContent = '…';
      txtCounts.textContent = '';
      txtCell.textContent = '';
      txtFormula.textContent = '';
      txtIdx.textContent = `${idx + 1} / ${cifPaths.length}`;

      let text: string;
      try { text = await fetch(cifPaths[idx]).then(r => r.text()); }
      catch { return; }
      if (gen !== loadGen) return;

      const m = parseCif(text, cifPaths[idx]);
      if (!m.atoms.length) return;
      mol = m;

      const raw = m.atoms.map(a => a.cart as [number, number, number]);
      const mX = raw.reduce((s, p) => s + p[0], 0) / raw.length;
      const mY = raw.reduce((s, p) => s + p[1], 0) / raw.length;
      const mZ = raw.reduce((s, p) => s + p[2], 0) / raw.length;
      const cen: [number, number, number][] = raw.map(([x, y, z]) => [x - mX, y - mY, z - mZ]);
      const maxExt = cen.reduce((mv, p) => Math.max(mv, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])), 1e-9);
      molScale = (H * 0.30) / maxExt;
      positions = cen.map(([x, y, z]): [number, number, number] => [x * molScale, y * molScale, z * molScale]);

      // Auto-zoom: place camera 25% beyond the furthest atom
      const maxPosDist = positions.reduce((mv, [x, y, z]) => Math.max(mv, Math.hypot(x, y, z)), 1);
      camDist = maxPosDist * 1.25;

      const labelIdx = new Map(m.atoms.map((a, i) => [a.label, i]));
      const seen = new Set<string>();
      bondPairs = [];
      for (const b of m.bonds) {
        const i1 = labelIdx.get(b.label1), i2 = labelIdx.get(b.label2);
        if (i1 == null || i2 == null) continue;
        const key = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bondPairs.push([i1, i2]);
      }

      atomRadiiAng = m.atoms.map(a => ATOM_RADII[a.element] ?? DEFAULT_RADIUS);

      bondEls = bondPairs.map(() => {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('stroke', STROKE);
        l.setAttribute('stroke-linecap', 'round');
        l.setAttribute('stroke-dasharray', '8 4');
        bondsG.appendChild(l);
        return l;
      });

      atomEls = m.atoms.map(() => {
        const c = document.createElementNS(NS, 'circle');
        atomsG.appendChild(c);
        return c;
      });

      applyColors();

      txtName.textContent = m.name;
      txtCounts.textContent = `${m.atoms.length} atoms  ·  ${bondPairs.length} bonds`;
      txtCell.textContent = `a=${m.cellA.toFixed(1)}  b=${m.cellB.toFixed(1)}  c=${m.cellC.toFixed(1)} Å`;
      txtFormula.textContent = computeFormula(m);
      txtIdx.textContent = `${idx + 1} / ${cifPaths.length}`;
      try { localStorage.setItem('mof-viewer-idx', String(idx)); } catch { /* ignore */ }

      raf = requestAnimationFrame((now) => frame(now, true));
    }

    // ── Buttons ───────────────────────────────────────────────────────── //
    mkBtn(btnsSvg, 10, 7, 32, '◀', () => {
      currentIdx = (currentIdx - 1 + cifPaths.length) % cifPaths.length;
      loadMol(currentIdx);
    });
    mkBtn(btnsSvg, 48, 7, 32, '▶', () => {
      currentIdx = (currentIdx + 1) % cifPaths.length;
      loadMol(currentIdx);
    });
    const btnCpk = mkBtn(btnsSvg, 86, 7, 46, 'mono', () => {
      useCpk = !useCpk;
      btnCpk.text.textContent = useCpk ? 'cpk' : 'mono';
      btnCpk.rect.setAttribute('fill', useCpk ? '#0095eb22' : 'none');
      try { localStorage.setItem('mof-viewer-cpk', String(useCpk)); } catch { /* ignore */ }
      applyColors();
    });
    const btnFreeze = mkBtn(btnsSvg, 138, 7, 54, '▶', () => {
      isFrozen = !isFrozen;
      btnFreeze.text.textContent = isFrozen ? '▶' : '⏸';
      btnFreeze.rect.setAttribute('fill', isFrozen ? '#0095eb22' : 'none');
      if (!isFrozen && raf === null && mol) {
        prevNow = 0;
        raf = requestAnimationFrame(frame);
      }
    });

    // ── Pointer drag ─────────────────────────────────────────────────── //
    let isDragging = false, lastMX = 0, lastMY = 0;

    const onPD = (e: PointerEvent) => {
      isDragging = true;
      lastMX = e.clientX; lastMY = e.clientY;
      lastPointerTime = performance.now();
      svg.setPointerCapture(e.pointerId);
      svg.style.cursor = 'grabbing';
      // If loop was stopped (frozen), restart it for drag feedback
      if (raf === null && mol) { prevNow = 0; raf = requestAnimationFrame((now) => frame(now, true)); }
    };
    const onPM = (e: PointerEvent) => {
      if (!isDragging) return;
      const now = performance.now();
      const dt = Math.max(4, now - lastPointerTime);
      const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
      rotMat = mm(ry(dx * DRAG_SENSE), mm(rx(dy * DRAG_SENSE), rotMat));
      omegaY = (dx * DRAG_SENSE) / dt;
      omegaX = (dy * DRAG_SENSE) / dt;
      lastMX = e.clientX; lastMY = e.clientY;
      lastPointerTime = now;
    };
    const onPU = () => {
      isDragging = false;
      svg.style.cursor = 'grab';
      if (isFrozen) { omegaY = 0; omegaX = 0; }
      // frame loop self-stops next tick if frozen
    };

    svg.addEventListener('pointerdown', onPD);
    svg.addEventListener('pointermove', onPM);
    svg.addEventListener('pointerup', onPU);
    svg.addEventListener('pointercancel', onPU);
    svg.style.cursor = 'grab';

    // ── Animation loop ────────────────────────────────────────────────── //
    type Proj = { sx: number; sy: number; vz: number; s: number } | null;
    const f2 = (v: number) => v.toFixed(2);
    const f3 = (v: number) => v.toFixed(3);
    const opRange = OPACITY_NEAR - OPACITY_FAR;

    function frame(now: number, overrideFrozen: boolean = false) {
      if (!mol) return;
      const dt = prevNow === 0 ? 16 : Math.min(now - prevNow, 50);
      prevNow = now;

      if (!isDragging) {
        if (!isFrozen || overrideFrozen) {
          // Blend momentum toward resting slow-spin
          const blend = 1 - Math.exp(-dt / MOMENTUM_TAU);
          omegaY += (SLOW_SPIN - omegaY) * blend;
          omegaX += (0 - omegaX) * blend;
          rotMat = mm(ry(omegaY * dt), mm(rx(omegaX * dt), rotMat));
        } else {
          // Frozen and not dragging — stop the loop
          raf = null;
          return;
        }
      }

      const projs: Proj[] = positions.map(([x, y, z]) => {
        const [wx, wy, wz] = applyMat(rotMat, x, y, z);
        const vz = wz + camDist;
        if (vz <= 10) return null;
        const s = FOV / vz;
        return {
          sx: (wx - camX) * s + W * 0.65,
          sy: -(wy - camY) * s + H * 0.5,
          vz, s,
        };
      });

      let vzMin = Infinity, vzMax = -Infinity;
      for (const p of projs) if (p) { vzMin = Math.min(vzMin, p.vz); vzMax = Math.max(vzMax, p.vz); }
      const vzRange = Math.max(1, vzMax - vzMin);

      for (let i = 0; i < atomEls.length; i++) {
        const p = projs[i];
        if (!p) { atomEls[i].setAttribute('r', '0'); continue; }

        const r = Math.max(1.0, atomRadiiAng[i] * REF_PX_PER_ANG * molScale * p.s * ATOM_SCALE);
        const op = OPACITY_FAR + opRange * (1.0 - (p.vz - vzMin) / vzRange);

        atomEls[i].setAttribute('cx', f2(p.sx));
        atomEls[i].setAttribute('cy', f2(p.sy));
        atomEls[i].setAttribute('r', f2(r));
        atomEls[i].setAttribute('stroke-width', f2(Math.max(0.3, 1.3 * op)));
        
        // set hydrogen to dashed outline to help distinguish them
        if(mol.atoms[i].element === 'H') {
          atomEls[i].setAttribute('stroke-dasharray', f2(2 * Math.PI * r / 32) + ' ' + f2(2 * Math.PI * r / 32));
          atomEls[i].setAttribute('opacity', '0.5');
        }

        if (useCpk) {
          atomEls[i].setAttribute('stroke-opacity', f3(op));
          atomEls[i].setAttribute('fill-opacity', f3(op * 0.12));
        } else {
          atomEls[i].setAttribute('opacity', f3(op));
        }
      }

      for (let bi = 0; bi < bondEls.length; bi++) {
        const [i1, i2] = bondPairs[bi];
        const p1 = projs[i1], p2 = projs[i2];
        if (!p1 || !p2) { bondEls[bi].setAttribute('stroke-opacity', '0'); continue; }

        const r1 = Math.max(1.0, atomRadiiAng[i1] * REF_PX_PER_ANG * molScale * p1.s * ATOM_SCALE);
        const r2 = Math.max(1.0, atomRadiiAng[i2] * REF_PX_PER_ANG * molScale * p2.s * ATOM_SCALE);
        const dx = p2.sx - p1.sx, dy = p2.sy - p1.sy;
        const dist = Math.hypot(dx, dy);
        if (dist < r1 + r2 + 0.5) { bondEls[bi].setAttribute('stroke-opacity', '0'); continue; }

        const nx = dx / dist, ny = dy / dist;
        const avgVz = (p1.vz + p2.vz) * 0.5;
        const op = OPACITY_FAR + opRange * (1.0 - (avgVz - vzMin) / vzRange);

        bondEls[bi].setAttribute('x1', f2(p1.sx + nx * r1));
        bondEls[bi].setAttribute('y1', f2(p1.sy + ny * r1));
        bondEls[bi].setAttribute('x2', f2(p2.sx - nx * r2));
        bondEls[bi].setAttribute('y2', f2(p2.sy - ny * r2));
        bondEls[bi].setAttribute('stroke-opacity', f3(op));
        bondEls[bi].setAttribute('stroke-width', f2(Math.max(0.3, 1.1 * op)));
        bondEls[bi].setAttribute('stroke-dashoffset', f2(-(dist-r1-r2)/2));
        bondEls[bi].setAttribute('stroke-dasharray', `${f2(800 / avgVz)} ${f2(400 / avgVz)}`);
        }

      raf = requestAnimationFrame(frame);
    }

    // ── Initial load ─────────────────────────────────────────────────── //
    // Restore persisted preferences
    try {
      const savedCpk = localStorage.getItem('mof-viewer-cpk');
      if (savedCpk === 'true') {
        useCpk = true;
        btnCpk.text.textContent = 'cpk';
        btnCpk.rect.setAttribute('fill', '#0095eb22');
      }
      const savedIdx = localStorage.getItem('mof-viewer-idx');
      if (savedIdx !== null) {
        const n = parseInt(savedIdx, 10);
        if (n >= 0 && n < cifPaths.length) currentIdx = n;
      }
    } catch { /* ignore */ }

    await loadMol(currentIdx);

    cleanup(() => {
      if (raf !== null) cancelAnimationFrame(raf);
      svg.removeEventListener('pointerdown', onPD);
      svg.removeEventListener('pointermove', onPM);
      svg.removeEventListener('pointerup', onPU);
      svg.removeEventListener('pointercancel', onPU);
      bondsG.remove(); atomsG.remove();
      while (statsSvg.firstChild) statsSvg.removeChild(statsSvg.firstChild);
      while (btnsSvg.firstChild) btnsSvg.removeChild(btnsSvg.firstChild);
    });
  });

  return (
    <>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        style="display:block;overflow:hidden;user-select:none;"
        aria-hidden="true"
      />
      <svg ref={statsRef} class="absolute bottom-0 left-0 select-none" width="300" height="90" aria-hidden="true" />
      <svg ref={btnsRef} class="absolute bottom-0 right-0 select-none" width="210" height="35" aria-hidden="true" />
    </>
  );
});
