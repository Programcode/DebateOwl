import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { AnnouncementBanner } from '@/components/layout/AnnouncementBanner';
import type { UserAnnouncement } from '@/lib/announcements';

const announcement: UserAnnouncement = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: 'Karbantartás',
  body: 'A DebateLab rövid ideig nem lesz elérhető.',
  startsAt: '2026-08-31T12:00:00.000Z',
  expiresAt: null,
  createdAt: '2026-08-31T12:00:00.000Z',
};

describe('AnnouncementBanner localization', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('localizes its region, position, and dismiss control', async () => {
    await i18n.changeLanguage('hu');

    render(
      <AnnouncementBanner
        announcement={announcement}
        position={1}
        total={2}
        dismissing={false}
        error={null}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Közlemény' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Közlemény bezárása: Karbantartás' })).toBeInTheDocument();
  });
});
