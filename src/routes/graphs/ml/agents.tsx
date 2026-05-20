import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

const W = 70, H = 70;

// Two-section layout connected at the LLM Agent node.
//
// LEFT — Multimodal Cross-Attention (x=30–300):
//   Four modality encoders feed a Cross-Attention layer.
//   Regression pipeline latent features become the Key / Value vectors,
//   injecting learned chemistry knowledge into the LLM attention layers.
//
//   mol_enc  (30,  30) ────────── end_frac:0.10 ──\
//   chem_enc (30, 150) ────────── end_frac:0.35 ───→ cross_attn (230,210) ─ fused context ─→ llm_agent
//   regr_feat(30, 270) ── K,V ─── end_frac:0.65 ───/   Q = LLM hidden state
//   text_enc (30, 390) ────────── end_frac:0.90 ──/
//
// RIGHT — LLM Agent + MCP Tool Cascade (x=450–750):
//   user_query (480, 30)  ──────────────────────────→ llm_agent (480,190)
//                                                           ↓
//                                                     tool_disp (480,340)
//                                                    ↙         ↓         ↘
//                                        db (280,480)  comp (480,480)  robot (680,480)
//                                          ↘               ↓               ↙
//                                               result_fuse (480,610) → response (680,610)

const nodes = {
  // ── Modality Encoders ──────────────────────────────────────────────────────
  mol_enc: N('mol_enc', 'Mol. Encoder', 30, 30, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.molecule, svg_viewbox: '0 0 40 40',
    hover_text: 'Molecular encoder\nSMILES tokenizer + GNN (AttentiveFP/GCN)\nCaptures bonding topology & functional groups\nOutput: mol embedding ∈ ℝᵈ',
  }),
  chem_enc: N('chem_enc', 'Chem. Encoder', 30, 150, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.beaker, svg_viewbox: '0 0 40 40',
    hover_text: 'Chemical encoder\n1D CNN / Transformer over PXRD, NMR, IR spectra\nMLP over tabular synthesis conditions\n(reagent ratios, temp, time, solvent, modulator)\nOutput: chem embedding ∈ ℝᵈ',
  }),
  regr_feat: N('regr_feat', 'Regr. Features', 30, 270, W, H, 'rect', '#8ae4ff', {
    inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'Latent features from regression pipeline\nPenultimate-layer embeddings from\nyield / BET / CO₂ regressors\nEncode learned synthesis–property mappings\nProjected to shared dim → Key, Value vectors\nGive the LLM chemistry-aware attention context',
  }),
  text_enc: N('text_enc', 'Text Encoder', 30, 390, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.list, svg_viewbox: '0 0 40 40',
    hover_text: 'Literature / protocol text encoder\nLLM tokenizer (BPE) over paper abstracts,\nELN notes, synthesis procedures\nFrozen or LoRA-tuned base LLM layers\nOutput: text embedding ∈ ℝᵈ',
  }),

  // ── Cross-Attention Fusion ────────────────────────────────────────────────
  cross_attn: N('cross_attn', 'Cross-Attention', 230, 210, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.funnel, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'Multi-head cross-attention fusion\nQ  = LLM hidden state (current token)\nK, V = projected modality embeddings\nAttn(Q,K,V) = softmax(QKᵀ/√d) · V\nFused context injected into LLM layers\nRegression K,V encode chemistry structure-\nproperty knowledge the LLM can attend to\n(cf. Flamingo, LLaVA, ChemMLLM, LLM-MPP)',
  }),

  // ── LLM Agent Core ────────────────────────────────────────────────────────
  user_query: N('user_query', 'User Query', 480, 30, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.person, svg_viewbox: '0 0 40 40',
    hover_text: 'Natural language query + optional attachments\n(SMILES string, spectra file, synthesis targets)\nParsed into intent + entity extraction',
  }),
  llm_agent: N('llm_agent', 'LLM Agent', 480, 190, W, H, 'rect', '#d080ff', {
    inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', border: 'rounded',
    hover_text: 'ReAct / chain-of-thought planner\n(GPT-4, Claude, LLaMA-3.1-70B)\nReceives: user tokens + cross-attn fused context\nPlans and iterates MCP tool call sequences\nMaintains conversation context across turns\n(cf. ChemCrow, Coscientist, ChemAgents)',
  }),

  // ── MCP Tool Dispatcher ───────────────────────────────────────────────────
  tool_disp: N('tool_disp', 'MCP Dispatcher', 480, 340, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.gear, svg_viewbox: '0 0 40 40',
    hover_text: 'MCP Client — Model Context Protocol\nRoutes LLM tool calls to typed MCP servers\nJSON-schema function dispatch\nCost-ordered escalation: DB → Compute → Robot\nEscalates only when cheaper tier cannot answer\nHandles auth, rate-limiting, error retry\n(cf. ChemMCP, NIMO Controller, AiChemy)',
  }),

  // ── MCP Servers — cost-ordered (speed mirrors real-world time cost) ────────
  db_lookup: N('db_lookup', 'DB Lookup', 360, 480, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40',
    hover_text: '① Database / KG Lookup  [free · ~seconds]\nPubChem, ChEMBL, CSD, Materials Project, ELN\nReturns: properties, reactions, availability, refs\nChemMCP tools: Name2SMILES, PubChemSearch,\nSafetyCheck, PatentCheck (50+ tools)\nExhausted first — zero marginal cost',
  }),
  comp_exp: N('comp_exp', 'Comp. Exp.', 480, 480, W, H, 'rect', '#ffd080', {
    inner_border: true, svg_content: ICONS.search, svg_viewbox: '0 0 40 40',
    hover_text: '② Computational Experiment  [~mins–hrs · $1–100]\nDFT (Gaussian, VASP), MD (GROMACS, OpenMM)\nForce-field min. (RDKit/OpenFF)\nPXRD prediction, BET simulation, docking\nChemMCP: ForwardSynthesis, Retrosynthesis\nFilters candidates before robot commitment',
  }),
  robot_exp: N('robot_exp', 'Robot Exp.', 600, 480, W, H, 'rect', '#8afff9', {
    inner_border: true, svg_content: ICONS.robot_arm, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: '③ Robotic Experiment  [~hrs–days · $10–5000]\nLiquid-handling: OT-2, Hamilton, Tecan\nSynthesis platforms: Chemputer, RoboRXN\nIn-line characterisation: NMR, IR, XRD, GC-MS\nOnly triggered when DB + compute insufficient\nCoscientist: Suzuki/Sonogashira in < 4 minutes',
  }),

  // ── Result Fusion + Response ──────────────────────────────────────────────
  result_fuse: N('result_fuse', 'Result Fusion', 480, 610, W, H, 'rect', '#8ae4ff', {
    inner_border: true, svg_content: ICONS.data, svg_viewbox: '0 0 40 40', border: 'dense',
    hover_text: 'Aggregates heterogeneous tool outputs\nDB records + computed properties + measurements\nResolves conflicts, assigns confidence scores\nStructured summary fed to response generator',
  }),
  response: N('response', 'Response', 680, 610, W, H, 'rect', '#80ffaa', {
    inner_border: true, svg_content: ICONS.person, svg_viewbox: '0 0 40 40',
    hover_text: 'Final natural language answer with citations\nSupporting data tables, predicted properties\nRecommended next experimental actions\nLogged to persistent memory for reproducibility',
  }),
};

