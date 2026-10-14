/**
 * The website's Flowchart (src/pages/FlowchartPage.tsx) as plain data: the
 * React Flow node and edge JSON saved in the `flowcharts` table, read and
 * edited without React Flow so the iOS app can show it as columns and a tree.
 *
 * Every edit returns new arrays and copies each node and edge it changes with
 * a spread, so fields this file does not know (positions, sizes, handles,
 * styles React Flow added) survive the round trip to the website.
 */

export const FLOW_NODE_TYPES = ['thesis', 'contention', 'attack', 'rebuttal', 'dropped'] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

export const FLOW_EDGE_KINDS = ['support', 'attack', 'rebuttal'] as const;
export type FlowEdgeKind = (typeof FLOW_EDGE_KINDS)[number];

export const FLOW_STRENGTHS = ['strong', 'moderate', 'weak'] as const;
export type FlowStrength = (typeof FLOW_STRENGTHS)[number];

export interface FlowNodeData {
  label: string;
  description?: string | null;
  type: FlowNodeType;
  strength?: FlowStrength;
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: FlowNodeData;
  [key: string]: unknown;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

/** A saved map's `nodes` and `edges` columns. Nodes and edges this file cannot read are kept as they are. */
export interface FlowchartDocument {
  nodes: unknown[];
  edges: unknown[];
}

/** The website's edge labels and stroke colours (edgeStyles). Edges carry no kind of their own, only these. */
export const FLOW_EDGE_STYLES: Record<FlowEdgeKind, { label: string; stroke: string }> = {
  support: { label: 'Support', stroke: '#10b981' },
  attack: { label: 'Attack', stroke: '#ef4444' },
  rebuttal: { label: 'Rebuttal', stroke: '#3b82f6' },
};

/** The thesis cannot be deleted on the website; it is found by this id. */
export const THESIS_ID = 'thesis';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeType(value: unknown): value is FlowNodeType {
  return typeof value === 'string' && (FLOW_NODE_TYPES as readonly string[]).includes(value);
}

export function isFlowNode(value: unknown): value is FlowNode {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRecord(value.position) &&
    typeof value.position.x === 'number' &&
    typeof value.position.y === 'number' &&
    isRecord(value.data) &&
    typeof value.data.label === 'string' &&
    (value.data.description === undefined || value.data.description === null || typeof value.data.description === 'string') &&
    isNodeType(value.data.type)
  );
}

export function isFlowEdge(value: unknown): value is FlowEdge {
  return isRecord(value) && typeof value.id === 'string' && typeof value.source === 'string' && typeof value.target === 'string';
}

/** A saved row's columns as a document. Anything that is not a list becomes an empty one, as the columns default to `[]`. */
export function readFlowchart(nodes: unknown, edges: unknown): FlowchartDocument {
  return { nodes: Array.isArray(nodes) ? nodes : [], edges: Array.isArray(edges) ? edges : [] };
}

/** The nodes the website can draw, in their saved order. */
export function flowNodes(doc: FlowchartDocument): FlowNode[] {
  return doc.nodes.filter(isFlowNode);
}

/** The edges between two drawable nodes. */
export function flowEdges(doc: FlowchartDocument): FlowEdge[] {
  const ids = new Set(flowNodes(doc).map((node) => node.id));
  return doc.edges.filter((edge): edge is FlowEdge => isFlowEdge(edge) && ids.has(edge.source) && ids.has(edge.target));
}

export function findNode(doc: FlowchartDocument, id: string): FlowNode | undefined {
  return flowNodes(doc).find((node) => node.id === id);
}

/**
 * An edge's kind, read from what the website writes: its label from the
 * edge-type picker, else its stroke colour. The starter's thesis edges have
 * neither and are supports; edges imported from a case have only a stroke.
 */
export function edgeKind(edge: FlowEdge): FlowEdgeKind {
  const label = typeof edge.label === 'string' ? edge.label : null;
  const stroke = isRecord(edge.style) && typeof edge.style.stroke === 'string' ? edge.style.stroke.toLowerCase() : null;
  for (const kind of FLOW_EDGE_KINDS) if (label === FLOW_EDGE_STYLES[kind].label) return kind;
  for (const kind of FLOW_EDGE_KINDS) if (stroke === FLOW_EDGE_STYLES[kind].stroke) return kind;
  return 'support';
}

type Translate = (key: string) => string;

