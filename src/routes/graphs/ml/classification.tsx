import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const W = 70, H = 70;

// Row 1 (y=30): live inference pipeline
// Row 2 (y=225): model training pipeline
const nodes = {
  // ── Row 1: inference ──────────────────────────────────────────────────────
  cond: N('cond', 'Conditions', 30, 30, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.beaker, svg_viewbox: '0 0 40 40',
    hover_text: 'Reagent ratios (Si/Al, Na/Si, H₂O/Si)\nTemperature, time\nSolvent, modulator\nOSDA identity',
  }),
  feat_enc: N('feat_enc', 'Feature Vec', 215, 30, W, H, 'rect', '#8ae4ff', {
    inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'Gel composition ratio vector\nMorgan fingerprints from OSDA SMILES\nNormalised numeric features',
  }),
  classifier: N('classifier', 'Classifier', 400, 30, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Random Forest / XGBoost\nTrained on labelled synthesis routes\n>70% accuracy on framework type',
  }),
  phase_out: N('phase_out', 'Phase Label', 585, 30, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.funnel, svg_viewbox: '0 0 40 40',
    hover_text: 'Pure-phase ZSM-5\nMixed phases\nAmorphous / Failed synthesis',
  }),

  // ── Row 2: training ───────────────────────────────────────────────────────
  hist_data: N('hist_data', 'History', 30, 225, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'ELN synthesis records\nLabelled phase outcomes\nHistorical experiment archive',
  }),
  train_set: N('train_set', 'Train Split', 215, 225, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.list, svg_viewbox: '0 0 40 40',
    hover_text: 'Stratified split by phase label\nCross-validation folds\nHeld-out test set',
  }),
  model_fit: N('model_fit', 'Model Fit', 400, 225, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.gear, svg_viewbox: '0 0 40 40',
    hover_text: 'Hyperparameter tuning (grid/Bayesian)\nCross-validated training\nFeature importance ranking (SHAP)',
  }),
  metrics: N('metrics', 'Metrics', 585, 225, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.data, svg_viewbox: '0 0 40 40',
    hover_text: 'Accuracy, precision, recall\nConfusion matrix per phase class\nROC-AUC',
  }),
};

const edges = {
  // inference flow
  e_cf: E('e_cf', 'cond', 'feat_enc', { speed: 1.2, dash_space: 8 }),
  e_fc: E('e_fc', 'feat_enc', 'classifier', { speed: 1.2, dash_space: 8 }),
  e_co: E('e_co', 'classifier', 'phase_out', { speed: 1.0, dash_space: 8, color: '#80ffaa' }),
  // training flow
  e_hd: E('e_hd', 'hist_data', 'train_set', { speed: 0.8, dash_space: 8, color: '#ffd080' }),
  e_dt: E('e_dt', 'train_set', 'model_fit', { speed: 0.8, dash_space: 8, color: '#ffd080' }),
  // fitted model feeds up into live classifier
  e_mc: E('e_mc', 'model_fit', 'classifier', { speed: 0.5, dash_space: 12, color: '#ffd080', stiffness: 0.25, label: 'deploy' }),
  // test predictions → evaluation
  e_om: E('e_om', 'phase_out', 'metrics', { speed: 0.6, dash_space: 10, color: '#80ffaa' }),
};

export const ClassificationGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
