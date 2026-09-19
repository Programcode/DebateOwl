import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('refreshes announcements on the next page change', async () => {
    renderLayout();
    await screen.findByText('Scheduled maintenance');

    fireEvent.click(screen.getByRole('link', { name: 'Open next page' }));

    await screen.findByText('Next page');
    await waitFor(() => expect(mockListActiveAnnouncements).toHaveBeenCalledTimes(2));
  });

  it('does not show a stale dismissal error under the next announcement', async () => {
    const nextAnnouncement: UserAnnouncement = {
      ...announcement,
      id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      title: 'New announcement',
      body: 'This message replaced the previous one.',
    };
    let rejectDismissal: (reason: Error) => void = () => undefined;
    const pendingDismissal = new Promise<void>((_resolve, reject) => {
      rejectDismissal = reject;
    });
    mockListActiveAnnouncements
      .mockResolvedValueOnce([announcement])
      .mockResolvedValueOnce([nextAnnouncement]);
    mockDismissAnnouncement.mockReturnValue(pendingDismissal);

    renderLayout();
    await screen.findByText('Scheduled maintenance');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Scheduled maintenance' }));
    fireEvent.click(screen.getByRole('link', { name: 'Open next page' }));
    await screen.findByText('New announcement');

    rejectDismissal(new Error('Could not dismiss the old announcement'));

    await waitFor(() => expect(mockDismissAnnouncement).toHaveBeenCalledWith(announcement.id));
    expect(screen.queryByText('Could not dismiss the old announcement')).not.toBeInTheDocument();
  });

  it('does not restore a dismissed announcement from a stale route load', async () => {
    let resolveDismissal: () => void = () => undefined;
    let resolveStaleLoad: (announcements: UserAnnouncement[]) => void = () => undefined;
    const pendingDismissal = new Promise<void>((resolve) => {
      resolveDismissal = resolve;
    });
    const staleLoad = new Promise<UserAnnouncement[]>((resolve) => {
      resolveStaleLoad = resolve;
    });
    mockListActiveAnnouncements
      .mockResolvedValueOnce([announcement])
      .mockReturnValueOnce(staleLoad);
    mockDismissAnnouncement.mockReturnValue(pendingDismissal);

    renderLayout();
    await screen.findByText('Scheduled maintenance');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Scheduled maintenance' }));
    fireEvent.click(screen.getByRole('link', { name: 'Open next page' }));
    await waitFor(() => expect(mockListActiveAnnouncements).toHaveBeenCalledTimes(2));

    resolveDismissal();
    await waitFor(() => expect(screen.queryByText('Scheduled maintenance')).not.toBeInTheDocument());
    await act(async () => {
      resolveStaleLoad([announcement]);
      await staleLoad;
    });

    expect(screen.queryByText('Scheduled maintenance')).not.toBeInTheDocument();
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
