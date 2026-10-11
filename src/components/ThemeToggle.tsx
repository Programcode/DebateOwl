import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderTooltip } from "@/components/layout/HeaderTooltip";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useTranslation } from 'react-i18next';

export function ThemeToggle() {
    const { theme, setTheme } = useSettingsStore();
    const { t } = useTranslation();
    // "System" gets its own sun-and-moon mark rather than a device icon.
    const Icon = theme === 'system' ? SunMoon : theme === 'dark' ? Moon : Sun;

    return (
        <HeaderTooltip label={t('themeToggle.current', 'Current theme: {{theme}}. Click to cycle.', { theme: t(`settings.${theme}`, theme) })}>
            <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                    if (theme === 'light') setTheme('dark');
                    else if (theme === 'dark') setTheme('system');
                    else setTheme('light');
                }}
            >
                <Icon className="h-[1.2rem] w-[1.2rem]" />
                <span className="sr-only">{t('themeToggle.toggle', 'Toggle theme')}</span>
            </Button>
        </HeaderTooltip>
    );
}
