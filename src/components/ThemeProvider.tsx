// src/components/ThemeProvider.tsx
import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/lib/stores/settings-store';

type ResolvedTheme = 'light' | 'dark';

// Browser chrome colours, matching --background in each theme.
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f1f5f9', dark: '#0f172a' };

function syncThemeColor(theme: 'light' | 'dark' | 'system', resolved: ResolvedTheme) {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
        const media = meta.getAttribute('media') ?? '';
        const own: ResolvedTheme = media.includes('dark') ? 'dark' : 'light';
        // In system mode each meta keeps its own media colour; an explicit choice wins everywhere.
        meta.content = THEME_COLORS[theme === 'system' ? own : resolved];
    });
}

function applyTheme(resolved: ResolvedTheme, animate: boolean) {
    const root = window.document.documentElement;
    const swap = () => {
        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
    };

    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        swap();
        return;
    }

    // One 200ms crossfade of the whole page instead of every surface easing at its own speed.
    if (typeof document.startViewTransition === 'function') {
        const transition = document.startViewTransition(swap);
        // A newer switch skips this one's animation; the class swap still runs, so that's fine.
        transition.ready.catch(() => {});
        transition.finished.catch(() => {});
        return;
    }

    // No View Transitions: switch in a single frame so nothing ripples.
    root.classList.add('theme-switching');
    swap();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

const systemTheme = (): ResolvedTheme =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const theme = useSettingsStore((state) => state.theme);
    const mounted = useRef(false);

    useEffect(() => {
        const resolved = theme === 'system' ? systemTheme() : theme;
        // theme-init.js already applied the stored theme before first paint.
        applyTheme(resolved, mounted.current);
        syncThemeColor(theme, resolved);
        mounted.current = true;
    }, [theme]);

    // Listen for system theme changes when in 'system' mode
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e: MediaQueryListEvent) => {
            applyTheme(e.matches ? 'dark' : 'light', true);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    return <>{children}</>;
}
