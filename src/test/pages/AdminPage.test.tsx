
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminPage from '@/pages/AdminPage';
import { BrowserRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';

// Hoist mocks
const { mockSupabase, mockToast, captureProductEventMock } = vi.hoisted(() => ({
    mockSupabase: {
        auth: {
            getSession: vi.fn(),
        },
    },
    mockToast: vi.fn(),
    captureProductEventMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
    supabase: mockSupabase,
    SUPABASE_URL: 'http://localhost:54321',
}));

// Mock Recharts
vi.mock('recharts', () => {
    const ResponsiveContainer = ({ children }: { children?: ReactNode }): ReactElement => <div>{children}</div>;
    return {
        ResponsiveContainer,
        BarChart: () => <div data-testid="bar-chart">Bar Chart</div>,
        Bar: (): null => null,
        XAxis: (): null => null,
        YAxis: (): null => null,
        CartesianGrid: (): null => null,
        Tooltip: (): null => null,
        PieChart: () => <div data-testid="pie-chart">Pie Chart</div>,
        Pie: (): null => null,
        Cell: (): null => null,
    };
});

vi.mock('@/hooks/use-toast', () => ({
    useToast: (): { toast: typeof mockToast } => ({ toast: mockToast }),
}));

vi.mock('@/lib/observability', () => ({
    captureProductEvent: captureProductEventMock,
}));

// Mock global fetch
const globalFetch = vi.fn();
global.fetch = globalFetch;
window.fetch = globalFetch;

describe('AdminPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default authenticated session
        mockSupabase.auth.getSession.mockResolvedValue({
            data: { session: { access_token: 'fake-token', user: { id: 'admin-id' } } },
            error: null,
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('renders loading state initially', async () => {
        globalFetch.mockImplementation(() => new Promise(() => { }));
        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );
        expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
    });

    it('redirects/shows error if not admin', async () => {
        globalFetch.mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ error: 'Admin access required' }),
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Access Denied')).toBeInTheDocument();
        });
        expect(captureProductEventMock).not.toHaveBeenCalled();
    });

    it('loads and displays analytics when admin', async () => {
        const mockStats: Record<string, unknown> = {
            totals: { requests: 1234, cost: 5.67, successRate: 98.5 },
            daily: [{ date: 'Feb 01', requests: 100, cost: 0.5, errors: 2 }],
            byFeature: { generate: 50, ask: 50 },
            byUser: [
                { user_id: 'user-1', email: 'top@example.com', requests: 10, cost: 0.1 },
                { user_id: '6c355d47-1111-4111-8111-111111111111', email: null, requests: 8, cost: 0.05 },
            ],
        };

        const mockUsers = {
            users: [{
                id: '6c355d47-1111-4111-8111-111111111111',
                email: 'joined@example.com',
                createdAt: '2026-01-01T00:00:00.000Z',
                lastSignIn: '2026-01-02T00:00:00.000Z',
                requestCount: 8,
                role: 'user',
            }],
        };

        globalFetch.mockImplementation(async (url: string) => {
            console.log('FETCH URL:', url); // Debug log
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockUsers) };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
        });
        expect(captureProductEventMock).toHaveBeenCalledWith('tool_opened', { tool: 'admin' });

        // Debug output if fails
        // screen.debug(); 

        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('$5.6700')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Usage Analytics' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Rate Limits' })).not.toBeInTheDocument();
        expect(screen.getByText('top@example.com')).toBeInTheDocument();
        expect(screen.getByText('joined@example.com')).toBeInTheDocument();
        expect(screen.queryByText('Unknown user')).not.toBeInTheDocument();
        expect(screen.queryByText('6c355d47…')).not.toBeInTheDocument();
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
        expect(globalFetch.mock.calls.some(([url]) => String(url).includes('action=limits'))).toBe(false);
    });

    it('falls back to shortened user ID when no email is available', async () => {
        const unknownUserId = 'abcd1234-5678-4abc-9def-000000000000';
        const mockStats: Record<string, unknown> = {
            totals: { requests: 5, cost: 0.01, successRate: 100 },
            daily: [] as unknown[],
            byFeature: { generate: 5 },
            byUser: [
                { user_id: unknownUserId, email: null, requests: 5, cost: 0.01 },
            ],
        };

        globalFetch.mockImplementation(async (url: string) => {
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ users: [] }) };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
        });

        const fallback = await screen.findByText('abcd1234…');
        expect(fallback).toHaveAttribute('title', unknownUserId);
        expect(screen.queryByText('Unknown user')).not.toBeInTheDocument();
    });

    it('gifts trial access through the admin grant-trial action', async () => {
        const targetUserId = '11111111-2222-4333-8444-555555555555';
        const mockStats = {
            totals: { requests: 0, cost: 0, successRate: 100 },
            daily: [] as unknown[],
            byFeature: {},
            byUser: [] as unknown[],
        };
        const mockUsers: Record<string, unknown> = {
            users: [{
                id: targetUserId,
                email: 'gift-me@example.com',
                createdAt: '2026-01-01T00:00:00.000Z',
                lastSignIn: '2026-01-02T00:00:00.000Z',
                requestCount: 3,
                role: 'user',
                subscriptionTier: 'expired',
                trialEndsAt: '2026-03-01T00:00:00.000Z',
                gracePeriodEndsAt: null,
                dailyLimitOverride: null,
            }],
        };

        const grantBody: Record<string, unknown> = {};
        globalFetch.mockImplementation(async (url: string, init?: RequestInit) => {
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockUsers) };
            }
            if (url.includes('action=grant-trial')) {
                Object.assign(grantBody, JSON.parse(String(init?.body || '{}')));
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        success: true,
                        user_id: targetUserId,
                        subscription_tier: 'trial',
                        trial_ends_at: '2026-06-18T00:00:00.000Z',
                        daily_limit_override: null,
                    }),
                };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => expect(screen.getByText('Admin Dashboard')).toBeInTheDocument());

        // Radix Tabs activates via mouseDown, not click.
        const usersTab = await screen.findByRole('tab', { name: 'User Management' });
        fireEvent.mouseDown(usersTab, { button: 0 });

        const giftButton = await screen.findByRole('button', { name: /gift trial/i });
        fireEvent.click(giftButton);

        const dialogConfirm = await screen.findByRole('button', { name: /gift 30 days/i });
        fireEvent.click(dialogConfirm);

        await waitFor(() => {
            expect(globalFetch.mock.calls.some(([url]) => String(url).includes('action=grant-trial'))).toBe(true);
        });
        expect(grantBody.userId).toBe(targetUserId);
        expect(grantBody.days).toBe(30);
    });

    it('renders cost by model with unknown-cost rows never shown as $0.0000', async () => {
        const mockStats: Record<string, unknown> = {
            totals: { requests: 12, cost: 0.0123, successRate: 100, unknownCostRequests: 3 },
            daily: [] as unknown[],
            byFeature: { ask: 12 },
            byUser: [
                { user_id: 'user-1', email: 'top@example.com', requests: 12, cost: 0.0123, unknownCostRequests: 3 },
            ],
            byModel: [
                { provider: 'openai', model: 'gpt-5.4-mini', requests: 9, cost: 0.0123, unknownCostRequests: 1 },
                { provider: 'google', model: 'gemini-3.1-flash-lite-preview', requests: 3, cost: 0, unknownCostRequests: 2 },
            ],
        };

        globalFetch.mockImplementation(async (url: string) => {
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ users: [] }) };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
        });

        expect(screen.getByText('gpt-5.4-mini')).toBeInTheDocument();
        expect(screen.getByText('$0.0123 + 1 unknown')).toBeInTheDocument();
        expect(screen.getByText('gemini-3.1-flash-lite-preview')).toBeInTheDocument();
        // Unknown-priced model row must not render a fake zero.
        expect(screen.queryByText('$0.0000')).not.toBeInTheDocument();
    });

    it('renders known, mixed, and unknown cost by feature rows honestly', async () => {
        const mockStats: Record<string, unknown> = {
            totals: { requests: 6, cost: 0.0073, successRate: 100, unknownCostRequests: 5 },
            daily: [] as unknown[],
            byFeature: { ask: 1, generate: 2, attack: 3 },
            byFeatureCost: [
                { feature: 'ask', requests: 1, cost: 0.0042, unknownCostRequests: 0 },
                { feature: 'generate', requests: 2, cost: 0.0031, unknownCostRequests: 1 },
                { feature: 'attack', requests: 3, cost: 0, unknownCostRequests: 3 },
            ],
            byUser: [],
        };

        globalFetch.mockImplementation(async (url: string) => {
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ users: [] }) };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
        });

        expect(screen.getByText('Cost by Feature')).toBeInTheDocument();
        expect(screen.getByText('$0.0042')).toBeInTheDocument();
        expect(screen.getByText('$0.0031 + 1 unknown')).toBeInTheDocument();
        expect(screen.getByText('Unknown')).toBeInTheDocument();
        expect(screen.queryByText('$0.0000')).not.toBeInTheDocument();
    });

    it('labels totals as unknown when cost is unknown instead of rendering $0.0000', async () => {
        const mockStats: Record<string, unknown> = {
            totals: { requests: 7, cost: 0, successRate: 100, unknownCostRequests: 7 },
            daily: [] as unknown[],
            byFeature: { ask: 7 },
            byUser: [
                { user_id: 'user-1', email: 'a@example.com', requests: 7, cost: 0, unknownCostRequests: 7 },
            ],
        };

        globalFetch.mockImplementation(async (url: string) => {
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(mockStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ users: [] }) };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
        });

        expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
        expect(screen.queryByText('$0.0000')).not.toBeInTheDocument();
        expect(screen.getByText('7 requests missing token data')).toBeInTheDocument();
    });

    it('creates an announcement from the admin tab and adds it to history', async () => {
        const createdBody: Record<string, unknown> = {};
        const emptyStats = {
            totals: { requests: 0, cost: 0, successRate: 100 },
            daily: [] as unknown[],
            byFeature: {},
            byUser: [] as unknown[],
        };

        globalFetch.mockImplementation(async (url: string, init?: RequestInit) => {
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(emptyStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ users: [] }) };
            }
            if (url.includes('action=promo-codes')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ codes: [] }) };
            }
            if (url.includes('action=subscribers')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ subscribers: [] }) };
            }
            if (url.includes('action=announcements')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ announcements: [] }) };
            }
            if (url.includes('action=create-announcement')) {
                Object.assign(createdBody, JSON.parse(String(init?.body ?? '{}')));
                return {
                    ok: true,
                    status: 201,
                    text: async () => JSON.stringify({
                        announcement: {
                            id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                            title: createdBody.title,
                            body: createdBody.body,
                            target_type: createdBody.targetType,
                            target_user_ids: null,
                            starts_at: '2026-08-31T12:00:00+00:00',
                            expires_at: null,
                            deactivated_at: null,
                            created_by: '99999999-9999-4999-8999-999999999999',
                            created_at: '2026-08-31T12:00:00+00:00',
                        },
                    }),
                };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => expect(screen.getByText('Admin Dashboard')).toBeInTheDocument());
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Announcements' }), { button: 0 });

        await screen.findByText('No announcements yet');
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Service update' } });
        fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'DebateLab is back online.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create announcement' }));

        await waitFor(() => expect(createdBody.title).toBe('Service update'));
        expect(createdBody.body).toBe('DebateLab is back online.');
        expect(createdBody.targetType).toBe('all');
        expect(await screen.findByText('Service update')).toBeInTheDocument();
        expect(screen.getByText('DebateLab is back online.')).toBeInTheDocument();
    });

    it('lists and deletes an existing announcement after confirmation', async () => {
        const announcementId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        const emptyStats = {
            totals: { requests: 0, cost: 0, successRate: 100 },
            daily: [] as unknown[],
            byFeature: {},
            byUser: [] as unknown[],
        };
        const deleteBody: Record<string, unknown> = {};

        globalFetch.mockImplementation(async (url: string, init?: RequestInit) => {
            if (url.includes('action=stats')) {
                return { ok: true, status: 200, text: async () => JSON.stringify(emptyStats) };
            }
            if (url.includes('action=users')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ users: [] }) };
            }
            if (url.includes('action=promo-codes')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ codes: [] }) };
            }
            if (url.includes('action=subscribers')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ subscribers: [] }) };
            }
            if (url.includes('action=announcements')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        announcements: [{
                            id: announcementId,
                            title: 'Remove me',
                            body: 'This announcement is no longer needed.',
                            target_type: 'all',
                            target_user_ids: null,
                            starts_at: '2026-08-31T12:00:00+00:00',
                            expires_at: null,
                            deactivated_at: null,
                            created_by: '99999999-9999-4999-8999-999999999999',
                            created_at: '2026-08-31T12:00:00+00:00',
                        }],
                    }),
                };
            }
            if (url.includes('action=delete-announcement')) {
                Object.assign(deleteBody, JSON.parse(String(init?.body ?? '{}')));
                return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
            }
            return { ok: false, status: 404, text: async () => '{}' };
        });

        render(
            <BrowserRouter>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => expect(screen.getByText('Admin Dashboard')).toBeInTheDocument());
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Announcements' }), { button: 0 });
        await screen.findByText('Remove me');
        fireEvent.click(screen.getByRole('button', { name: 'Delete announcement: Remove me' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete announcement' }));

        await waitFor(() => expect(deleteBody.announcementId).toBe(announcementId));
        expect(screen.queryByText('Remove me')).not.toBeInTheDocument();
    });
});
