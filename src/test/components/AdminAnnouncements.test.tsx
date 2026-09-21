import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminAnnouncements } from '@/components/admin/AdminAnnouncements';
import type { AdminAnnouncement } from '@/lib/announcements';
import i18n from '@/i18n';

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

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      aria-label="Audience"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: (): null => null,
  SelectValue: (): null => null,
}));

describe('AdminAnnouncements', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
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
    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'users' } });
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

  it('localizes recipient roles in Hungarian', async () => {
    await i18n.changeLanguage('hu');
    render(
      <AdminAnnouncements
        users={[{
          id: '11111111-2222-4333-8444-555555555555',
          email: 'user@example.com',
          role: 'user',
        }]}
      />
    );

    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'users' } });
    expect(await screen.findByText('Felhasználó')).toBeInTheDocument();
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
    let resolveDeactivation: (announcement: AdminAnnouncement) => void = () => undefined;
    mockDeactivateAnnouncement.mockImplementation(() => new Promise<AdminAnnouncement>((resolve) => {
      resolveDeactivation = resolve;
    }));

    render(<AdminAnnouncements users={[]} />);

    await screen.findByText('Scheduled maintenance');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate announcement: Scheduled maintenance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate announcement' }));

    await waitFor(() => expect(mockDeactivateAnnouncement).toHaveBeenCalledWith(activeAnnouncement.id));
    expect(screen.getByRole('heading', { name: 'Deactivate this announcement?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate announcement' })).toBeDisabled();

    resolveDeactivation({
      ...activeAnnouncement,
      deactivatedAt: '2026-08-31T19:30:00.000Z',
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Deactivate this announcement?' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Scheduled maintenance')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('localizes both confirmation dialogs in Hungarian', async () => {
    await i18n.changeLanguage('hu');
    const announcement: AdminAnnouncement = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title: 'Karbantartás',
      body: 'A szolgáltatás rövid ideig nem lesz elérhető.',
      targetType: 'all',
      targetUserIds: null,
      startsAt: '2026-08-31T12:00:00.000Z',
      expiresAt: null,
      deactivatedAt: null,
      createdBy: 'admin-id',
      createdAt: '2026-08-31T12:00:00.000Z',
    };
    mockListAdminAnnouncements.mockResolvedValue([announcement]);

    render(<AdminAnnouncements users={[]} />);

    await screen.findByText('Karbantartás');
    fireEvent.click(screen.getByRole('button', { name: 'Közlemény kikapcsolása: Karbantartás' }));
    expect(screen.getByRole('heading', { name: 'Kikapcsolod ezt a közleményt?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mégse' }));

    fireEvent.click(screen.getByRole('button', { name: 'Közlemény törlése: Karbantartás' }));
    expect(screen.getByRole('heading', { name: 'Törlöd ezt a közleményt?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Közlemény törlése' })).toBeInTheDocument();
  });
});
