import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  clearCallbackError: vi.fn(),
  auth: { user: null as { id: string } | null, callbackError: null as string | null },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({
    user: mocks.auth.user,
    loading: false,
    callbackError: mocks.auth.callbackError,
    clearCallbackError: mocks.clearCallbackError,
  }),
}));

function renderCallback() {
  render(
    <MemoryRouter initialEntries={['/auth/callback?code=c1&sb_flow_id=0123456789abcdef&next=%2Fapp%2Fhistory']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/app/history" element={<div>history</div>} />
        <Route path="/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('sign-in callback page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('still says the link failed when this browser keeps another session', () => {
    mocks.auth = { user: { id: 'stored-user' }, callbackError: 'other-browser' };
    renderCallback();

    expect(screen.getByText('history')).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'This sign-in link only works in the browser where you asked for it. Send a new code here.',
      variant: 'destructive',
    }));
    expect(mocks.clearCallbackError).toHaveBeenCalled();
  });

  it('stays on the callback after a timeout so a reload can retry the unused code', () => {
    mocks.auth = { user: null, callbackError: 'timed-out' };
    renderCallback();

    expect(screen.queryByText('login')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Signing in is taking longer than it should. Try again.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign-in' })).toHaveAttribute('href', '/login');
  });

  it('keeps the retry after a timeout even when this browser has another session', () => {
    mocks.auth = { user: { id: 'stored-user' }, callbackError: 'timed-out' };
    renderCallback();

    expect(screen.queryByText('history')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
