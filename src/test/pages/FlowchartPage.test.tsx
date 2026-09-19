import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import FlowchartPage from '@/pages/FlowchartPage';

const { mockToastSuccess } = vi.hoisted(() => ({ mockToastSuccess: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: vi.fn() },
}));

vi.mock('html-to-image', () => ({ toPng: vi.fn() }));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: () => ({
    pendingFlowchartData: null as null,
    setPendingFlowchartData: vi.fn(),
    saveFlowchart: vi.fn(),
    savedFlowcharts: [] as [],
    deleteSavedFlowchart: vi.fn(),
  }),
}));

vi.mock('reactflow', async () => {
  const React = await import('react');
  return {
    default: ({ nodes, onNodeClick }: {
      nodes: Array<{ id: string; data: { label: string } }>;
      onNodeClick: (event: React.MouseEvent, node: { id: string }) => void;
    }) => <div>{nodes.map((node) => (
      <button key={node.id} onClick={(event) => onNodeClick(event, node)}>{node.data.label}</button>
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

beforeEach(() => mockToastSuccess.mockClear());

test('keeps a selected node when deletion is cancelled', () => {
  render(<FlowchartPage />);

  fireEvent.click(screen.getByRole('button', { name: 'Argument 1' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

  expect(screen.getByRole('alertdialog', { name: 'Delete node?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Argument 1' })).toBeInTheDocument();
  expect(mockToastSuccess).not.toHaveBeenCalled();
});

test('deletes a selected node only after confirmation and reports success', () => {
  render(<FlowchartPage />);

  fireEvent.click(screen.getByRole('button', { name: 'Argument 1' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));

  expect(screen.queryByRole('button', { name: 'Argument 1' })).not.toBeInTheDocument();
  expect(mockToastSuccess).toHaveBeenCalledWith('Node deleted');
});
