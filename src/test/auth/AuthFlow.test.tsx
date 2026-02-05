
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/lib/supabase/AuthProvider';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { supabase } from '@/lib/supabase/client';

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signInWithOAuth: vi.fn(),
            signOut: vi.fn(),
        },
    },
}));

// Mock stores to prevent errors during hydration
vi.mock('@/lib/stores/session-store', () => ({
    useSessionStore: vi.fn(() => vi.fn()),
}));
vi.mock('@/lib/stores/settings-store', () => ({
    useSettingsStore: vi.fn(() => vi.fn()),
}));

// Mock child components
const ProtectedComponent = () => <div>Protected Content</div>;
const LoginComponent = () => <div>Login Page</div>;

describe('Auth Flow Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirects unauthenticated user to login', async () => {
        // Mock no session
        (supabase.auth.getSession as Mock).mockResolvedValue({ data: { session: null } });

        render(
            <MemoryRouter initialEntries={['/protected']}>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={<LoginComponent />} />
                        <Route
                            path="/protected"
                            element={
                                <RequireAuth>
                                    <ProtectedComponent />
                                </RequireAuth>
                            }
                        />
                    </Routes>
                </AuthProvider>
            </MemoryRouter>
        );

        // Initial loading state might be present, wait for redirection
        await waitFor(() => {
            expect(screen.getByText('Login Page')).toBeInTheDocument();
        });
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('allows authenticated user to access protected route', async () => {
        // Mock valid session
        const mockSession = { user: { id: 'user-123' }, access_token: 'fake-token' };
        (supabase.auth.getSession as Mock).mockResolvedValue({ data: { session: mockSession } });

        render(
            <MemoryRouter initialEntries={['/protected']}>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={<LoginComponent />} />
                        <Route
                            path="/protected"
                            element={
                                <RequireAuth>
                                    <ProtectedComponent />
                                </RequireAuth>
                            }
                        />
                    </Routes>
                </AuthProvider>
            </MemoryRouter>
        );

        // Wait for content to appear
        await waitFor(() => {
            expect(screen.getByText('Protected Content')).toBeInTheDocument();
        });
        expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });
});
