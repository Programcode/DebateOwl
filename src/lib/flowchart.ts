// src/lib/flowchart.ts
import { MarkerType, type Edge, type Node } from 'reactflow';
import type { TFunction } from 'i18next';
import i18n from '@/i18n';
import { APP_LANGUAGES, type AppLanguage } from '@/lib/languages';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import { readCase } from '@debatelab/core/ai/case-view';
import type { FlowchartData } from '@/lib/stores/session-store';

export type NodeType = 'thesis' | 'contention' | 'attack' | 'rebuttal' | 'dropped';
export type EdgeKind = 'support' | 'attack' | 'rebuttal';

export interface FlowNodeData {
    label: string;
    description?: string;
    type: NodeType;
    strength?: 'strong' | 'moderate' | 'weak';
    /**
     * Text the app wrote rather than the student, such as the starter nodes. It is
     * kept as a translation key and shown in the current language; `label` and
     * `description` hold the text in the language it was created in, as a fallback.
     * Null marks the student's own text, which is never translated. Absent means a
     * chart saved before this was recorded.
     */
    labelKey?: string | null;
    labelNumber?: number;
    descriptionKey?: string | null;
}

// Only these keys are ever translated, so a saved chart cannot name arbitrary catalog text.
const APP_TEXT_KEYS = new Set([
    'flowchart.starter.thesisLabel',
    'flowchart.starter.thesisDesc',
    'flowchart.starter.argument1Label',
    'flowchart.starter.argument1Desc',
    'flowchart.starter.argument2Label',
    'flowchart.starter.argument2Desc',
    'flowchart.starter.argument3Label',
    'flowchart.starter.argument3Desc',
    'flowchart.starter.opponentAttackLabel',
    'flowchart.starter.opponentAttackDesc',
    'flowchart.starter.rebuttalLabel',
    'flowchart.starter.rebuttalDesc',
    'flowchart.fromCase.thesis',
    'flowchart.fromCase.argument',
    'flowchart.fromCase.attack',
    'flowchart.fromCase.rebuttal',
]);

type AppText = { key: string; n?: number };

// Charts saved before nodes recorded their keys hold the starter text in the language
// they were made in, and Generate's old import wrote English titles such as "Argument 2".
let starterTexts: Map<string, string> | undefined;
const OLD_IMPORT_TITLE = /^(Argument|Attack|Rebuttal) (\d+)$/;
function savedAppText(text: string | undefined, titles: boolean): AppText | undefined {
    if (!text) return undefined;
    if (!starterTexts) {
        starterTexts = new Map();
        for (const language of Object.keys(APP_LANGUAGES) as AppLanguage[]) {
            const fixed = i18n.getFixedT(language);
            for (const key of APP_TEXT_KEYS) if (key.startsWith('flowchart.starter.')) starterTexts.set(String(fixed(key)), key);
        }
    }
    const starter = starterTexts.get(text);
    if (starter) return { key: starter };
    if (!titles) return undefined;
    if (text === 'Thesis') return { key: 'flowchart.fromCase.thesis' };
    const numbered = OLD_IMPORT_TITLE.exec(text);
    return numbered ? { key: `flowchart.fromCase.${numbered[1].toLowerCase()}`, n: Number(numbered[2]) } : undefined;
}

// A key counts only while the stored text is still that key's text in some language:
// an app version that predates keys edits the text and leaves the key behind.
function keptAppText(key: string | null, n: number | undefined, text: string | undefined): AppText | undefined {
    if (!key || !APP_TEXT_KEYS.has(key)) return undefined;
    const languages = Object.keys(APP_LANGUAGES) as AppLanguage[];
    return languages.some((language) => String(i18n.getFixedT(language)(key, { n })) === text) ? { key, n } : undefined;
}

function labelText(data: FlowNodeData): AppText | undefined {
    if (data.labelKey === undefined) return savedAppText(data.label, true);
    return keptAppText(data.labelKey, data.labelNumber, data.label);
}

function descriptionText(data: FlowNodeData): AppText | undefined {
    if (data.descriptionKey === undefined) return savedAppText(data.description, false);
    return keptAppText(data.descriptionKey, undefined, data.description);
}

/** A node the student wrote: its text stays as typed in every language. */
export const studentNodeData = (data: Omit<FlowNodeData, 'labelKey' | 'labelNumber' | 'descriptionKey'>): FlowNodeData =>
    ({ ...data, labelKey: null, descriptionKey: null });

const translate = (text: AppText | undefined, t: TFunction): string | undefined =>
    text ? String(t(text.key, { n: text.n })) : undefined;

export const nodeLabel = (data: FlowNodeData, t: TFunction): string =>
    translate(labelText(data), t) ?? data.label;

export const nodeDescription = (data: FlowNodeData, t: TFunction): string =>
    translate(descriptionText(data), t) ?? data.description ?? '';

