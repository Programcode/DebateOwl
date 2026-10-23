import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { routeLoaders } from '@/lib/route-modules';
import { edgeLabel, editNodeData, flowchartFromCase, nodeDescription, nodeLabel, starterFlowchart, studentNodeData, type FlowNodeData } from '@/lib/flowchart';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

const en = i18n.getFixedT('en');
const hu = i18n.getFixedT('hu');

describe('flowchart app text', () => {
    // The page's route loader fetches every language, as the app does before rendering it.
    beforeAll(async () => { await routeLoaders['/app/flowchart'](); });

    it('shows starter nodes in the current language, not the one they were created in', () => {
        const thesis = starterFlowchart(en).nodes[0].data;
        expect(thesis.label).toBe('Your Thesis');
        expect(nodeLabel(thesis, hu)).toBe('A tézised');
        expect(nodeDescription(thesis, hu)).toBe('Kattints a szerkesztéshez vagy új csomópont hozzáadásához');
    });

    it('keeps app text that an edit left alone, and drops it once the student rewrites it', () => {
        const argument = starterFlowchart(hu).nodes[1].data;
        const unchanged = editNodeData(argument, { label: nodeLabel(argument, hu), description: 'Saját leírás', type: 'contention' }, hu);
        expect(nodeLabel(unchanged, en)).toBe('Argument 1');
        expect(nodeDescription(unchanged, en)).toBe('Saját leírás');

        const rewritten = editNodeData(argument, { label: 'Az iskolák pénzt spórolnak', type: 'contention' }, hu);
        expect(rewritten.labelKey).toBeNull();
        expect(nodeLabel(rewritten, en)).toBe('Az iskolák pénzt spórolnak');
    });

    it('translates starter text in charts saved before nodes kept their keys, but never a student\'s own text', () => {
        expect(nodeLabel({ label: 'Your Thesis', description: 'Your first argument', type: 'thesis' }, hu)).toBe('A tézised');
        expect(nodeDescription({ label: 'x', description: 'Your first argument', type: 'contention' }, hu)).toBe('Az első érved');
        expect(nodeLabel({ label: 'Argument 2', type: 'contention' }, hu)).toBe('2. érv');
        expect(nodeLabel({ label: 'Cars pollute', type: 'contention' }, hu)).toBe('Cars pollute');
        const forged: FlowNodeData = { label: 'kept', labelKey: 'auth.signIn', type: 'thesis' };
        expect(nodeLabel(forged, hu)).toBe('kept');
        // A node the student writes now keeps its text, even when it reads like a starter title.
        const own = studentNodeData({ label: 'Argument 2', description: 'Your first argument', type: 'contention' });
        expect(nodeLabel(own, hu)).toBe('Argument 2');
        expect(nodeDescription(own, hu)).toBe('Your first argument');
        expect(nodeLabel(editNodeData(own, { label: 'Argument 2', type: 'contention' }, hu), hu)).toBe('Argument 2');
        // An app version without keys edits the text and keeps the key; the edit wins.
        const staleEdit = { ...starterFlowchart(en).nodes[0].data, label: 'Ban cars downtown' };
        expect(nodeLabel(staleEdit, hu)).toBe('Ban cars downtown');
    });

    it('labels edges in the current language, including charts saved with English labels', () => {
        expect(edgeLabel({ id: 'a', source: 'x', target: 'y', label: 'Attack' }, hu)).toBe('Támadás');
        expect(edgeLabel({ id: 'b', source: 'x', target: 'y', label: 'Támogatás', data: { kind: 'support' } }, en)).toBe('Support');
        expect(edgeLabel({ id: 'c', source: 'x', target: 'y', label: 'custom' }, hu)).toBe('custom');
    });
});

describe('flowchartFromCase', () => {
    const result = {
        caseStructure: { thesis: 'Cities should ban cars downtown', framework: '', keyDefinitions: [], burdenOfProof: '' },
        contentions: [
            { id: '1', claim: 'Air quality improves', reasoning: '', evidence: 'NO2 fell 30% in Oslo', needsSource: false, impact: '' },
            { id: '2', claim: 'Shops lose trade', reasoning: '', evidence: '', needsSource: false, impact: '' },
        ],
        predictedOpponentCase: { likelyArguments: ['Deliveries get harder', 'Disabled residents lose access'], strategicWeaknesses: [], keyClashes: [] },
        counters: [
            { targetArgument: 'Deliveries get harder', counterpoint: '', rebuttal: 'Night delivery windows' },
            { targetArgument: 'Nothing they said', counterpoint: 'Footfall rose in pedestrian zones', rebuttal: '' },
        ],
        metadata: { side: 'pro', format: 'custom', generatedAt: '2026-10-22T00:00:00Z' },
    } as unknown as GenerateOutput;

    it('maps the thesis, contentions with their evidence, attacks, and counters to the attack they answer', () => {
        const { nodes, edges } = flowchartFromCase(result, en);
        expect(nodes.map((node) => [node.id, node.data.type, nodeLabel(node.data, hu), node.data.description])).toEqual([
            ['thesis', 'thesis', 'Tézis', 'Cities should ban cars downtown'],
            ['c-0', 'contention', '1. érv', 'Air quality improves\nNO2 fell 30% in Oslo'],
            ['c-1', 'contention', '2. érv', 'Shops lose trade'],
            ['a-0', 'attack', '1. támadás', 'Deliveries get harder'],
            ['a-1', 'attack', '2. támadás', 'Disabled residents lose access'],
            ['r-0', 'rebuttal', '1. cáfolat', 'Night delivery windows'],
            ['r-1', 'rebuttal', '2. cáfolat', 'Footfall rose in pedestrian zones'],
        ]);
        // r-0 quotes its attack; r-1 names none, so it answers the attack in the same position.
        expect(edges.map((edge) => `${edge.source}>${edge.target}`)).toEqual(['thesis>c-0', 'thesis>c-1', 'c-0>a-0', 'c-1>a-1', 'a-0>r-0', 'a-1>r-1']);
    });

    it('matches a paraphrased target by shared words, and keeps a large case narrow', () => {
        const attacks = Array.from({ length: 8 }, (_, i) => `Opponent point ${i}`);
        attacks[5] = 'The lost farebox revenue has to come from somewhere';
        const big = {
            ...result,
            contentions: Array.from({ length: 5 }, (_, i) => ({ ...result.contentions[0], id: String(i) })),
            predictedOpponentCase: { ...result.predictedOpponentCase, likelyArguments: attacks },
            counters: [{ targetArgument: 'Farebox revenue gap', counterpoint: '', rebuttal: 'Congestion charges fund it' }],
        } as GenerateOutput;
        const { nodes, edges } = flowchartFromCase(big, en);
        expect(edges.find((edge) => edge.target === 'r-0')?.source).toBe('a-5');
        // One shared filler word is not a match; the counter falls back to its position.
        const filler = {
            ...big,
            predictedOpponentCase: { ...big.predictedOpponentCase, likelyArguments: ['Opponent point 0', 'Their budget'] },
            counters: [{ targetArgument: 'Their whole plan', counterpoint: '', rebuttal: 'x' }],
        } as GenerateOutput;
        expect(flowchartFromCase(filler, en).edges.find((edge) => edge.target === 'r-0')?.source).toBe('a-0');
        // Rows of four: no tier is wider than four nodes, and no two nodes share a spot.
        const xs = nodes.map((node) => node.position.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(900);
        expect(new Set(nodes.map((node) => `${node.position.x},${node.position.y}`)).size).toBe(nodes.length);
    });
});
