import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '@/lib/stores/settings-store';

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

function subscribe(callback: () => void) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
    }
    const mql = window.matchMedia(SYSTEM_THEME_QUERY);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): 'light' | 'dark' {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return 'light';
    }
    return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light';
}

function getServerSnapshot(): 'light' | 'dark' {
    return 'light';
}

export function useResolvedTheme(): 'light' | 'dark' {
    const theme = useSettingsStore((state) => state.theme);
    const systemTheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    if (theme === 'system') {
        return systemTheme;
    }

    return theme;
}
