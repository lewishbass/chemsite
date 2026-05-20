import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const W = 70, H = 70;

// Fork layout — regressor fans to shap (upper) and latent (lower),
// both converge at aug_mat, then pipeline drops to a left-running row.
//
//                    [shap: 450,30]
//                   /              \
// [raw:50,130] → [reg:220,130]   [aug:580,130] → [hdbscan:730,130]
//                   \              /                     ↓
//                    [latent:450,230]              [umap:730,330]
//                                                        ↓
//           [defining:205,330] ← [boundary:380,330] ← [cluster_map:555,330]
//                ↑
//           (from shap, exits bottom → enters top, arcs through empty space)

const nodes = {
  raw_feat: N('raw_feat', 'Raw Features', 50, 130, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.data, svg_viewbox: '0 0 40 40',
    hover_text: 'Synthesis conditions + structural data\nReagent ratios, temp, time, solvent\nBET, PXRD, pore descriptors',
  }),
  regressor: N('regressor', 'Regressor', 220, 130, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Pre-trained regression model\n(yield, BET, CO₂ uptake, etc.)\nUsed as feature extractor',
  }),

  // fork: shap upper, latent lower
  shap: N('shap', 'SHAP Saliency', 450, 230, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.list, svg_viewbox: '0 0 40 40',
    hover_text: 'SHAP values per feature per sample\nPermutation & gradient-based importance\nRanked saliency for each target',
  }),
  latent: N('latent', 'Latent Feats', 450, 30, W, H, 'rect', '#8ae4ff', {
    inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'Penultimate-layer embeddings\nBottleneck representation from regressor\nEncodes learned chemistry',
  }),

  // converge
  aug_mat: N('aug_mat', 'Aug. Matrix', 580, 130, W, H, 'rect', '#8ae4ff', {
    inner_border: true, svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'Concat: raw features + SHAP-weighted\nselection + latent embeddings\nInput to clustering and UMAP',
  }),
  hdbscan: N('hdbscan', 'HDBSCAN', 730, 130, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.gear, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Density-based hierarchical clustering\nHandles noise / outlier experiments\nNo preset cluster count required',
  }),

  // output row
  umap: N('umap', 'UMAP', 730, 330, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40',
    hover_text: 'Non-linear dimensionality reduction\n2D / 3D projection of aug. matrix\nPreserves local & global structure',
  }),
  cluster_map: N('cluster_map', 'Cluster Map', 555, 330, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.molecule, svg_viewbox: '0 0 40 40',
    hover_text: 'Labelled 2D/3D embedding space\nColoured by cluster assignment\nChemical similarity landscape',
  }),
  boundary: N('boundary', 'Boundaries', 380, 330, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.search, svg_viewbox: '0 0 40 40',
    hover_text: 'Cluster boundary detection\nSilhouette score per sample\nDecision boundary via SHAP contours',
  }),
  defining: N('defining', 'Defining Feats', 205, 330, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.list, svg_viewbox: '0 0 40 40',
    hover_text: 'Per-cluster SHAP centroid analysis\nFeatures with highest inter-cluster\nvariance (Si/Al, temp, pore size…)',
  }),
};

const edges = {
  e_rf: E('e_rf', 'raw_feat', 'regressor', { speed: 1.2, dash_space: 8 }),

  // regressor forks — separated exit points (start_frac) to avoid overlap
  e_rs: E('e_rs', 'regressor', 'shap', { speed: 1.2, dash_space: 8, color: '#d080ff', start_frac: 0.75, end_frac: 0.25 }),
  e_sl: E('e_sl', 'regressor', 'latent', { speed: 0.8, dash_space: 10, color: '#8ae4ff', start_frac: 0.25, label: 'embeddings' }),

  // fork converges at aug_mat — separated entry points (end_frac)
  e_sa: E('e_sa', 'shap', 'aug_mat', { speed: 1.2, dash_space: 8, color: '#ffd080', end_frac: 0.75 }),
  e_la: E('e_la', 'latent', 'aug_mat', { speed: 1.2, dash_space: 8, color: '#8ae4ff', end_frac: 0.25 }),

  e_ah: E('e_ah', 'aug_mat', 'hdbscan', { speed: 1.2, dash_space: 8 }),
  e_hu: E('e_hu', 'hdbscan', 'umap', { speed: 1.2, dash_space: 8 }),
  e_uc: E('e_uc', 'umap', 'cluster_map', { speed: 1.2, dash_space: 8, color: '#80ffaa' }),
  e_cb: E('e_cb', 'cluster_map', 'boundary', { speed: 1.0, dash_space: 8, color: '#80ffaa' }),
  e_bd: E('e_bd', 'boundary', 'defining', { speed: 1.0, dash_space: 8, color: '#80ffaa', end_frac: 0.75 }),

  // shap exits bottom → defining enters top: arcs through the empty centre
  e_sd: E('e_sd', 'shap', 'defining', { speed: 0.4, dash_space: 14, color: '#ffd080', stiffness: 0.7, label: 'per-cluster SHAP', start_frac: 0.75, end_frac: 0.25 }),
};

export const ClusteringGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
