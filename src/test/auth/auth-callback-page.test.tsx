import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

const mocks = vi.hoisted(() => ({ toast: vi.fn(), clearCallbackError: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'stored-user' },
    loading: false,
    callbackError: 'other-browser',
    clearCallbackError: mocks.clearCallbackError,
  }),
}));

describe('sign-in callback page', () => {
  it('still says the link failed when this browser keeps another session', () => {
    render(
      <MemoryRouter initialEntries={['/auth/callback?next=%2Fapp%2Fhistory']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/app/history" element={<div>history</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('history')).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'This sign-in link only works in the browser where you asked for it. Send a new code here.',
      variant: 'destructive',
    }));
    expect(mocks.clearCallbackError).toHaveBeenCalled();
  });
});
