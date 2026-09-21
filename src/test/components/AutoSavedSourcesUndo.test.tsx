import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockToastError, mockToastSuccess, mockToastWarning, mockRemoveSource } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastWarning: vi.fn(),
  mockRemoveSource: vi.fn(),
}));

const sessionState = {
  sourceLibrary: [
    { id: 'source-1', folder: 'Auto-saved' },
    { id: 'source-2', folder: 'Auto-saved', metadata: { capturedVia: 'attack' } },
    { id: 'source-3', folder: 'Curated', metadata: { capturedVia: 'generate' } },
  ],
};

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
    warning: mockToastWarning,
  },
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (state: typeof sessionState & { removeSource: typeof mockRemoveSource }) => unknown) => selector({
    ...sessionState,
    removeSource: mockRemoveSource,
  }),
}));

import { AutoSavedSourcesUndo } from '@/components/features/AutoSavedSourcesUndo';

describe('AutoSavedSourcesUndo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveSource.mockRejectedValue(new Error('Removal failed'));
  });

  it('reports zero removed sources and all failed sources when every removal fails', async () => {
    render(<AutoSavedSourcesUndo />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo auto-saved sources' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Could not remove auto-saved sources.', {
        description: '0 sources were removed. 2 sources could not be removed.',
      });
    });
  });

  it('preserves the success outcome when every removal succeeds', async () => {
    mockRemoveSource.mockResolvedValue(undefined);
    render(<AutoSavedSourcesUndo />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo auto-saved sources' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Auto-saved sources removed', {
        description: '2 auto-saved source removed from your library.',
      });
    });
  });

  it('preserves the partial outcome when only some removals fail', async () => {
    mockRemoveSource
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Removal failed'));
    render(<AutoSavedSourcesUndo />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo auto-saved sources' }));

    await waitFor(() => {
      expect(mockToastWarning).toHaveBeenCalledWith('Some sources removed', {
        description: '1 removed, 1 failed to remove.',
      });
    });
  });
});
