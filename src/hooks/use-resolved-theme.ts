import { useSettingsStore } from '@/lib/stores/settings-store';

export function useResolvedTheme(): 'light' | 'dark' {
    const theme = useSettingsStore((state) => state.theme);

    if (theme === 'system') {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'light';
    }

    return theme;
}
