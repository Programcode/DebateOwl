import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthApiError } from '@supabase/supabase-js';
import LoginPage from '@/pages/LoginPage';

const auth = vi.hoisted(() => ({
  signInWithEmailOtp: vi.fn(async () => undefined),
  verifyEmailOtp: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({
    user: null as null,
    signInWithGoogle: vi.fn(),
    signInWithEmailOtp: auth.signInWithEmailOtp,
    verifyEmailOtp: auth.verifyEmailOtp,
    signInWithDemoCode: vi.fn(),
  }),
}));

// Each test sends to the same address; a stored resend cooldown would skip the send.
beforeEach(() => sessionStorage.clear());

async function requestCode() {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
  return await screen.findByLabelText('Verification code');
}

describe('email code entry', () => {
  it('keeps only digits and enables Verify at exactly six', async () => {
    const input = await requestCode();
    const verify = screen.getByRole('button', { name: 'Verify code' });

    fireEvent.change(input, { target: { value: '12ab' } });
    expect(input).toHaveValue('12');
    expect(verify).toBeDisabled();

    fireEvent.change(input, { target: { value: '12345' } });
    expect(verify).toBeDisabled();

    // A pasted code with a space still fills all six digits.
    fireEvent.change(input, { target: { value: '123 4567' } });
    expect(input).toHaveValue('123456');
    expect(verify).toBeEnabled();

    fireEvent.click(verify);
    await waitFor(() => expect(auth.verifyEmailOtp).toHaveBeenCalledWith('student@example.com', '123456'));
  });

  it('says a refused code may be wrong, not only expired', async () => {
    auth.verifyEmailOtp.mockRejectedValueOnce(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'));
    const input = await requestCode();

    fireEvent.change(input, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code is wrong or has expired. Check it or send a new one.');
  });
});
