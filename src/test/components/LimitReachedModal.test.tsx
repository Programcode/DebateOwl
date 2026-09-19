import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { LimitReachedModal } from '@/components/features/subscription/LimitReachedModal';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => cleanup());

describe('LimitReachedModal', () => {
  it('shows server-provided usage details and keeps the upgrade action', () => {
    const onUpgrade = vi.fn();

    render(
      <LimitReachedModal
        open
        onOpenChange={vi.fn()}
        variant="limit_reached"
        current={7}
        limit={10}
        onUpgrade={onUpgrade}
      />,
    );

    expect(screen.getByText("You've used 7 of 10 included AI uses today. Access refreshes at midnight UTC.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro - $5/mo' }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });
});