const edges = {
  // Modality encoders → Cross-Attention
  // All enter the LEFT side of cross_attn; end_frac spreads entry points vertically
  e_mc: E('e_mc', 'mol_enc', 'cross_attn', { speed: 1.2, dash_space: 8, color: '#8afff9', end_frac: 0.15 }),
  e_chc: E('e_chc', 'chem_enc', 'cross_attn', { speed: 1.2, dash_space: 8, color: '#8afff9', end_frac: 0.4 }),
  e_rgc: E('e_rgc', 'regr_feat', 'cross_attn', { speed: 1.2, dash_space: 10, color: '#8ae4ff', end_frac: 0.6, label: 'K, V' }),
  e_tc: E('e_tc', 'text_enc', 'cross_attn', { speed: 1.2, dash_space: 8, color: '#8afff9', end_frac: 0.85 }),

  // Cross-Attention fused context → LLM Agent (horizontal bridge between sections)
  e_ca: E('e_ca', 'cross_attn', 'llm_agent', { speed: 1.5, dash_space: 8, color: '#d080ff', label: 'fused context' }),

  // User query → LLM Agent (query token = Q source for cross-attn)
  e_uq: E('e_uq', 'user_query', 'llm_agent', { speed: 1.5, dash_space: 8 }),

  // LLM Agent → MCP Dispatcher
  e_ltd: E('e_ltd', 'llm_agent', 'tool_disp', { speed: 1.2, dash_space: 8 }),

  // Dispatcher → MCP Servers: exits LEFT / BOTTOM / RIGHT — no side overlap
  // Animation speed reflects real-world time cost of each tier
  e_tdb: E('e_tdb', 'tool_disp', 'db_lookup', { speed: 1.5, dash_space: 8, color: '#80ffaa', start_frac: 0.25 }),
  e_tcp: E('e_tcp', 'tool_disp', 'comp_exp', { speed: 1.0, dash_space: 10, color: '#ffd080', start_frac: 0.5 }),
  e_trb: E('e_trb', 'tool_disp', 'robot_exp', { speed: 0.5, dash_space: 14, color: '#8afff9', start_frac: 0.75 }),

  // MCP Servers → Result Fusion: symmetric fan-in (enters LEFT / TOP / RIGHT)
  e_dbf: E('e_dbf', 'db_lookup', 'result_fuse', { speed: 1.5, dash_space: 8, color: '#80ffaa', end_frac: 0.25 }),
  e_cpf: E('e_cpf', 'comp_exp', 'result_fuse', { speed: 1.0, dash_space: 10, color: '#ffd080', end_frac: 0.5 }),
  e_rbf: E('e_rbf', 'robot_exp', 'result_fuse', { speed: 0.5, dash_space: 14, color: '#8afff9', end_frac: 0.75 }),

  // Result Fusion → Response
  e_frs: E('e_frs', 'result_fuse', 'response', { speed: 1.5, dash_space: 8, color: '#80ffaa' }),
};

export const AgentsGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
