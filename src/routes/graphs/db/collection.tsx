import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

// Snake layout: Row 1 (steps 0-4, left→right), Row 2 (steps 5-9, right→left)
// so step 5 sits under step 4, and step 9 sits under step 0.
const R1 = 55, R2 = 265, W = 70, H = 70;

const nodes = {
  n0: N('n0', 'Experiment Design', 80, R1, W, H, 'rect', '#8ae4ff', { inner_border: true, svg_content: ICONS.molecule, svg_viewbox: '0 0 40 40', hover_text: 'Input: ML prediction or human hypothesis\nOutput: Planned experiment record in ELN\nArtifacts: Experiment, Reactions, Chemical refs' }),
  n1: N('n1', 'Chemical Resolution', 255, R1, W, H, 'rect', '#8afff9', { inner_border: true, svg_content: ICONS.beaker, svg_viewbox: '0 0 40 40', hover_text: 'Input: Abstract reagent list\nOutput: Physical bottles with lot numbers\nArtifacts: Chemical → Physical mapping, inventory check' }),
  n2: N('n2', 'Worklist Generation', 430, R1, W, H, 'rect', '#8afff9', { inner_border: true, svg_content: ICONS.gear, svg_viewbox: '0 0 40 40', hover_text: 'Input: ELN experiment record\nOutput: Robot-readable worklist file\nArtifacts: Worklist file, deck layout config' }),
  n3: N('n3', 'Synthesis Execution', 605, R1, W, H, 'rect', '#ffd080', { inner_border: true, svg_content: ICONS.robot_arm, svg_viewbox: '0 0 40 40', hover_text: 'Input: Worklist + physical reagents\nOutput: Products in barcoded vials\nArtifacts: Process Instances, Container (physical)' }),
  n4: N('n4', 'Data Write-Back', 780, R1, W, H, 'rect', '#ffd080', { inner_border: true, svg_content: ICONS.hdd, svg_viewbox: '0 0 40 40', hover_text: 'Input: Robot execution logs\nOutput: Updated Process Data in ELN\nArtifacts: Process Data (actual conditions)' }),
  n5: N('n5', 'Triage (Level 1a)', 730, R2, W, H, 'rect', '#80ffaa', { inner_border: true, svg_content: ICONS.funnel, svg_viewbox: '0 0 40 40', hover_text: 'Input: All synthesis products\nOutput: Hit / Ambiguous / Negative\nArtifacts: Test Instances, triage Sample Data' }),
  n6: N('n6', 'Full Level 1', 555, R2, W, H, 'rect', '#80ffaa', { inner_border: true, svg_content: ICONS.search, svg_viewbox: '0 0 40 40', hover_text: 'Input: Hits from triage\nOutput: Complete identity profile\nArtifacts: Test Instances, Level 1 Sample Data' }),
  n7: N('n7', 'Level 2', 380, R2, W, H, 'rect', '#80ffaa', { inner_border: true, svg_content: ICONS.data, svg_viewbox: '0 0 40 40', hover_text: 'Input: Characterised materials\nOutput: Application performance data\nArtifacts: Test Instances, Level 2 Sample Data' }),
  n8: N('n8', 'Data Transformation', 205, R2, W, H, 'rect', '#c080ff', { inner_border: true, svg_content: ICONS.transform, svg_viewbox: '0 0 40 40', hover_text: 'Input: Raw instrument files\nOutput: ML-ready feature vectors\nArtifacts: Layer 1 → Layer 2 → Layer 3' }),
  n9: N('n9', 'ML Feedback', 30, R2, W, H, 'rect', '#d080ff', { inner_border: true, svg_content: ICONS.brain, svg_viewbox: '0 0 40 40', hover_text: 'Input: Accumulated dataset\nOutput: New experiment proposals\nArtifacts: Model predictions, design constraints' }),
};

const edges = {
  e01: E('e01', 'n0', 'n1', { speed: 1.2, dash_space: 8 }),
  e12: E('e12', 'n1', 'n2', { speed: 1.2, dash_space: 8 }),
  e23: E('e23', 'n2', 'n3', { speed: 1.2, dash_space: 8 }),
  e34: E('e34', 'n3', 'n4', { speed: 1.2, dash_space: 8 }),
  e45: E('e45', 'n4', 'n5', { speed: 1.2, dash_space: 8 }),
  e56: E('e56', 'n5', 'n6', { speed: 1.2, dash_space: 8 }),
  e67: E('e67', 'n6', 'n7', { speed: 1.2, dash_space: 8 }),
  e78: E('e78', 'n7', 'n8', { speed: 1.2, dash_space: 8 }),
  e89: E('e89', 'n8', 'n9', { speed: 1.2, dash_space: 8 }),
  // feedback loop: ML Feedback → Experiment Design
  e90: E('e90', 'n9', 'n0', { color: '#d080ff', speed: 0.5, dash_space: 14, stiffness: 0.3, label: 'feedback' }),
};

export const CollectionGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
