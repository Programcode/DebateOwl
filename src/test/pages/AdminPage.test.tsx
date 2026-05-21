
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminPage from '@/pages/AdminPage';
import { BrowserRouter } from 'react-router-dom';

// Hoist mocks
const { mockSupabase, mockToast } = vi.hoisted(() => ({
    mockSupabase: {
        auth: {
            getSession: vi.fn(),
        },
    },
    mockToast: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
    supabase: mockSupabase,
    SUPABASE_URL: 'http://localhost:54321',
}));

// Mock Recharts
vi.mock('recharts', () => {
    const ResponsiveContainer = ({ children }: any) => <div>{children}</div>;
    return {
        ResponsiveContainer,
        BarChart: () => <div data-testid="bar-chart">Bar Chart</div>,
        Bar: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        Tooltip: () => null,
        PieChart: () => <div data-testid="pie-chart">Pie Chart</div>,
        Pie: () => null,
        Cell: () => null,
    };
});

vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Access Denied')).toBeInTheDocument();
        });
    });

    it('loads and displays analytics when admin', async () => {
        const mockStats = {
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <AdminPage />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
        });

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
        const mockStats = {
            totals: { requests: 5, cost: 0.01, successRate: 100 },
            daily: [],
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
            daily: [],
            byFeature: {},
            byUser: [],
        };
        const mockUsers = {
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
});
