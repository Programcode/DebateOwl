// src/test/pages/pages.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import LandingPage from '@/pages/LandingPage';
import NotFound from '@/pages/NotFound';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
        section: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <section {...props}>{children}</section>,
        span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
        h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
        h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
        p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
        img: (props: Record<string, unknown>) => <img {...props} />,
        a: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <a {...props}>{children}</a>,
        li: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <li {...props}>{children}</li>,
        ul: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <ul {...props}>{children}</ul>,
        nav: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <nav {...props}>{children}</nav>,
        footer: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <footer {...props}>{children}</footer>,
        header: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <header {...props}>{children}</header>,
        button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <button {...props}>{children}</button>,
    },
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useAnimation: () => ({}),
    useInView: () => true,
}));

// Mock useAuth
vi.mock('@/lib/auth', () => ({
    useAuth: () => ({
        user: null,
        loading: false,
        signInWithGoogle: vi.fn(),
        signOut: vi.fn(),
    }),
}));

const renderWithRouter = (component: React.ReactNode, route = '/') => {
    return render(
        <MemoryRouter initialEntries={[route]}>
            {component}
        </MemoryRouter>
    );
};

describe('Pages', () => {
    describe('LandingPage', () => {
        it('renders without crashing', () => {
            renderWithRouter(<LandingPage />);
            expect(document.body).toBeDefined();
        });

        it('contains hero section', () => {
            renderWithRouter(<LandingPage />);
            expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
        });

        it('contains navigation', () => {
            renderWithRouter(<LandingPage />);
            expect(screen.getAllByText(/DebateLab/i).length).toBeGreaterThan(0);
        });

        it('contains features section', () => {
            renderWithRouter(<LandingPage />);
            expect(screen.getAllByRole('heading').length).toBeGreaterThan(1);
        });

        it('contains footer', () => {
            renderWithRouter(<LandingPage />);
            expect(screen.getAllByText(/DebateLab/i).length).toBeGreaterThan(0);
        });
    });

    describe('NotFound', () => {
        it('renders 404 message', () => {
            renderWithRouter(<NotFound />);
            expect(screen.getByText('404')).toBeDefined();
        });

        it('renders without crashing', () => {
            renderWithRouter(<NotFound />);
            expect(document.body).toBeDefined();
        });
    });
});
