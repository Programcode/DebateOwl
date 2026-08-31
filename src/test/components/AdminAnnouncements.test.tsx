import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminAnnouncements } from '@/components/admin/AdminAnnouncements';
import type { AdminAnnouncement } from '@/lib/announcements';

const {
  mockCreateAnnouncement,
  mockDeactivateAnnouncement,
  mockDeleteAnnouncement,
  mockListAdminAnnouncements,
  mockToast,
} = vi.hoisted(() => ({
  mockCreateAnnouncement: vi.fn(),
  mockDeactivateAnnouncement: vi.fn(),
  mockDeleteAnnouncement: vi.fn(),
  mockListAdminAnnouncements: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/lib/announcements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/announcements')>();
  return {
    ...actual,
    createAnnouncement: mockCreateAnnouncement,
    deactivateAnnouncement: mockDeactivateAnnouncement,
    deleteAnnouncement: mockDeleteAnnouncement,
    listAdminAnnouncements: mockListAdminAnnouncements,
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('AdminAnnouncements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    mockListAdminAnnouncements.mockResolvedValue([]);
    mockCreateAnnouncement.mockResolvedValue({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title: 'Targeted note',
      body: 'This message is for one user.',
      targetType: 'users',
      targetUserIds: ['11111111-2222-4333-8444-555555555555'],
      startsAt: '2026-08-31T12:00:00.000Z',
      expiresAt: null,
      deactivatedAt: null,
      createdBy: 'admin-id',
      createdAt: '2026-08-31T12:00:00.000Z',
    });
  });

  it('creates a targeted announcement with selected user IDs', async () => {
    render(
      <AdminAnnouncements
        users={[{
          id: '11111111-2222-4333-8444-555555555555',
          email: 'selected@example.com',
          role: 'user',
        }]}
      />
    );

    await screen.findByText('No announcements yet');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Targeted note' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'This message is for one user.' } });
    fireEvent.click(screen.getByLabelText('Audience'));
    fireEvent.click(await screen.findByRole('option', { name: 'Selected users' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select selected@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create announcement' }));

    await waitFor(() => expect(mockCreateAnnouncement).toHaveBeenCalledWith({
      title: 'Targeted note',
      body: 'This message is for one user.',
      targetType: 'users',
      targetUserIds: ['11111111-2222-4333-8444-555555555555'],
      startsAt: undefined,
      expiresAt: undefined,
    }));
  });

  it('deactivates an announcement without removing it from history', async () => {
    const activeAnnouncement: AdminAnnouncement = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title: 'Scheduled maintenance',
      body: 'DebateLab will be unavailable briefly.',
      targetType: 'all',
      targetUserIds: null,
      startsAt: '2026-08-31T12:00:00.000Z',
      expiresAt: null,
      deactivatedAt: null,
      createdBy: 'admin-id',
      createdAt: '2026-08-31T12:00:00.000Z',
    };
    mockListAdminAnnouncements.mockResolvedValue([activeAnnouncement]);
    mockDeactivateAnnouncement.mockResolvedValue({
      ...activeAnnouncement,
      deactivatedAt: '2026-08-31T19:30:00.000Z',
    });

    render(<AdminAnnouncements users={[]} />);

    await screen.findByText('Scheduled maintenance');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate announcement: Scheduled maintenance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate announcement' }));

    await waitFor(() => expect(mockDeactivateAnnouncement).toHaveBeenCalledWith(activeAnnouncement.id));
    expect(screen.getByText('Scheduled maintenance')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });
});
