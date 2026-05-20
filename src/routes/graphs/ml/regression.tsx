import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const W = 70, H = 70;
const R1 = 70, R2 = 215, R3 = 360; // y-positions of the three regression branches

// Three regression pathways share a common feature-engineering step.
//
//  [Conditions] → [Feature Vec] ─┬─ [Yield Reg]    → [Yield / Crystallinity]
//                                 └─ [Structure Reg] → [PXRD / BET / Pore]
//                                                            │ (structure→function)
// [Struct Props] → [Struct Feats] ──────────────────→ [Function Reg] → [CO₂ / Activity]

const nodes = {
  // ── Shared synthesis input (Row 1, y=30) ──────────────────────────────────
  synth_cond: N('synth_cond', 'Conditions', 30, R1, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.beaker, svg_viewbox: '0 0 40 40',
    hover_text: 'Reagent ratios (Si/Al, Na/Si, H₂O/Si)\nTemp, time\nSolvent, modulator, OSDA',
  }),
  feat_vec: N('feat_vec', 'Feature Vec', 215, R1, W, H, 'rect', '#8ae4ff', {
    inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40', border: 'none',
    hover_text: 'Gel composition vector\nMorgan fingerprints (OSDA)\nDescriptive reaction features',
  }),

  // ── Branch 1: Synthesis → Yield / Crystallinity (y=30) ───────────────────
  reg_yield: N('reg_yield', 'Yield Reg.', 405, R1, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Predicts synthesis success metrics\nXGBoost / Gaussian Process\nScreen reactions for crystallisation',
  }),
  pred_yield: N('pred_yield', 'Yield & Cryst.', 600, R1, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.data, svg_viewbox: '0 0 40 40',
    hover_text: 'Predicted yield (%)\nRelative crystallinity (%)\nUsed to screen / rank candidate reactions',
  }),

  // ── Branch 2: Synthesis → Structure (y=215) ───────────────────────────────
  reg_struct: N('reg_struct', 'Structure Reg.', 405, R2, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Predicts physical/structural properties\nFor target-driven synthesis design\nR² > 0.97 on BET/pore targets',
  }),
  pred_struct: N('pred_struct', 'PXRD / BET', 600, R2, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.list, svg_viewbox: '0 0 40 40',
    hover_text: 'PXRD phase / d-spacing\nBET surface area (m²/g)\nPore diameter, pore volume\nUsed as inputs to function regressor',
  }),

  // ── Branch 3: Structure → Function (y=400) ────────────────────────────────
  struct_prop: N('struct_prop', 'Struct. Props', 30, R3, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40', border: 'none',
    hover_text: 'Measured structural characterisation\nBET, PXRD, pore geometry from Level 1\nSi/Al ratio, defect concentration',
  }),
  struct_feat: N('struct_feat', 'Struct. Feats', 215, R3, W, H, 'rect', '#8ae4ff', {
    inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40', border: 'none',
    hover_text: 'Geometry descriptors (Zeo++)\nComposition one-hot encoding\nXRD three-peak fingerprint',
  }),
  reg_func: N('reg_func', 'Function Reg.', 405, R3, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Structure → Application performance\nMaterial descriptors: 63.6% of variance\nSHAP-ranked feature importance',
  }),
  pred_func: N('pred_func', 'CO₂ / Activity', 600, R3, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.funnel, svg_viewbox: '0 0 40 40',
    hover_text: 'CO₂ uptake (mmol/g)\nBinding affinity (kJ/mol)\nCatalytic activity / selectivity',
  }),
};

const edges = {
  // shared synthesis pipeline
  e_sf: E('e_sf', 'synth_cond', 'feat_vec', { speed: 1.2, dash_space: 8 }),

  // feat_vec branches to both synthesis regressors
  e_fy: E('e_fy', 'feat_vec', 'reg_yield', { speed: 1.2, dash_space: 8 }),
  e_fs: E('e_fs', 'feat_vec', 'reg_struct', { speed: 1.2, dash_space: 8, color: '#8ae4ff' }),

  // branch 1 output
  e_yr: E('e_yr', 'reg_yield', 'pred_yield', { speed: 1.0, dash_space: 8, color: '#80ffaa' }),

  // branch 2 output
  e_sr: E('e_sr', 'reg_struct', 'pred_struct', { speed: 1.0, dash_space: 8, color: '#80ffaa' }),

  // structure → function cascade (predicted struct properties feed function regressor)
  e_pf: E('e_pf', 'pred_struct', 'reg_func', { speed: 0.5, dash_space: 14, color: '#c080ff', stiffness: 0.25, label: 'structure features' }),

  // branch 3 structural input
  e_pp: E('e_pp', 'struct_prop', 'struct_feat', { speed: 1.2, dash_space: 8 }),
  e_ff: E('e_ff', 'struct_feat', 'reg_func', { speed: 1.2, dash_space: 8 }),

  // branch 3 output
  e_fp: E('e_fp', 'reg_func', 'pred_func', { speed: 1.0, dash_space: 8, color: '#80ffaa' }),

  e_mm1: E('e_mm1', 'reg_yield', 'reg_struct', { speed: 0.35, dash_space: 14, color: '#c080ff', stiffness: 0.25, start_frac: 0.25, end_frac: 0.25 }),
  e_mm2: E('e_mm2', 'reg_struct', 'reg_func', { speed: 0.35, dash_space: 14, color: '#c080ff', stiffness: 0.25, start_frac: 0.25, end_frac: 0.25 }),

  e_mm3: E('e_mm1', 'reg_struct', 'reg_yield', { speed: 0.35, dash_space: 14, color: '#c080ff', stiffness: 0.25, start_frac: 0.75, end_frac: 0.75 }),
  e_mm4: E('e_mm2', 'reg_func', 'reg_struct', { speed: 0.35, dash_space: 14, color: '#c080ff', stiffness: 0.25, start_frac: 0.75, end_frac: 0.75 }),
};

export const RegressionGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
