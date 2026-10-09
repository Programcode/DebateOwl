import { addEdge, MarkerType, type Edge } from 'reactflow';
import { describe, expect, it } from 'vitest';

import {
  addCard,
  canLink,
  deleteCard,
  edgeKind,
  editCard,
  flowEdges,
  linkCards,
  readFlowchart,
  unlinkCards,
  type FlowEdge,
} from '@debatelab/core/flowchart';

// A map as the website saves it after dragging and connecting: React Flow
// adds sizes, selection and absolute positions, and an imported case brings
// stroke-only edges. The app edits it; whatever it does not edit must come back unchanged.
const websiteNodes = [
  {
    id: 'thesis', type: 'custom', position: { x: 400, y: 50 }, width: 212, height: 96, selected: false, positionAbsolute: { x: 400, y: 50 }, dragging: false,
    data: { label: 'Ban cars', description: 'From city centres', type: 'thesis' },
  },
  {
    id: 'c-0', type: 'custom', position: { x: 120, y: 240 }, width: 230, height: 120, sourcePosition: 'bottom',
    data: { label: 'Air quality', description: 'Health duty', type: 'contention', strength: 'strong', note: 'kept' },
  },
  {
    id: 'a-0', type: 'custom', position: { x: 120, y: 450 }, width: 200, height: 88,
    data: { label: 'Shift workers', description: 'No alternative', type: 'attack' },
  },
  { id: 'group-1', type: 'group', position: { x: 0, y: 0 }, data: { label: 'Not a card' } },
];

const websiteEdges = [
  { id: 'e-thesis-c-0', source: 'thesis', target: 'c-0', animated: true, markerEnd: { type: 'arrowclosed' } },
  { id: 'e-c-0-a-0', source: 'c-0', target: 'a-0', label: 'Attack', style: { stroke: '#ef4444', strokeWidth: 2 }, markerEnd: { type: 'arrowclosed' }, selected: true },
  { id: 'e-a-0-ghost', source: 'a-0', target: 'ghost', style: { stroke: '#3b82f6' } },
];

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

describe('flowchart document round trip', () => {
  it('keeps every field the app does not edit', () => {
    const original = json({ nodes: websiteNodes, edges: websiteEdges }) as { nodes: unknown[]; edges: unknown[] };
    let doc = readFlowchart(json(websiteNodes), json(websiteEdges));

    const added = addCard(doc, { label: 'Night buses', description: '', type: 'rebuttal', strength: 'moderate' }, 1_700_000_000_000);
    doc = linkCards(added.doc, 'a-0', added.id, 'rebuttal');
    doc = editCard(doc, 'c-0', { label: 'Clean air', description: 'Health duty', type: 'contention', strength: 'moderate' });
    const extra = addCard(doc, { label: 'Temp', description: 'x', type: 'dropped', strength: 'weak' }, 1_700_000_000_000);
    doc = deleteCard(linkCards(extra.doc, 'thesis', extra.id, 'support'), extra.id);

    const saved = json(doc) as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
    // Untouched nodes and edges, including ones the app cannot draw, are byte for byte the same.
    expect(saved.nodes[0]).toEqual(original.nodes[0]);
    expect(saved.nodes[2]).toEqual(original.nodes[2]);
    expect(saved.nodes[3]).toEqual(original.nodes[3]);
    expect(saved.edges.slice(0, 3)).toEqual(original.edges);
    // The edited node keeps its sizes, handles and unknown data, and only the edited fields change.
    expect(saved.nodes[1]).toEqual({
      ...(original.nodes[1] as object),
      data: { label: 'Clean air', description: 'Health duty', type: 'contention', strength: 'moderate', note: 'kept' },
    });
    // The new card is the website's shape, on the auto-layout row for its type.
    expect(saved.nodes[4]).toEqual({
      id: 'node-1700000000000', type: 'custom', position: { x: 400, y: 610 },
      data: { label: 'Night buses', description: '', type: 'rebuttal' },
    });
    expect(saved.nodes).toHaveLength(5);
    expect(saved.edges).toHaveLength(4);
  });

  it('links cards exactly as the website connects them', () => {
    const doc = readFlowchart(json(websiteNodes), json(websiteEdges));
    const linked = linkCards(doc, 'thesis', 'a-0', 'attack');
    const ours = json(linked.edges[linked.edges.length - 1]);
    // FlowchartPage's onConnect: React Flow's connection, the picker's style, then addEdge.
    const theirs = addEdge(
      {
        source: 'thesis', sourceHandle: null, target: 'a-0', targetHandle: null,
        animated: true, label: 'Attack', style: { stroke: '#ef4444', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed },
      },
      websiteEdges as Edge[],
    );
    expect(ours).toEqual(json(theirs[theirs.length - 1]));
  });

  it('refuses the links React Flow refuses, and a card linked to itself', () => {
    const doc = readFlowchart(json(websiteNodes), json(websiteEdges));
    expect(canLink(doc, 'c-0', 'a-0')).toBe(false);
    expect(linkCards(doc, 'c-0', 'a-0', 'rebuttal')).toBe(doc);
    expect(canLink(doc, 'a-0', 'c-0')).toBe(true);
    expect(canLink(doc, 'a-0', 'a-0')).toBe(false);
    expect(canLink(doc, 'a-0', 'group-1')).toBe(false);
  });

  it('keeps the thesis and drops a deleted card with its links', () => {
    const doc = readFlowchart(json(websiteNodes), json(websiteEdges));
    expect(deleteCard(doc, 'thesis')).toBe(doc);
    const without = deleteCard(doc, 'a-0');
    expect(without.nodes.map((node) => (node as { id: string }).id)).toEqual(['thesis', 'c-0', 'group-1']);
    expect(without.edges.map((edge) => (edge as { id: string }).id)).toEqual(['e-thesis-c-0']);
    expect(unlinkCards(doc, 'e-thesis-c-0').edges).toHaveLength(2);
  });

  it('reads an edge kind from its label, then its stroke, else as a support', () => {
    const doc = readFlowchart(json(websiteNodes), json(websiteEdges));
    const kinds = (doc.edges as FlowEdge[]).map(edgeKind);
    expect(kinds).toEqual(['support', 'attack', 'rebuttal']);
    expect(edgeKind({ id: 'x', source: 'a', target: 'b', label: 'Support', style: { stroke: '#ef4444' } })).toBe('support');
    // An edge to a node that is gone is kept in the document but not drawn.
    expect(flowEdges(doc).map((edge) => edge.id)).toEqual(['e-thesis-c-0', 'e-c-0-a-0']);
  });
});
