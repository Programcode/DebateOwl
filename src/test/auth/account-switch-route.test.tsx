import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

function App() {
  return (
    <MemoryRouter initialEntries={['/app/history']}>
      <Routes>
        <Route path="/login" element={<><LoginPage /><Where /></>} />
        <Route element={<RequireAuth><Where /></RequireAuth>}>
          <Route path="/app" element={null} />
          <Route path="/app/history" element={null} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

// Signs in as `first` on /app/history, signs out, then signs in as `second` in the same tab.
async function switchAccounts(first: string, second: string) {
  auth.user = { id: first };
  const view = render(<App />);
  expect(screen.getByTestId('where')).toHaveTextContent('/app/history');

  auth.user = null;
  view.rerender(<App />);
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));

  auth.user = { id: second };
  view.rerender(<App />);
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
});
