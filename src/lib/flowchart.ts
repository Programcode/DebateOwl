// src/lib/flowchart.ts
import { MarkerType, type Edge, type Node } from 'reactflow';
import type { TFunction } from 'i18next';
import i18n from '@/i18n';
import { APP_LANGUAGES, type AppLanguage } from '@/lib/languages';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import { caseHasFlowchart as coreCaseHasFlowchart, flowchartFromCase as coreFlowchartFromCase, flowEdgeOfKind } from '@debatelab/core/flowchart';
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
    return flowEdgeOfKind(kind, source, target, t) as Edge;
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

/** A generated case has what a flowchart needs: a thesis and at least one contention. */
export const caseHasFlowchart = (result: GenerateOutput | null | undefined): result is GenerateOutput => coreCaseHasFlowchart(result);

/**
 * Maps a generated case onto the canvas: the thesis, one node per contention with
 * its claim and evidence, the predicted opposing arguments, and the counters.
 * Shared with the iOS app (packages/core/src/flowchart.ts).
 */
export function flowchartFromCase(result: GenerateOutput, t: TFunction): FlowchartData {
    return coreFlowchartFromCase(result, t) as unknown as FlowchartData;
}