/** Applies an edit; app text the student left unchanged stays app text. */
export function editNodeData(data: FlowNodeData, edit: Omit<FlowNodeData, 'labelKey' | 'labelNumber' | 'descriptionKey'>, t: TFunction): FlowNodeData {
    const label = edit.label === nodeLabel(data, t) ? labelText(data) : undefined;
    const description = (edit.description ?? '') === nodeDescription(data, t) ? descriptionText(data) : undefined;
    return {
        ...studentNodeData(edit),
        ...(label ? { labelKey: label.key, ...(label.n !== undefined ? { labelNumber: label.n } : {}), label: data.label } : {}),
        ...(description ? { descriptionKey: description.key, description: data.description } : {}),
    };
}

const EDGE_LABEL_KEYS: Record<EdgeKind, string> = {
    support: 'flowchart.edgeSupport',
    attack: 'flowchart.edgeAttack',
    rebuttal: 'flowchart.edgeRebuttal',
};

// Charts saved before edges recorded their kind carry these English labels.
const LEGACY_EDGE_LABELS: Record<string, EdgeKind> = { Support: 'support', Attack: 'attack', Rebuttal: 'rebuttal' };

/** An edge's label in the current language, from its kind. */
export function edgeLabel(edge: Edge, t: TFunction): Edge['label'] {
    const kind: EdgeKind | undefined = (edge.data as { kind?: EdgeKind } | undefined)?.kind
        ?? (typeof edge.label === 'string' ? LEGACY_EDGE_LABELS[edge.label] : undefined);
    return kind && kind in EDGE_LABEL_KEYS ? String(t(EDGE_LABEL_KEYS[kind])) : edge.label;
}

const EDGE_STYLES: Record<EdgeKind, { stroke: string; dash?: string }> = {
    support: { stroke: '#10b981' },
    attack: { stroke: '#ef4444' },
    // Rebuttals are dashed so they read apart from support without motion.
    rebuttal: { stroke: '#3b82f6', dash: '6 4' },
};

export function edgeOfKind(kind: EdgeKind, source: string, target: string, t: TFunction): Edge {
    const style = EDGE_STYLES[kind];
    return {
        id: `e-${source}-${target}`,
        source,
        target,
        label: String(t(EDGE_LABEL_KEYS[kind])),
        data: { kind },
        style: { stroke: style.stroke, strokeWidth: 2, ...(style.dash ? { strokeDasharray: style.dash } : {}) },
        markerEnd: { type: MarkerType.ArrowClosed },
    };
}

function appNode(id: string, x: number, y: number, type: NodeType, t: TFunction, text: {
    labelKey: string; labelNumber?: number; descriptionKey?: string; description?: string; strength?: FlowNodeData['strength'];
}): Node<FlowNodeData> {
    return {
        id,
        type: 'custom',
        position: { x, y },
        data: {
            type,
            label: String(t(text.labelKey, { n: text.labelNumber })),
            labelKey: text.labelKey,
            ...(text.labelNumber !== undefined ? { labelNumber: text.labelNumber } : {}),
            description: text.descriptionKey ? String(t(text.descriptionKey)) : text.description,
            // The case's own text is the student's, not the app's.
            descriptionKey: text.descriptionKey ?? null,
            ...(text.strength ? { strength: text.strength } : {}),
        },
    };
}

/** The blank-start template. */
export function starterFlowchart(t: TFunction): FlowchartData {
    const starter = (name: string) => ({ labelKey: `flowchart.starter.${name}Label`, descriptionKey: `flowchart.starter.${name}Desc` });
    return {
        nodes: [
            appNode('thesis', 400, 50, 'thesis', t, starter('thesis')),
            appNode('c1', 150, 200, 'contention', t, { ...starter('argument1'), strength: 'strong' }),
            appNode('c2', 400, 200, 'contention', t, { ...starter('argument2'), strength: 'moderate' }),
            appNode('c3', 650, 200, 'contention', t, { ...starter('argument3'), strength: 'weak' }),
            appNode('a1', 150, 350, 'attack', t, starter('opponentAttack')),
            appNode('r1', 150, 500, 'rebuttal', t, starter('rebuttal')),
        ],
        edges: [
            { id: 'e-thesis-c1', source: 'thesis', target: 'c1', markerEnd: { type: MarkerType.ArrowClosed } },
            { id: 'e-thesis-c2', source: 'thesis', target: 'c2', markerEnd: { type: MarkerType.ArrowClosed } },
            { id: 'e-thesis-c3', source: 'thesis', target: 'c3', markerEnd: { type: MarkerType.ArrowClosed } },
            { id: 'e-c1-a1', source: 'c1', target: 'a1', style: { stroke: EDGE_STYLES.attack.stroke }, markerEnd: { type: MarkerType.ArrowClosed } },
            { id: 'e-a1-r1', source: 'a1', target: 'r1', style: { stroke: EDGE_STYLES.rebuttal.stroke, strokeDasharray: EDGE_STYLES.rebuttal.dash }, markerEnd: { type: MarkerType.ArrowClosed } },
        ],
    };
}

