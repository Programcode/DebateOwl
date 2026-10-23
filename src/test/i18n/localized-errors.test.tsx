import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAppLanguage } from '@/i18n';
import es from '@/locales/es.json';
import hu from '@/locales/hu.json';
import { AttackForm } from '@/components/features/attack/AttackForm';
import { useSessionStore } from '@/lib/stores/session-store';
import { mapAIError } from '@/lib/ai/errors';
import { serverErrorMessage } from '@/lib/server-errors';
import { promoResultCode } from '../../../supabase/functions/_shared/promo-result';

// IN-14: form validation and IN-11: server errors read in the interface language.

vi.mock('@/components/ModelSelector', () => ({ ModelSelector: (): null => null }));
vi.mock('@/components/features/debate/DebateContextControl', () => ({ DebateContextControl: (): null => null }));

const switchTo = (language: 'en' | 'es' | 'hu') => act(() => applyAppLanguage(language));
const non2xx = (status: number) => ({ message: 'Edge Function returned a non-2xx status code', context: { status } });

afterEach(() => switchTo('en'));

describe('form validation', () => {
  beforeEach(() => useSessionStore.setState({ attackForm: {} }));

  it('says an empty case is required in the interface language, only after a submit', async () => {
    await switchTo('hu');
    const onSubmit = vi.fn();
    render(<AttackForm onSubmit={onSubmit} isLoading={false} />);
    expect(screen.queryByText(hu.validation.caseTextRequired)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: hu.attackForm.submit }));
    expect(await screen.findByText(hu.validation.caseTextRequired)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await switchTo('es');
    await waitFor(() => expect(screen.getByText(es.validation.caseTextRequired)).toBeInTheDocument());
  });
});

describe('server error codes', () => {
  it('translate a known code and keep the server text for an unknown one', async () => {
    await switchTo('hu');
    expect(serverErrorMessage('banned', 'Your account has been suspended.')).toBe(hu.serverErrors.banned);
    expect(serverErrorMessage('something_new', 'Server says no')).toBe('Server says no');
    expect(serverErrorMessage(undefined, 'Server says no')).toBe('Server says no');
  });

  it('give AI refusals the translated reason', async () => {
    await switchTo('es');
    const banned = mapAIError(non2xx(403), 'r', 'openrouter', 'm', { error: 'Your account has been suspended.', code: 'banned' });
    expect(banned.message).toBe(es.serverErrors.banned);
    const expired = mapAIError(non2xx(401), 'r', 'openrouter', 'm', { error: 'Invalid JWT' });
    expect(expired.message).toBe(es.serverErrors.sessionExpired);
    // Not a provider quota failure, though the server's text mentions a quota.
    const unverified = mapAIError(non2xx(500), 'r', 'openrouter', 'm', { error: 'Unable to verify your quota. Please try again.', code: 'usage_check_failed' });
    expect(unverified.name).toBe('AIServerError');
    expect(unverified.message).toBe(es.serverErrors.usageCheckFailed);
    const unknown = mapAIError(non2xx(500), 'r', 'openrouter', 'm', { error: 'Database on fire' });
    expect(unknown.message).toBe('Error del servicio de IA: Database on fire. Inténtalo de nuevo.');
  });

  it('name a promo answer by its code, or by the English text an older redeem-promo sends', () => {
    expect(promoResultCode({ message: 'Promo code applied!' })).toBe('promo_applied');
    expect(promoResultCode({ message: "You've already redeemed this code" })).toBe('promo_already_redeemed');
    expect(promoResultCode({ code: 'too_many_attempts', message: 'anything' })).toBe('promo_too_many_attempts');
    expect(promoResultCode({ code: 'promo_invalid' })).toBe('promo_invalid');
    expect(promoResultCode({ message: 'Something the browser has never seen' })).toBeUndefined();
  });
});
