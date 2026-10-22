import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { GenerateForm } from '@/components/features/generate/GenerateForm';
import { AttackForm } from '@/components/features/attack/AttackForm';
import Hero from '@/components/landing/Hero';
import TimerPage from '@/pages/TimerPage';

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));

vi.mock('@/components/layout/HeaderTooltip', () => ({
  HeaderTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('accessible names and headings', () => {
  it('renders CardTitle as an h2 by default and keeps the same classes at another level', () => {
    const { rerender } = render(<CardTitle>Prepare</CardTitle>);
    const title = screen.getByRole('heading', { level: 2, name: 'Prepare' });
    expect(title.className).toContain('text-lg');
    expect(title.className).toContain('font-semibold');
    expect(title.className).toContain('leading-tight');
    expect(title.className).toContain('tracking-[-0.014em]');

    rerender(<CardTitle as="h1">Access Denied</CardTitle>);
    expect(screen.getByRole('heading', { level: 1, name: 'Access Denied' }).className).toContain('text-lg');
  });

  it('names the notification region in the active language', async () => {
    const { rerender } = render(<Toaster />);
    // Sonner appends the focus shortcut to containerAriaLabel.
    expect(screen.getByRole('region', { name: 'Notifications alt+T' })).toBeInTheDocument();

    await act(async () => { await i18n.changeLanguage('es'); });
    rerender(<Toaster />);
    expect(screen.getByRole('region', { name: 'Notificaciones alt+T' })).toBeInTheDocument();

    await act(async () => { await i18n.changeLanguage('hu'); });
    rerender(<Toaster />);
    expect(screen.getByRole('region', { name: 'Értesítések alt+T' })).toBeInTheDocument();
  });

  it('names the language button and both language groups in English, Spanish and Hungarian', async () => {
    const { rerender } = render(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Interface language' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'AI output language' })).toBeInTheDocument();

    await act(async () => { await i18n.changeLanguage('es'); });
    rerender(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Idioma de la interfaz' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Idioma de salida de IA' })).toBeInTheDocument();

    await act(async () => { await i18n.changeLanguage('hu'); });
    rerender(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Nyelv' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Felület nyelve' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'AI kimenet nyelve' })).toBeInTheDocument();
  });

  it('names Generate selects from their visible labels', () => {
    render(<GenerateForm onSubmit={() => {}} isLoading={false} debatePrefill={false} />);
    expect(screen.getByRole('combobox', { name: 'Side' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Speaker Role' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('combobox', { name: 'Case Length' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Audience Level' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tone' })).toBeInTheDocument();
  });

  it('names Attack switches from their labels and selects from theirs', () => {
    render(<AttackForm onSubmit={() => {}} isLoading={false} debateContext={false} />);
    fireEvent.click(screen.getByRole('button', { name: /More options/ }));
    expect(screen.getByRole('switch', { name: 'Detect Fallacies' })).toHaveAccessibleDescription('Identify logical fallacies in the argument');
    expect(screen.getByRole('switch', { name: 'Analyze Weighing' })).toHaveAccessibleDescription('Evaluate impact comparison and prioritization');
    expect(screen.getByRole('combobox', { name: 'Attack Intensity' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Judge Paradigm' })).toBeInTheDocument();
  });

  it('names the timer progress bar with the current speech and a numeric value', async () => {
    const { rerender } = render(<TimerPage />);
    const bar = screen.getByRole('progressbar', { name: 'Introductor progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).not.toHaveAttribute('data-state', 'indeterminate');

    await act(async () => { await i18n.changeLanguage('es'); });
    rerender(<TimerPage />);
    expect(screen.getByRole('progressbar', { name: 'Progreso de Introductor' })).toBeInTheDocument();

    await act(async () => { await i18n.changeLanguage('hu'); });
    rerender(<TimerPage />);
    expect(screen.getByRole('progressbar', { name: 'Bevezető előrehaladása' })).toBeInTheDocument();
  });

  it('keeps the hero mode toggles available and the fake preview out of the tab order', () => {
    render(<MemoryRouter><Hero /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Generate', pressed: true })).toBeInTheDocument();
    const motion = document.getElementById('hero-motion');
    expect(motion).toHaveAttribute('tabindex', '-1');
    expect(motion?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(motion?.closest('[inert]')).toBeTruthy();
  });
});
