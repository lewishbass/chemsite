import { component$ } from '@builder.io/qwik';
import { DragGraph, N, E } from '~/components/drag-graph/drag-graph';
import { ICONS } from '../icons';

// Hub layout: Test Definition at centre, attributes radiate out
//   Left  : Test ID | Level | Status          (feeds into TestDef)
//   Top   : Parent Definition                  (inherits from)
//   Right : Method | Instruments | Output Type (detailed by TestDef)
//   Bottom: Throughput | Sample Req | Child Def | Test Instance

const CX = 400, CY = 185; // centre of hub

const nodes = {
  // ── Centre ────────────────────────────────────────────────────────────────
  def: N('def', 'Test Definition', CX - 60, CY - 33, 120, 65, 'rect', '#8ae4ff', {
    inner_border: true,
    svg_content: ICONS.list,
    svg_viewbox: '0 0 40 40',
    hover_text: 'The canonical schema for a test.\nHolds all metadata fields\nthat define how a test is run.',
  }),

  // ── Top: inheritance ──────────────────────────────────────────────────────
  parent: N('parent', 'Parent Definition', CX - 55, 18, 110, 50, 'rect', '#8ae4ff', {
    svg_content: ICONS.list,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Generic test definition.\nExample: PXRD-001.\nChildren inherit and specialise.',
  }),

  // ── Left: identity attributes ─────────────────────────────────────────────
  testid: N('testid', 'Test ID', 60, 35, 110, 50, 'rect', '#8afff9', {
    svg_content: ICONS.search,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Format: [CATEGORY]-[NNN]\ne.g. PXRD-001, BET-001.\nPermanent. Never reused.',
  }),
  level: N('level', 'Level', 60, 160, 110, 50, 'rect', '#8afff9', {
    svg_content: ICONS.funnel,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Level 1: Identity (what the material is)\nLevel 2: Function (what it does)\nin a specific application context.',
  }),
  status: N('status', 'Status', 60, 285, 110, 50, 'rect', '#8afff9', {
    svg_content: ICONS.gear,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Draft: proposed, not validated\nActive: validated, available for use\nDeprecated: replaced by child definition.',
  }),

  // ── Right: procedural attributes ──────────────────────────────────────────
  method: N('method', 'Method', 710, 35, 110, 50, 'rect', '#ffd080', {
    svg_content: ICONS.list,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Complete procedure: parameters,\nreference standards, calibration,\nsample prep, acceptance criteria.',
  }),
  instruments: N('instruments', 'Instrument(s)', 710, 160, 115, 50, 'rect', '#ffd080', {
    svg_content: ICONS.hdd,
    svg_viewbox: '0 0 40 40',
    hover_text: 'In-house or shared facility.\nSpecific instrument used in a run\nis recorded in the Process Instance.',
  }),
  output: N('output', 'Output Data Type', 710, 285, 115, 50, 'rect', '#ffd080', {
    svg_content: ICONS.data,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Spectrum, isotherm, scalar,\nimage, etc.\nMaps to a LabIMotion Dataset type.',
  }),

  // ── Bottom: operational attributes + child ─────────────────────────────────
  throughput: N('throughput', 'Throughput', 180, 370, 115, 50, 'rect', '#ffd080', {
    svg_content: ICONS.gear,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Samples/hr or time/sample\nunder normal operating conditions.\nInforms scheduling and batching.',
  }),
  samplerq: N('samplerq', 'Sample Requirements', 355, 370, 130, 50, 'rect', '#ffd080', {
    svg_content: ICONS.beaker,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Quantity, physical form,\npreparation steps (e.g. degassing).\nDestructive vs non-destructive.',
  }),
  child: N('child', 'Child Definition', 535, 370, 120, 50, 'rect', '#8ae4ff', {
    svg_content: ICONS.list,
    svg_viewbox: '0 0 40 40',
    hover_text: 'Specialised child, e.g. PXRD-001-A.\nInherits parent method,\nadds instrument-specific parameters.',
  }),
  instance: N('instance', 'Test Instance', 700, 370, 115, 50, 'rect', '#c080ff', {
    svg_content: ICONS.robot_arm,
    svg_viewbox: '0 0 40 40',
    hover_text: 'One execution of a Test Definition\non a specific sample.\nRecords actual instrument used.',
  }),
};

const edges = {
  // Inheritance chain (top)
  eParent: E('eParent', 'parent', 'def', { color: '#8ae4ff', speed: 0.6, dash_space: 10, label: 'inherits' }),

  // Left attributes feed into definition
  eTestId: E('eTestId', 'testid', 'def', { color: '#8afff9', speed: 0.8, dash_space: 8 }),
  eLevel: E('eLevel', 'level', 'def', { color: '#8afff9', speed: 0.8, dash_space: 8 }),
  eStatus: E('eStatus', 'status', 'def', { color: '#8afff9', speed: 0.8, dash_space: 8 }),

  // Right: definition details how things work
  eMethod: E('eMethod', 'def', 'method', { color: '#ffd080', speed: 0.8, dash_space: 8 }),
  eInstr: E('eInstr', 'def', 'instruments', { color: '#ffd080', speed: 0.8, dash_space: 8 }),
  eOutput: E('eOutput', 'def', 'output', { color: '#ffd080', speed: 0.8, dash_space: 8 }),

  // Bottom: operational + specialisation
  eThrput: E('eThrput', 'def', 'throughput', { color: '#ffd080', speed: 0.6, dash_space: 10 }),
  eSample: E('eSample', 'def', 'samplerq', { color: '#ffd080', speed: 0.6, dash_space: 10 }),
  eChild: E('eChild', 'def', 'child', { color: '#8ae4ff', speed: 0.6, dash_space: 10, label: 'specialises' }),
  eInst: E('eInst', 'child', 'instance', { color: '#c080ff', speed: 1.0, dash_space: 8, label: 'run as' }),
};

export const FeaturesGraph = component$(() => (
  <DragGraph nodes={nodes} edges={edges} />
));
