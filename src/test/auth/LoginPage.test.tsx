import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoginAuthMock = {
  user: null;
  signInWithGoogle: ReturnType<typeof vi.fn>;
  signInWithEmailOtp: ReturnType<typeof vi.fn>;
  verifyEmailOtp: ReturnType<typeof vi.fn>;
  signInWithDemoCode: ReturnType<typeof vi.fn>;
};

const { authMock, toastMock } = vi.hoisted((): { authMock: LoginAuthMock; toastMock: ReturnType<typeof vi.fn> } => ({
  authMock: {
    user: null,
    signInWithGoogle: vi.fn(),
    signInWithEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInWithDemoCode: vi.fn(),
  },
  toastMock: vi.fn(),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => authMock,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

import LoginPage from '@/pages/LoginPage';

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage passwordless auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = null;
    authMock.signInWithEmailOtp.mockResolvedValue(undefined);
    authMock.verifyEmailOtp.mockResolvedValue(undefined);
    authMock.signInWithDemoCode.mockResolvedValue(undefined);
  });

  it('keeps Google as the primary sign-in action and offers email and demo code paths', () => {
    renderLogin();

    expect(screen.getByRole('button', { name: 'login.google' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Demo code' })).toBeInTheDocument();
  });

  it('sends an email OTP and moves focus to the verification code', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('tab', { name: 'Email' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() => {
      expect(authMock.signInWithEmailOtp).toHaveBeenCalledWith('student@example.com');
      expect(screen.getByRole('textbox', { name: 'Verification code' })).toHaveFocus();
    });
    expect(screen.getByText('Code sent')).toBeInTheDocument();
  });

  it('shows verifying and success states while checking an email OTP', async () => {
    let resolveVerification: (() => void) | undefined;
    authMock.verifyEmailOtp.mockReturnValue(new Promise<void>((resolve) => {
      resolveVerification = resolve;
    }));

    renderLogin();
    fireEvent.click(screen.getByRole('tab', { name: 'Email' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByText('Code sent');
    fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(screen.getByText('Verifying...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verifying...' })).toBeDisabled();

    resolveVerification?.();
    await waitFor(() => expect(screen.getByText('Signed in')).toBeInTheDocument());
  });

  it('rejects malformed OTPs and supports resending', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('tab', { name: 'Email' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByText('Code sent');

    fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid six-digit code.');
    expect(authMock.verifyEmailOtp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    await waitFor(() => expect(authMock.signInWithEmailOtp).toHaveBeenCalledTimes(2));
  });

  it('shows demo code errors and returns to an editable idle form', async () => {
    authMock.signInWithDemoCode.mockRejectedValue(new Error('This demo code has expired.'));

    renderLogin();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Demo code' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Demo code' })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Demo code' }), { target: { value: ' demo-ab12-cd34 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with demo code' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This demo code has expired.'));
    expect(authMock.signInWithDemoCode).toHaveBeenCalledWith('DEMO-AB12-CD34');
    expect(screen.getByRole('textbox', { name: 'Demo code' })).toBeEnabled();
  });
});
