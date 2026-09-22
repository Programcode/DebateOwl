import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import FlowchartPage from '@/pages/FlowchartPage';
import i18n from '@/i18n';

const { mockSavedFlowcharts, mockToastSuccess } = vi.hoisted(() => ({
  mockSavedFlowcharts: [] as Array<{
    id: string;
    title: string;
    createdAt: number;
    data: { nodes: unknown[]; edges: unknown[] };
  }>,
  mockToastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: vi.fn() },
}));

vi.mock('html-to-image', () => ({ toPng: vi.fn() }));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: () => ({
    pendingFlowchartData: null as null,
    setPendingFlowchartData: vi.fn(),
    saveFlowchart: vi.fn(),
    savedFlowcharts: mockSavedFlowcharts,
    deleteSavedFlowchart: vi.fn(),
  }),
}));

vi.mock('reactflow', async () => {
  const React = await import('react');
  return {
    default: ({ nodes, onNodeClick }: {
      nodes: Array<{ id: string; data: { label: string; description?: string } }>;
      onNodeClick: (event: React.MouseEvent, node: { id: string }) => void;
    }) => <div>{nodes.map((node) => (
      <button key={node.id} onClick={(event) => onNodeClick(event, node)}>
        {node.data.label}{node.data.description && <span aria-hidden="true">{node.data.description}</span>}
      </button>
    ))}</div>,
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, vi.fn()];
    },
    addEdge: vi.fn(),
    Controls: (): null => null,
    Background: (): null => null,
    MiniMap: (): null => null,
    Handle: (): null => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    BackgroundVariant: { Dots: 'dots' },
  };
});

beforeEach(async () => {
  mockSavedFlowcharts.length = 0;
  mockToastSuccess.mockClear();
  vi.useRealTimers();
  await i18n.changeLanguage('en');
});

const renderPage = () => render(<MemoryRouter><FlowchartPage /></MemoryRouter>);

test('keeps a selected node when deletion is cancelled', () => {
  renderPage();

  fireEvent.click(screen.getByRole('button', { name: 'Argument 1' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

  expect(screen.getByRole('alertdialog', { name: 'Delete node?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Argument 1' })).toBeInTheDocument();
  expect(mockToastSuccess).not.toHaveBeenCalled();
});

test('deletes a selected node only after confirmation and reports success', () => {
  renderPage();

  fireEvent.click(screen.getByRole('button', { name: 'Argument 1' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));

  expect(screen.queryByRole('button', { name: 'Argument 1' })).not.toBeInTheDocument();
  expect(mockToastSuccess).toHaveBeenCalledWith('Node deleted');
});

test('clears a stale node selection when a saved flowchart is loaded', () => {
  mockSavedFlowcharts.push({
    id: 'saved-1',
    title: 'Loaded chart',
    createdAt: Date.now(),
    data: {
      nodes: [{
        id: 'loaded-node',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { label: 'Loaded argument', type: 'contention' },
      }],
      edges: [],
    },
  });
  renderPage();

  fireEvent.click(screen.getByRole('button', { name: 'Argument 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  fireEvent.click(screen.getByRole('button', { name: /Loaded chart/ }));

  expect(screen.getByRole('button', { name: 'Loaded argument' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
});

test('formats saved-flowchart relative time in Hungarian', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 19, 13, 45));
  await i18n.changeLanguage('hu');
  mockSavedFlowcharts.push({
    id: 'saved-hu',
    title: 'Mentett ábra',
    createdAt: new Date(2026, 4, 19, 12, 45).getTime(),
    data: { nodes: [], edges: [] },
  });

  renderPage();

  fireEvent.click(screen.getByRole('button', { name: 'Betöltés' }));
  expect(screen.getByText('körülbelül 1 órával ezelőtt')).toBeInTheDocument();
});

test('localizes starter flowchart nodes in Hungarian', async () => {
  await i18n.changeLanguage('hu');
  renderPage();

  expect(screen.getByRole('button', { name: '1. érv' })).toBeInTheDocument();
  expect(screen.getByText('Az első érved')).toBeInTheDocument();
  expect(screen.getByText('Így válaszolhatnak')).toBeInTheDocument();
  expect(screen.getByText('Így válaszolsz a támadásukra')).toBeInTheDocument();
});