/** The website's starter map (createInitialNodes and initialEdges), translated. */
export function starterFlowchart(t: Translate): FlowchartDocument {
  const node = (id: string, x: number, y: number, label: string, description: string, type: FlowNodeType, strength?: FlowStrength): FlowNode => ({
    id,
    type: 'custom',
    position: { x, y },
    data: { label: t(`flowchart.starter.${label}`), description: t(`flowchart.starter.${description}`), type, ...(strength ? { strength } : {}) },
  });
  const arrow = { type: 'arrowclosed' };
  return {
    nodes: [
      node('thesis', 400, 50, 'thesisLabel', 'thesisDesc', 'thesis'),
      node('c1', 150, 200, 'argument1Label', 'argument1Desc', 'contention', 'strong'),
      node('c2', 400, 200, 'argument2Label', 'argument2Desc', 'contention', 'moderate'),
      node('c3', 650, 200, 'argument3Label', 'argument3Desc', 'contention', 'weak'),
      node('a1', 150, 350, 'opponentAttackLabel', 'opponentAttackDesc', 'attack'),
      node('r1', 150, 500, 'rebuttalLabel', 'rebuttalDesc', 'rebuttal'),
    ],
    edges: [
      { id: 'e-thesis-c1', source: 'thesis', target: 'c1', animated: true, markerEnd: arrow },
      { id: 'e-thesis-c2', source: 'thesis', target: 'c2', animated: true, markerEnd: arrow },
      { id: 'e-thesis-c3', source: 'thesis', target: 'c3', animated: true, markerEnd: arrow },
      { id: 'e-c1-a1', source: 'c1', target: 'a1', style: { stroke: '#ef4444' }, markerEnd: arrow },
      { id: 'e-a1-r1', source: 'a1', target: 'r1', style: { stroke: '#3b82f6' }, markerEnd: arrow },
    ],
  };
}

export interface CardFields {
  label: string;
  description: string;
  type: FlowNodeType;
  strength: FlowStrength;
}

/** The website's node data from its add and edit dialog: strength only for arguments (contentions). */
function cardData(fields: CardFields): Pick<FlowNodeData, 'label' | 'description' | 'type' | 'strength'> {
  return {
    label: fields.label,
    description: fields.description,
    type: fields.type,
    strength: fields.type === 'contention' ? fields.strength : undefined,
  };
}

/** The rows autoLayout puts each type on. */
const LANE_Y: Record<FlowNodeType, number> = { thesis: 60, contention: 230, attack: 420, rebuttal: 610, dropped: 420 };
const LANE_SPACING = 280;

/**
 * A new card's place: the website drops it at random, so the app uses the
 * website's own auto layout instead, at the end of its type's row.
 */
function newCardPosition(doc: FlowchartDocument, type: FlowNodeType): { x: number; y: number } {
  const lane = flowNodes(doc).filter((node) => node.data.type === type);
  const x = lane.length === 0 ? 400 : Math.max(...lane.map((node) => node.position.x)) + LANE_SPACING;
  return { x, y: LANE_Y[type] };
}

/** Adds a card with the website's id scheme. `now` is the time in milliseconds. */
export function addCard(doc: FlowchartDocument, fields: CardFields, now: number): { doc: FlowchartDocument; id: string } {
  const taken = new Set(flowNodes(doc).map((node) => node.id));
  let stamp = now;
  while (taken.has(`node-${stamp}`)) stamp += 1;
  const id = `node-${stamp}`;
  const node: FlowNode = { id, type: 'custom', position: newCardPosition(doc, fields.type), data: cardData(fields) };
  return { doc: { ...doc, nodes: [...doc.nodes, node] }, id };
}

/** Edits a card in place, as the website's edit dialog does: other data fields stay. */
export function editCard(doc: FlowchartDocument, id: string, fields: CardFields): FlowchartDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => (isFlowNode(node) && node.id === id ? { ...node, data: { ...node.data, ...cardData(fields) } } : node)),
  };
}

export function canDeleteCard(id: string): boolean {
  return id !== THESIS_ID;
}

/** Removes a card and every link to or from it. The thesis stays, as on the website. */
export function deleteCard(doc: FlowchartDocument, id: string): FlowchartDocument {
  if (!canDeleteCard(id)) return doc;
  return {
    nodes: doc.nodes.filter((node) => !(isRecord(node) && node.id === id)),
    edges: doc.edges.filter((edge) => !(isRecord(edge) && (edge.source === id || edge.target === id))),
  };
}

/**
 * Whether `source` may link to `target`. React Flow refuses a second edge
 * between the same two nodes in the same direction, whatever its kind; the
 * app also refuses a card linking to itself.
 */
export function canLink(doc: FlowchartDocument, source: string, target: string): boolean {
  if (source === target || !findNode(doc, source) || !findNode(doc, target)) return false;
  return !doc.edges.some((edge) => isRecord(edge) && edge.source === source && edge.target === target);
}

/**
 * Links two cards as the website's onConnect does: from the claim that is
 * supported, attacked or rebutted (`source`) to the card that responds
 * (`target`), with the kind's label and colour and React Flow's edge id.
 */
