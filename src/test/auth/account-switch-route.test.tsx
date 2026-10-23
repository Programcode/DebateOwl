import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { markSignOutIntent } from '@/lib/supabase/sign-out-intent';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RequireAuth } from '@/components/auth/RequireAuth';
import LoginPage from '@/pages/LoginPage';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({
    user: auth.user,
    loading: false,
    callbackError: null as null,
    clearCallbackError: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInWithDemoCode: vi.fn(),
  }),
}));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function App({ start = '/app/history' }: { start?: string }) {
  return (
    <TooltipProvider>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route path="/login" element={<><LoginPage /><Where /></>} />
          <Route element={<RequireAuth><Where /></RequireAuth>}>
            <Route path="/app" element={null} />
            <Route path="/app/history" element={null} />
            <Route path="/app/settings" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TooltipProvider>
  );
}

// Signs in as `first` on `start`, signs out, then signs in as `second` in the same tab.
// `onPurpose` is Settings > Sign out; otherwise the session ended by itself.
async function switchAccounts(first: string, second: string, { start = '/app/history', onPurpose = false } = {}) {
  auth.user = { id: first };
  const view = render(<App start={start} />);
  expect(screen.getByTestId('where')).toHaveTextContent(start);

  if (onPurpose) markSignOutIntent();
  auth.user = null;
  view.rerender(<App start={start} />);
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));

  auth.user = { id: second };
  view.rerender(<App start={start} />);
  await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('/login'));
  return screen.getByTestId('where').textContent;
}

describe('where a sign-in lands after a sign-out in the same tab', () => {
  it('opens /app for a different account, not the page the previous account had open', async () => {
    expect(await switchAccounts('student-a', 'student-b')).toBe('/app');
  });

  it('returns the same account to the page it left', async () => {
    expect(await switchAccounts('student-a', 'student-a')).toBe('/app/history');
  });

  // QA round 3: Sign out lives on Settings, so the next sign-in opened Settings.
  it('opens /app after Sign out on Settings, even for the same account', async () => {
    expect(await switchAccounts('student-a', 'student-a', { start: '/app/settings', onPurpose: true })).toBe('/app');
  });

  it('keeps Settings when the session ended by itself there', async () => {
    expect(await switchAccounts('student-a', 'student-a', { start: '/app/settings' })).toBe('/app/settings');
  });

  it('still returns a signed-out deep link to its page after a deliberate sign-out', async () => {
    await switchAccounts('student-a', 'student-a', { start: '/app/settings', onPurpose: true });
    cleanup();
    // A fresh visit to a deep link while signed out, in the same tab.
    auth.user = null;
    const view = render(<App start="/app/history" />);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
    auth.user = { id: 'student-a' };
    view.rerender(<App start="/app/history" />);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/history'));
  });
});
