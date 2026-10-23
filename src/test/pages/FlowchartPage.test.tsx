import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { applyAppLanguage } from '@/i18n';
import { routeLoaders } from '@/lib/route-modules';
import FlowchartPage from '@/pages/FlowchartPage';
import { useSessionStore } from '@/lib/stores/session-store';
import { useDebateStore } from '@/lib/stores/debate-store';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/app/flowchart']}>
            <FlowchartPage />
        </MemoryRouter>,
    );
}

// Rendered as the route does: its loader fetches every language first.
beforeAll(async () => { await routeLoaders['/app/flowchart'](); });

afterEach(async () => {
    await act(() => applyAppLanguage('en'));
    useSessionStore.setState({ generateResult: null, generateResultDebateId: undefined });
    useDebateStore.setState({ currentDebateId: null, oneOff: false });
});

describe('FlowchartPage', () => {
    it('shows the starter nodes in the language the student switches to', async () => {
        renderPage();
        expect(screen.getByText('Your Thesis')).toBeInTheDocument();
        await act(() => applyAppLanguage('hu'));
        expect(screen.getByText('A tézised')).toBeInTheDocument();
        expect(screen.getByText('1. érv')).toBeInTheDocument();
        expect(screen.queryByText('Your Thesis')).not.toBeInTheDocument();
    });

    it('says inline that a node needs a label and a saved chart needs a title', async () => {
        renderPage();
        await act(() => applyAppLanguage('hu'));

        fireEvent.click(screen.getByRole('button', { name: 'Csomópont hozzáadása' }));
        const nodeDialog = screen.getByRole('dialog');
        fireEvent.click(within(nodeDialog).getByRole('button', { name: 'Csomópont hozzáadása' }));
        expect(within(nodeDialog).getByRole('alert')).toHaveTextContent('Adj meg egy címkét.');
        const label = within(nodeDialog).getByRole('textbox', { name: 'Címke' });
        expect(label).toHaveFocus();
        expect(label).toHaveAttribute('aria-invalid', 'true');
        fireEvent.change(label, { target: { value: 'Új érv' } });
        expect(within(nodeDialog).queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.keyDown(nodeDialog, { key: 'Escape' });

        fireEvent.click(screen.getByRole('button', { name: 'Mentés' }));
        const saveDialog = screen.getByRole('dialog');
        fireEvent.click(within(saveDialog).getByRole('button', { name: 'Folyamatábra mentése' }));
        expect(within(saveDialog).getByRole('alert')).toHaveTextContent('Adj meg egy címet.');
        expect(within(saveDialog).getByRole('textbox', { name: 'Cím' })).toHaveFocus();
    });

    it('puts the template back when the student switches away from the debate whose case built the chart', async () => {
        const thesis = 'Debate A thesis: cities should ban cars';
        useDebateStore.setState({ currentDebateId: 'debate-a', oneOff: false });
        useSessionStore.setState({
            generateResult: {
                caseStructure: { thesis, framework: '', keyDefinitions: [], burdenOfProof: '' },
                contentions: [{ id: '1', claim: 'Air quality improves', reasoning: '', evidence: '', needsSource: false, impact: '' }],
                predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
                counters: [],
            } as unknown as GenerateOutput,
            generateResultDebateId: 'debate-a',
        });
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Build from current case' }));
        expect(screen.getAllByText(thesis).length).toBeGreaterThan(0);

        await act(async () => useDebateStore.setState({ currentDebateId: 'debate-b' }));
        expect(screen.queryByText(thesis)).not.toBeInTheDocument();
        expect(screen.getByText('Your Thesis')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Build from current case' })).not.toBeInTheDocument();
    });

    it('also resets a chart imported from Generate when the debate changes', async () => {
        useDebateStore.setState({ currentDebateId: 'debate-a', oneOff: false });
        useSessionStore.setState({
            pendingFlowchartData: {
                nodes: [{ id: 'thesis', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Imported thesis', labelKey: null, type: 'thesis' } }],
                edges: [],
            },
        });
        renderPage();
        expect(screen.getByText('Imported thesis')).toBeInTheDocument();

        await act(async () => useDebateStore.setState({ currentDebateId: 'debate-b' }));
        expect(screen.queryByText('Imported thesis')).not.toBeInTheDocument();
        expect(screen.getByText('Your Thesis')).toBeInTheDocument();
    });
});