export function linkCards(doc: FlowchartDocument, source: string, target: string, kind: FlowEdgeKind): FlowchartDocument {
  if (!canLink(doc, source, target)) return doc;
  const style = FLOW_EDGE_STYLES[kind];
  const edge: FlowEdge = {
    source,
    sourceHandle: null,
    target,
    targetHandle: null,
    animated: true,
    label: style.label,
    style: { stroke: style.stroke, strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed' },
    id: `reactflow__edge-${source}-${target}`,
  };
  return { ...doc, edges: [...doc.edges, edge] };
}

/** Removes one link, as deleting a selected edge on the website does. */
export function unlinkCards(doc: FlowchartDocument, edgeId: string): FlowchartDocument {
  return { ...doc, edges: doc.edges.filter((edge) => !(isRecord(edge) && edge.id === edgeId)) };
}

export interface CardLink {
  edgeId: string;
  kind: FlowEdgeKind;
  /** The card at the other end. */
  other: FlowNode;
}

/**
 * A card's links. `responds` are the claims this card supports, attacks or
 * rebuts (edges into it); `answeredBy` are the cards that respond to it
 * (edges out of it).
 */
export function cardLinks(doc: FlowchartDocument, id: string): { responds: CardLink[]; answeredBy: CardLink[] } {
  const nodes = new Map(flowNodes(doc).map((node) => [node.id, node]));
  const responds: CardLink[] = [];
  const answeredBy: CardLink[] = [];
  for (const edge of flowEdges(doc)) {
    if (edge.target === id) responds.push({ edgeId: edge.id, kind: edgeKind(edge), other: nodes.get(edge.source)! });
    if (edge.source === id) answeredBy.push({ edgeId: edge.id, kind: edgeKind(edge), other: nodes.get(edge.target)! });
  }
  return { responds, answeredBy };
}

/** An attack nobody has rebutted yet: no rebuttal link, and no rebuttal card, answers it. */
export function isUnanswered(doc: FlowchartDocument, node: FlowNode): boolean {
  if (node.data.type !== 'attack') return false;
  return !cardLinks(doc, node.id).answeredBy.some((link) => link.kind === 'rebuttal' || link.other.data.type === 'rebuttal');
}

/** The claim a card answers for its meta line: the first one linked with the card's own kind, else the first one. */
export function answeredClaim(doc: FlowchartDocument, node: FlowNode): FlowNode | null {
  const { responds } = cardLinks(doc, node.id);
  const own = node.data.type === 'attack' ? 'attack' : node.data.type === 'rebuttal' ? 'rebuttal' : 'support';
  return (responds.find((link) => link.kind === own) ?? responds[0])?.other ?? null;
}

export interface FlowColumns {
  /** The thesis, arguments and dropped cards. */
  yourCase: FlowNode[];
  attacks: FlowNode[];
  rebuttals: FlowNode[];
}

/** Cards by role, for the Flow tab. Attacks follow the order of what they attack, rebuttals the order of what they rebut. */
export function flowColumns(doc: FlowchartDocument): FlowColumns {
  const nodes = flowNodes(doc);
  const yourCase = [
    ...nodes.filter((node) => node.data.type === 'thesis'),
    ...nodes.filter((node) => node.data.type === 'contention' || node.data.type === 'dropped'),
  ];
  const orderBy = (cards: FlowNode[], before: FlowNode[]) => {
    const rank = new Map(before.map((node, index) => [node.id, index]));
    const place = (node: FlowNode) => {
      const claim = answeredClaim(doc, node);
      return claim && rank.has(claim.id) ? rank.get(claim.id)! : before.length;
    };
    return cards.map((node, index) => ({ node, index, at: place(node) })).sort((a, b) => a.at - b.at || a.index - b.index).map((entry) => entry.node);
  };
  const attacks = orderBy(nodes.filter((node) => node.data.type === 'attack'), yourCase);
  const rebuttals = orderBy(nodes.filter((node) => node.data.type === 'rebuttal'), attacks);
  return { yourCase, attacks, rebuttals };
}

export interface MapRow {
  node: FlowNode;
  depth: number;
  /** The link from the row above it in the tree, or null for a root. */
  via: FlowEdgeKind | null;
}

/**
 * The Map tab's tree: from the thesis down every link, each card once, then
 * every card no link reached (an unlinked dropped card, a loose attack) as
 * its own root, in saved order.
 */
export function mapRows(doc: FlowchartDocument): MapRow[] {
  const nodes = flowNodes(doc);
  const edges = flowEdges(doc);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const rows: MapRow[] = [];
  const visit = (node: FlowNode, depth: number, via: FlowEdgeKind | null) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    rows.push({ node, depth, via });
    for (const edge of edges) {
      if (edge.source === node.id) visit(byId.get(edge.target)!, depth + 1, edgeKind(edge));
    }
  };
  const roots = [
    ...nodes.filter((node) => node.data.type === 'thesis'),
    ...nodes.filter((node) => node.data.type !== 'thesis' && !edges.some((edge) => edge.target === node.id)),
    ...nodes,
  ];
  for (const root of roots) visit(root, 0, null);
  return rows;
}
