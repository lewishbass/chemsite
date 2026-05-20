import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const W = 70, H = 70;

// WorldModel sits in a middle row (y=200), directly below ICM on the x-axis.
// This keeps world_mod→icm as a clean short vertical, and world_mod→ppo
// as a diagonal that arcs through the gap between phases without crossing nodes.
// The retrain loop (expl_data → world_mod) is omitted from the visual to avoid
// a long crossing arc; it is described in world_mod's hover_text instead.
//
// Phase 1 (y=20):    Dataset → ICM → IntrinsicRwd → ExploreExpts
//                                ↑
// Shared  (y=200):          WorldModel  ─────────────────────────────→ PPO
//                           /
// Phase 2 (y=380): OptimExpts ← OptPolicy ← RewardFn ← PPO ← ExplData
//                                                                  ↑
//                                                          (snake from ExploreExpts)

const R1 = 60, R2 = 200, R3 = 340; // y-positions of the three phases
const nodes = {
  // ── Phase 1: Exploration ──────────────────────────────────────────────────
  dataset: N('dataset', 'Dataset', 30, R1, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'Accumulated synthesis records\nConditions + measured outcomes\nFed into surrogate world model',
  }),
  icm: N('icm', 'ICM', 250, R1, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.gear, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Intrinsic Curiosity Module\nFeature encoder + forward model\n+ inverse model triplet\nReward = forward prediction error',
  }),
  int_reward: N('int_reward', 'Intrinsic Rwrd', 460, R1, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40',
    hover_text: 'High where world model is uncertain\nDrives agent toward novel regions\nof synthesis / composition space',
  }),
  explore_exp: N('explore_exp', 'Explore Expts', 660, R1, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.beaker, svg_viewbox: '0 0 40 40',
    hover_text: 'Suggested high-information experiments\nMaximise coverage of synthesis space\nReduce epistemic uncertainty',
  }),

  // ── Shared: World Model (between phases, aligned below ICM) ───────────────
  world_mod: N('world_mod', 'World Model', 300, R2, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Gaussian Process or Bayesian NN\nPredicts outcome + uncertainty\nSurrogate for real synthesis cost\nRetrained each time explore data arrives',
  }),

  // ── Phase 2: Exploitation ─────────────────────────────────────────────────
  expl_data: N('expl_data', 'Explore Data', 820, R3, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'Experimental results from exploration\nAdded to training dataset\nTriggers world model retrain',
  }),
  ppo: N('ppo', 'PPO Policy', 630, R3, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Proximal Policy Optimization\nState: current material conditions\nAction: next experiment parameters\nClipped surrogate objective',
  }),
  reward_fn: N('reward_fn', 'Reward Fn', 440, R3, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.funnel, svg_viewbox: '0 0 40 40',
    hover_text: 'Extrinsic reward from world model\nTarget: yield, BET, CO₂ uptake\nShaped to balance exploitation/exploration',
  }),
  opt_policy: N('opt_policy', 'Optimal Policy', 230, R3, W, H, 'rect', '#c080ff', {
    inner_border: true, svg_content: ICONS.data, svg_viewbox: '0 0 40 40',
    hover_text: 'Converged policy after PPO training\nMaps desired target → optimal conditions\nContinuously updated as new data arrives',
  }),
  optim_exp: N('optim_exp', 'Optim. Expts', 30, R3, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.beaker, svg_viewbox: '0 0 40 40',
    hover_text: 'Suggested optimisation experiments\nHigh predicted target performance\nNarrow, focused parameter space',
  }),
};

const edges = {
  // world model trains on dataset, then drives ICM upward (short vertical)
  e_dw: E('e_dw', 'dataset', 'world_mod', { speed: 1.0, dash_space: 8 }),
  e_wi: E('e_wi', 'world_mod', 'icm', { speed: 1.2, dash_space: 8 }),

  // phase 1 pipeline
  e_ir: E('e_ir', 'icm', 'int_reward', { speed: 1.2, dash_space: 8, color: '#ffd080' }),
  e_re: E('e_re', 'int_reward', 'explore_exp', { speed: 1.0, dash_space: 8, color: '#80ffaa' }),

  // snake: explore results drop to phase 2 (exits bottom, enters top — right side)
  e_ee: E('e_ee', 'explore_exp', 'expl_data', { speed: 1.2, dash_space: 8 }),

  // phase 2 pipeline
  e_ep: E('e_ep', 'expl_data', 'ppo', { speed: 1.0, dash_space: 8 }),
  e_prf: E('e_prf', 'ppo', 'reward_fn', { speed: 1.0, dash_space: 8, color: '#ffd080' }),
  e_fo: E('e_fo', 'reward_fn', 'opt_policy', { speed: 1.0, dash_space: 8, color: '#c080ff' }),
  e_oo: E('e_oo', 'opt_policy', 'optim_exp', { speed: 1.0, dash_space: 8, color: '#80ffaa' }),

  // world model → PPO: diagonal through the inter-phase gap, clears all nodes
  e_wp: E('e_wp', 'world_mod', 'ppo', { speed: 0.4, dash_space: 14, color: '#d080ff', stiffness: 0.3, label: 'surrogate' }),
};

export const ExplorationGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
