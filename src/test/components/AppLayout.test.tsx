import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import type { UserAnnouncement } from '@/lib/announcements';

const { mockDismissAnnouncement, mockListActiveAnnouncements } = vi.hoisted(() => ({
  mockDismissAnnouncement: vi.fn(),
  mockListActiveAnnouncements: vi.fn(),
}));

vi.mock('@/lib/announcements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/announcements')>();
  return {
    ...actual,
    dismissAnnouncement: mockDismissAnnouncement,
    listActiveAnnouncements: mockListActiveAnnouncements,
  };
});

const announcement: UserAnnouncement = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: 'Scheduled maintenance',
  body: 'DebateLab will be unavailable for ten minutes.',
  startsAt: '2026-08-31T12:00:00.000Z',
  expiresAt: null,
  createdAt: '2026-08-31T11:00:00.000Z',
};

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Link to="next">Open next page</Link>} />
          <Route path="next" element={<p>Next page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AppLayout announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListActiveAnnouncements.mockResolvedValue([announcement]);
    mockDismissAnnouncement.mockResolvedValue(undefined);
  });

  it('shows the active announcement and persists dismissal', async () => {
    renderLayout();

    expect(await screen.findByText('Scheduled maintenance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Scheduled maintenance' }));

    await waitFor(() => expect(mockDismissAnnouncement).toHaveBeenCalledWith(announcement.id));
    expect(screen.queryByText('Scheduled maintenance')).not.toBeInTheDocument();
  });

  it('keeps announcements stable across sibling routes', async () => {
    renderLayout();
    await screen.findByText('Scheduled maintenance');

    fireEvent.click(screen.getByRole('link', { name: 'Open next page' }));

    await screen.findByText('Next page');
    expect(mockListActiveAnnouncements).toHaveBeenCalledTimes(1);
  });

  it('keeps a dismissed announcement absent across sibling routes', async () => {
    renderLayout();

    await screen.findByText('Scheduled maintenance');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Scheduled maintenance' }));

    await waitFor(() => expect(mockDismissAnnouncement).toHaveBeenCalledWith(announcement.id));
    fireEvent.click(screen.getByRole('link', { name: 'Open next page' }));

    await screen.findByText('Next page');
    expect(screen.queryByText('Scheduled maintenance')).not.toBeInTheDocument();
    expect(mockListActiveAnnouncements).toHaveBeenCalledTimes(1);
  });

  it('shows dismissal errors without dropping the announcement', async () => {
    mockDismissAnnouncement.mockRejectedValue(new Error('Could not dismiss the announcement'));

    renderLayout();
    await screen.findByText('Scheduled maintenance');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Scheduled maintenance' }));

    expect(await screen.findByText('Could not dismiss the announcement')).toBeInTheDocument();
    expect(screen.getByText('Scheduled maintenance')).toBeInTheDocument();
  });

  it('loads current announcements again after a deliberate remount', async () => {
    const currentAnnouncement: UserAnnouncement = {
      ...announcement,
      id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      title: 'Current announcement',
      body: 'This message is current after refresh.',
    };
    mockListActiveAnnouncements
      .mockResolvedValueOnce([announcement])
      .mockResolvedValueOnce([currentAnnouncement]);

    const firstRender = renderLayout();
    await screen.findByText('Scheduled maintenance');
    firstRender.unmount();
    renderLayout();

    expect(await screen.findByText('Current announcement')).toBeInTheDocument();
    expect(mockListActiveAnnouncements).toHaveBeenCalledTimes(2);
  });

  it('keeps all tool destinations reachable across desktop and mobile navigation', async () => {
    renderLayout();
    await screen.findByText('Scheduled maintenance');

    const expectDestinations = (links: HTMLElement[], expected: readonly (readonly [string, string])[]) => {
      const destinations = links.map((link) => ({
        name: link.textContent?.trim() ?? '',
        href: link.getAttribute('href'),
      }));
      for (const [label, path] of expected) {
        expect(destinations).toContainEqual(expect.objectContaining({
          name: expect.stringContaining(label),
          href: path,
        }));
      }
    };

    const mainNavigation = screen.getByRole('navigation', { name: 'Main navigation' });
    fireEvent.click(within(mainNavigation).getByText('More'));
    expectDestinations(within(mainNavigation).getAllByRole('link'), [
      ['Home', '/app'],
      ['Generate', '/app/generate'],
      ['Attack', '/app/attack'],
      ['Ask', '/app/ask'],
      ['Crossfire', '/app/crossfire'],
      ['Sparring', '/app/sparring'],
      ['Brainstorm', '/app/brainstorm'],
      ['Factoids', '/app/factoids'],
      ['Flowchart', '/app/flowchart'],
      ['Library', '/app/library'],
      ['Timer', '/app/timer'],
      ['History', '/app/history'],
    ]);

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expectDestinations(within(mobileNavigation).getAllByRole('link'), [
      ['Home', '/app'],
      ['Generate', '/app/generate'],
      ['Attack', '/app/attack'],
      ['Brainstorm', '/app/brainstorm'],
      ['Factoids', '/app/factoids'],
      ['Ask', '/app/ask'],
      ['Crossfire', '/app/crossfire'],
      ['Library', '/app/library'],
      ['Timer', '/app/timer'],
      ['Sparring', '/app/sparring'],
      ['Flowchart', '/app/flowchart'],
      ['History', '/app/history'],
    ]);
  });

  it('closes menus on Escape and returns focus to the trigger', async () => {
    renderLayout();
    await screen.findByText('Scheduled maintenance');

    const mainNavigation = screen.getByRole('navigation', { name: 'Main navigation' });
    const moreSummary = within(mainNavigation).getByText('More');
    fireEvent.click(moreSummary);
    within(mainNavigation).getByRole('link', { name: 'Brainstorm' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(moreSummary.closest('details')).not.toHaveAttribute('open');
    expect(moreSummary).toHaveFocus();

    const menuTrigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(menuTrigger);
    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile navigation' });
    within(mobileNavigation).getByRole('link', { name: /^Brainstorm/ }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
    expect(menuTrigger).toHaveFocus();
  });

  it('keeps the app usable when announcements fail to load', async () => {
    mockListActiveAnnouncements.mockRejectedValue(new Error('Network unavailable'));
    renderLayout();

    expect(await screen.findByRole('link', { name: 'Open next page' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Announcement')).not.toBeInTheDocument();
  });
});
