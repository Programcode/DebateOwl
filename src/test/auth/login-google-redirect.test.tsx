import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import { restoreFromBackForwardCache } from '@/test/helpers/page-lifecycle';

const auth = vi.hoisted(() => ({
  // Resolves once location.assign has been called, like the real one.
  signInWithGoogle: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({
    user: null as null,
    signInWithGoogle: auth.signInWithGoogle,
    signInWithEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInWithDemoCode: vi.fn(),
  }),
}));

// AUTH-15: Back from Google's account chooser restored /login from the
// back/forward cache with the button stuck on "Redirecting...".
describe('Continue with Google', () => {
  it('works again after Back from Google restores the page', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    const redirecting = await screen.findByRole('button', { name: 'Redirecting...' });
    expect(redirecting).toBeDisabled();
    fireEvent.click(redirecting);
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);

    restoreFromBackForwardCache();
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalledTimes(2));
  });
});
