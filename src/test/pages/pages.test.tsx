// src/test/pages/pages.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '@/pages/LandingPage';
import HomePage from '@/pages/HomePage';
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
    useReducedMotion: () => false,
}));

// Mock useAuth
vi.mock('@/lib/auth', () => ({
    useAuth: () => ({
        user: null as any,
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
    });

    describe('HomePage', () => {
        it('renders the mode selector heading', () => {
            renderWithRouter(<HomePage />, '/app');
            expect(screen.getByRole('heading', { name: 'DebateLab' })).toBeInTheDocument();
        });

        it('shows key mode cards', () => {
            renderWithRouter(<HomePage />, '/app');
            expect(screen.getByText('Generate')).toBeInTheDocument();
            expect(screen.getByText('Attack')).toBeInTheDocument();
            expect(screen.getByText('Brainstorm')).toBeInTheDocument();
            expect(screen.getByText('Factoids')).toBeInTheDocument();
            expect(screen.getByText('Ask')).toBeInTheDocument();
        });

        it('adds stable tour targets to mode cards', () => {
            const { container } = renderWithRouter(<HomePage />, '/app');
            expect(container.querySelector('[data-tour="mode-generate"]')).toBeInTheDocument();
            expect(container.querySelector('[data-tour="mode-flowchart"]')).toBeInTheDocument();
        });

        it('groups the homepage tools without the old subtitle', () => {
            renderWithRouter(<HomePage />, '/app');
            expect(screen.getByRole('heading', { name: 'Prepare' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Practice' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Utilities' })).toBeInTheDocument();
            expect(screen.queryByText('Choose a mode to start.')).not.toBeInTheDocument();
            expect(screen.getByRole('link', { name: /Generate/ })).toHaveAttribute('href', '/app/generate');
            expect(screen.getByRole('link', { name: /History/ })).toHaveAttribute('href', '/app/history');
        });
    });

    describe('NotFound', () => {
        it('renders 404 message', () => {
            renderWithRouter(<NotFound />);
            expect(screen.getByText('404')).toBeDefined();
        });
    });
});
