import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockSetLanguage = vi.fn();

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: vi.fn(() => ({
    language: 'en',
    setLanguage: mockSetLanguage,
  })),
}));

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useSettingsStore } from '@/lib/stores/settings-store';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders with current language en', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders with Spanish language', () => {
    vi.mocked(useSettingsStore).mockReturnValue({ language: 'es', setLanguage: mockSetLanguage });
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders with Hungarian language', () => {
    vi.mocked(useSettingsStore).mockReturnValue({ language: 'hu', setLanguage: mockSetLanguage });
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('has proper aria-label', () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.getAttribute('aria-label')).toBeDefined();
  });

  it('renders Globe icon', () => {
    const { container } = render(<LanguageSwitcher />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('trigger has correct width class', () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('w-[110px]');
  });

  it('trigger has text-xs class', () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('text-xs');
  });

  it('trigger has h-8 class', () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('h-8');
  });

  it('does not call setLanguage on initial render', () => {
    render(<LanguageSwitcher />);
    expect(mockSetLanguage).not.toHaveBeenCalled();
  });
});