/** A generated case has what a flowchart needs: a thesis and an argument, R2's backed-up arguments, or a Conclusor's reasons why we win. */
export const caseHasFlowchart = (result: GenerateOutput | null | undefined): result is GenerateOutput =>
    Boolean(result?.caseStructure?.thesis && (result.contentions?.length || result.reinforce?.length || result.whyWeWin?.length));

const NODE_GAP_X = 300;
const ROW_GAP_Y = 150;
const PER_ROW = 4;

// Each tier wraps into rows of four, so a large case still fits a phone at a readable zoom.
function placeTier(count: number, top: number) {
    const centerX = 400;
    const position = (i: number) => {
        const row = Math.floor(i / PER_ROW);
        const inRow = Math.min(PER_ROW, count - row * PER_ROW);
        return { x: centerX + ((i % PER_ROW) - (inRow - 1) / 2) * NODE_GAP_X, y: top + row * ROW_GAP_Y };
    };
    return { position, bottom: top + Math.max(1, Math.ceil(count / PER_ROW)) * ROW_GAP_Y + 50 };
}

const words = (text: string) => new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? []);

/**
 * The predicted argument a counter answers: the one its target quotes, else the one
 * sharing the most words with it, else the argument at the same position.
 */
function answeredAttack(target: string | undefined, attacks: string[], index: number): number {
    const wanted = target?.trim().toLowerCase() ?? '';
    const candidates = attacks.map((argument, i) => ({ i, text: argument.trim().toLowerCase() })).filter(({ text }) => text);
    if (wanted) {
        const exact = candidates.find(({ text }) => text === wanted)
            ?? candidates.find(({ text }) => wanted.length >= 12 && (text.includes(wanted) || (text.length >= 12 && wanted.includes(text))));
        if (exact) return exact.i;
        const targetWords = words(wanted);
        // Two shared words, so one filler word such as "their" decides nothing.
        let best = { i: -1, shared: 1 };
        for (const { i, text } of candidates) {
            const shared = [...words(text)].filter((word) => targetWords.has(word)).length;
            if (shared > best.shared) best = { i, shared };
        }
        if (best.i >= 0) return best.i;
    }
    return attacks[index]?.trim() ? index : -1;
}

/**
 * Maps a generated case onto the canvas: the thesis, one node per argument with
 * its title, point and evidence (R2's backed-up arguments or a Conclusor's
 * reasons why we win stand in for arguments), what the other side will say, and our answers.
 */
export function flowchartFromCase(result: GenerateOutput, t: TFunction): FlowchartData {
    const nodes: Node<FlowNodeData>[] = [];
    const edges: Edge[] = [];
    const view = readCase(result);

    nodes.push(appNode('thesis', 400, 50, 'thesis', t, { labelKey: 'flowchart.fromCase.thesis', description: result.caseStructure.thesis }));

    const points = view.arguments.length
        ? view.arguments.map((argument) => [argument.title, argument.point, argument.evidence].filter(Boolean).join('\n'))
        : view.reinforce.length
            ? view.reinforce.map((item) => [item.argument, item.text].filter(Boolean).join('\n'))
            : view.whyWeWin;
    const contentionTier = placeTier(points.length, 230);
    points.forEach((description, i) => {
        const id = `c-${i}`;
        const { x, y } = contentionTier.position(i);
        nodes.push(appNode(id, x, y, 'contention', t, {
            labelKey: 'flowchart.fromCase.argument',
            labelNumber: i + 1,
            description,
            strength: 'strong',
        }));
        edges.push({ id: `e-thesis-${id}`, source: 'thesis', target: id, markerEnd: { type: MarkerType.ArrowClosed } });
    });

    // Older cases listed the opposing arguments; newer ones name each in "If they say…".
    const listed = (result.predictedOpponentCase?.likelyArguments ?? []).filter((argument) => argument?.trim());
    const attacks = listed.length ? listed : view.ifTheySay.map((answer) => answer.theySay).filter(Boolean);
    const attackTier = placeTier(attacks.length, contentionTier.bottom);
    attacks.forEach((argument, i) => {
        const id = `a-${i}`;
        const { x, y } = attackTier.position(i);
        nodes.push(appNode(id, x, y, 'attack', t, {
            labelKey: 'flowchart.fromCase.attack',
            labelNumber: i + 1,
            description: argument,
        }));
        edges.push(edgeOfKind('attack', points.length ? `c-${i % points.length}` : 'thesis', id, t));
    });

    // An answer replies to one of their arguments, so it hangs off that attack.
    const answers = view.ifTheySay;
    const counterTier = placeTier(answers.length, attackTier.bottom);
    answers.forEach((answer, i) => {
        const id = `r-${i}`;
        const attackIndex = answeredAttack(answer.theySay, attacks, i);
        const { x, y } = counterTier.position(i);
        nodes.push(appNode(id, x, y, 'rebuttal', t, {
            labelKey: 'flowchart.fromCase.rebuttal',
            labelNumber: i + 1,
            description: answer.inRound ?? answer.weAnswer,
        }));
        edges.push(edgeOfKind('rebuttal', attackIndex >= 0 ? `a-${attackIndex}` : 'thesis', id, t));
    });

    return { nodes, edges };
}
