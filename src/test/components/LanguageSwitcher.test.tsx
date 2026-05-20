import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: vi.fn(() => ({
    language: 'en',
    outputLanguage: 'en',
    setLanguage: vi.fn(),
    setOutputLanguage: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key }),
}));

import { LanguageSwitcher } from '@/components/LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders a globe button', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('renders Globe icon SVG', () => {
    const { container } = render(<LanguageSwitcher />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('does not show dialog content before clicking', () => {
    render(<LanguageSwitcher />);
    expect(screen.queryByText('Interface language')).toBeNull();
  });
});
