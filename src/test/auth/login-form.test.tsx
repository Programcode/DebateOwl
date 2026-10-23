import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthApiError } from '@supabase/supabase-js';
import LoginPage from '@/pages/LoginPage';
import { authRetryAfterSeconds } from '@/lib/auth-errors';
import { formatDemoCode, formatDemoCodeAt } from '@/lib/login-form';

const auth = vi.hoisted(() => ({
  signInWithEmailOtp: vi.fn(async () => undefined),
  signInWithDemoCode: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({
    user: null as null,
    signInWithGoogle: vi.fn(),
    signInWithEmailOtp: auth.signInWithEmailOtp,
    verifyEmailOtp: vi.fn(),
    signInWithDemoCode: auth.signInWithDemoCode,
  }),
}));

function renderLogin() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

function submitEmail(value: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
}

// Auth's max_frequency refusal, as auth-js raises it.
const tooSoon = (seconds: number) => new AuthApiError(`For security purposes, you can only request this after ${seconds} seconds.`, 429, 'over_email_send_rate_limit');

beforeEach(() => {
  sessionStorage.clear();
  auth.signInWithEmailOtp.mockClear();
  auth.signInWithDemoCode.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resend cooldown (AUTH-04)', () => {
  it('counts down after a send, survives a remount, and only then allows a resend', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = renderLogin();
    submitEmail('student@example.com');
    expect(await screen.findByRole('button', { name: 'Resend in 1:00' })).toBeDisabled();

    act(() => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByRole('button', { name: 'Resend in 0:45' })).toBeDisabled();

    // A reload of /login: the same address goes straight to the code step, without a request.
    first.unmount();
    renderLogin();
    submitEmail(' Student@Example.com ');
    expect(await screen.findByText(/We sent a code to this address a moment ago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend in 0:45' })).toBeDisabled();
    expect(auth.signInWithEmailOtp).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(45_000); });
    const resend = screen.getByRole('button', { name: 'Resend code' });
    expect(resend).toBeEnabled();
    fireEvent.click(resend);
    expect(await screen.findByText('New code sent')).toBeInTheDocument();
    expect(auth.signInWithEmailOtp).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Resend in 1:00' })).toBeDisabled();
  });

  it("says how long Auth asked to wait when a resend is refused", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderLogin();
    submitEmail('student@example.com');
    await screen.findByRole('button', { name: 'Resend in 1:00' });
    act(() => { vi.advanceTimersByTime(60_000); });

    auth.signInWithEmailOtp.mockRejectedValueOnce(tooSoon(42));
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 0:42.');
    expect(screen.getByRole('button', { name: 'Resend in 0:42' })).toBeDisabled();

    // The button counts down; the alert keeps its text (read once) and goes when the wait is over.
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByRole('button', { name: 'Resend in 0:40' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Try again in 0:42.');
    act(() => { vi.advanceTimersByTime(40_000); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
  });

  it('opens the code step when Auth says a code went to this address moments ago', async () => {
    auth.signInWithEmailOtp.mockRejectedValueOnce(tooSoon(30));
    renderLogin();
    submitEmail('student@example.com');
    expect(await screen.findByText(/We sent a code to this address a moment ago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend in 0:30' })).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('locks the email field while the code is on its way', async () => {
    let finishSend: () => void = () => undefined;
    auth.signInWithEmailOtp.mockImplementationOnce(() => new Promise<undefined>((resolve) => { finishSend = () => resolve(undefined); }));
    renderLogin();
    submitEmail('a@example.com');
    // The field is locked while the code is on its way.
    expect(screen.getByLabelText('Email address')).toBeDisabled();
    await act(async () => { finishSend(); });
    expect(await screen.findByRole('button', { name: 'Resend in 1:00' })).toBeDisabled();
    expect(auth.signInWithEmailOtp).toHaveBeenCalledWith('a@example.com', expect.anything());
  });
});

describe('email validation (AUTH-10, AUTH-11)', () => {
  it('leaves validation to the app, not the browser', () => {
    const { container } = renderLogin();
    for (const form of container.querySelectorAll('form')) expect(form).toHaveAttribute('novalidate');
  });

  it('says an empty email is required and an over-long one is too long, without sending', async () => {
    renderLogin();
    submitEmail('   ');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email is required.');

    const long = `${'a'.repeat(290)}@example.com`;
    submitEmail(long);
    expect(screen.getByLabelText('Email address')).toHaveValue(long);
    expect(await screen.findByRole('alert')).toHaveTextContent('That email address is too long. Use one with at most 254 characters.');
    expect(auth.signInWithEmailOtp).not.toHaveBeenCalled();
  });
});

describe('demo code (AUTH-12)', () => {
  it('shapes typed and pasted input into DEMO-XXXX-XXXX', () => {
    expect(formatDemoCode('d')).toBe('D');
    expect(formatDemoCode('demo')).toBe('DEMO');
    expect(formatDemoCode('demoa')).toBe('DEMO-A');
    expect(formatDemoCode('DEMO-')).toBe('DEMO');
    expect(formatDemoCode('ab12cd34')).toBe('DEMO-AB12-CD34');
    expect(formatDemoCode(' demo ab12 cd34 extra')).toBe('DEMO-AB12-CD34');
    expect(formatDemoCode('DEMO-AB12-')).toBe('DEMO-AB12');
  });

  it('keeps the caret after the character it followed', () => {
    // Delete on the middle dash: the dash comes back and the caret stays before it.
    expect(formatDemoCodeAt('DEMO-AB12CD34', 9)).toEqual({ value: 'DEMO-AB12-CD34', caret: 9 });
    // A character typed mid-code moves the dash, and the caret stays after the new character.
    expect(formatDemoCodeAt('DEMO-AB1X2-CD3', 9)).toEqual({ value: 'DEMO-AB1X-2CD3', caret: 9 });
    // Typing the first character without the prefix: the caret lands after it.
    expect(formatDemoCodeAt('a', 1)).toEqual({ value: 'DEMO-A', caret: 6 });
  });

  it('gives a format error for a short code and sends a well-formed one', async () => {
    renderLogin();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Demo code' }));
    const input = await screen.findByRole('textbox', { name: 'Demo code' });

    fireEvent.change(input, { target: { value: 'ab12' } });
    expect(input).toHaveValue('DEMO-AB12');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with demo code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demo codes look like DEMO-AB12-CD34.');
    expect(auth.signInWithDemoCode).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'demo-ab12-cd34' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with demo code' }));
    await vi.waitFor(() => expect(auth.signInWithDemoCode).toHaveBeenCalledWith('DEMO-AB12-CD34'));
  });
});

describe('Auth rate-limit waits (AUTH-04)', () => {
  it('reads the wait from a max_frequency refusal and nothing else', () => {
    expect(authRetryAfterSeconds(tooSoon(42))).toBe(42);
    // The hourly email cap names no wait.
    expect(authRetryAfterSeconds(new AuthApiError('email rate limit exceeded', 429, 'over_email_send_rate_limit'))).toBeNull();
    expect(authRetryAfterSeconds(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'))).toBeNull();
  });
});
