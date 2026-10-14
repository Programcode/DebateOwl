import {
  answeredClaim,
  cardLinks,
  isUnanswered,
  mapRows,
  type FlowchartDocument,
  type FlowEdgeKind,
  type FlowNode,
  type FlowNodeType,
} from '@debatelab/core/flowchart';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The website's names for each card type (CustomNode's badge). */
const TYPE_KEYS: Record<FlowNodeType, string> = {
  thesis: 'flowchart.legendThesis',
  contention: 'flowchart.typeArgument',
  attack: 'flowchart.typeAttack',
  rebuttal: 'flowchart.typeRebuttal',
  dropped: 'flowchart.typeDropped',
};

const STRENGTH_KEYS = { strong: 'flowchart.strengthStrong', moderate: 'flowchart.strengthModerate', weak: 'flowchart.strengthWeak' } as const;

export function typeLabel(t: Translate, type: FlowNodeType): string {
  return t(TYPE_KEYS[type]);
}

export function strengthLabel(t: Translate, node: FlowNode): string | null {
  const strength = node.data.strength;
  return typeof strength === 'string' && strength in STRENGTH_KEYS ? t(STRENGTH_KEYS[strength]) : null;
}

/** The card's type, with its strength for an argument: "Argument · Strong". */
export function cardKind(t: Translate, node: FlowNode): string {
  const strength = node.data.type === 'contention' ? strengthLabel(t, node) : null;
  return strength ? `${typeLabel(t, node.data.type)} · ${strength}` : typeLabel(t, node.data.type);
}

/** The line under a card in the Flow tab: its strength, or what it attacks or rebuts. */
export function flowMeta(t: Translate, doc: FlowchartDocument, node: FlowNode): string {
  if (node.data.type === 'contention') return strengthLabel(t, node) ?? typeLabel(t, 'contention');
  if (node.data.type === 'attack' || node.data.type === 'rebuttal') {
    const claim = answeredClaim(doc, node);
    if (claim) return t(node.data.type === 'attack' ? 'mobile.flowchart.attacksMeta' : 'mobile.flowchart.rebutsMeta', { claim: claim.data.label });
  }
  return typeLabel(t, node.data.type);
}

/** The line under a card in the Map tab, when it needs one. */
export function mapMeta(t: Translate, doc: FlowchartDocument, node: FlowNode): string | null {
  if (isUnanswered(doc, node)) return t('mobile.flowchart.notAnswered');
  if (node.data.type === 'contention') return strengthLabel(t, node);
  if (node.data.type === 'thesis' || node.data.type === 'dropped') return typeLabel(t, node.data.type);
  return null;
}

/** How a card hangs from the one above it in the Map tree. */
export function viaLabel(t: Translate, via: FlowEdgeKind): string {
  return t(`mobile.flowchart.via.${via}`);
}

const quote = (t: Translate, labels: string[]) => labels.map((label) => t('mobile.flowchart.quoted', { label })).join(', ');

/** The claim sheet's summary of a card's links: "Attacks “X”. Rebutted by 1 claim." */
export function linkSummary(t: Translate, doc: FlowchartDocument, node: FlowNode): string {
  const { responds, answeredBy } = cardLinks(doc, node.id);
  const parts: string[] = [];
  const responding: Record<FlowEdgeKind, string> = { support: 'supports', attack: 'attacks', rebuttal: 'rebuts' };
  const answered: Record<FlowEdgeKind, string> = { support: 'supportedBy', attack: 'attackedBy', rebuttal: 'rebuttedBy' };
  for (const kind of ['support', 'attack', 'rebuttal'] as const) {
    const labels = responds.filter((link) => link.kind === kind).map((link) => link.other.data.label);
    if (labels.length > 0) parts.push(t(`mobile.flowchart.summary.${responding[kind]}`, { claims: quote(t, labels) }));
  }
  for (const kind of ['support', 'attack', 'rebuttal'] as const) {
    const count = answeredBy.filter((link) => link.kind === kind).length;
    if (count > 0) parts.push(t(`mobile.flowchart.summary.${answered[kind]}`, { count }));
  }
  if (isUnanswered(doc, node)) parts.push(`${t('mobile.flowchart.notAnswered')}.`);
  return parts.length > 0 ? parts.join(' ') : t('mobile.flowchart.summary.none');
}

/** One link in the claim sheet's list, from this card's side: "Attacks “X”" or "Rebutted by “Y”". */
export function linkLine(t: Translate, kind: FlowEdgeKind, direction: 'responds' | 'answeredBy', other: FlowNode): string {
  return t(`mobile.flowchart.links.${direction}.${kind}`, { claim: t('mobile.flowchart.quoted', { label: other.data.label }) });
}

/** "Copy as text": the Map tree as an indented outline. */
export function flowchartToText(title: string, doc: FlowchartDocument, t: Translate): string {
  const lines = mapRows(doc).map(({ node, depth, via }) => {
    const meta = mapMeta(t, doc, node);
    const head = `${'  '.repeat(depth)}${via ? `${viaLabel(t, via)}: ` : ''}${typeLabel(t, node.data.type)}: ${node.data.label}${meta && meta !== typeLabel(t, node.data.type) ? ` (${meta})` : ''}`;
    const description = node.data.description?.trim();
    return description ? `${head}\n${'  '.repeat(depth + 1)}${description}` : head;
  });
  return [title, '', ...lines].join('\n');
}
