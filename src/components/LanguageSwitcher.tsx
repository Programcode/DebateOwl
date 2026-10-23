import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HeaderTooltip } from '@/components/layout/HeaderTooltip';
import { APP_LANGUAGES, type AppLanguage } from '@/lib/languages';
import { cn } from '@/lib/utils';

const LANGUAGE_ENTRIES = Object.entries(APP_LANGUAGES) as [AppLanguage, (typeof APP_LANGUAGES)[AppLanguage]][];

function LanguageChoices({ label, value, onChange }: { label: string; value: AppLanguage; onChange: (language: AppLanguage) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-1">
      <p className="px-2 text-xs font-medium text-muted-foreground">{label}</p>
      {LANGUAGE_ENTRIES.map(([code, language]) => {
        const selected = code === value;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={code}
            onClick={() => onChange(code)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors pointer-coarse:min-h-11',
              'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'font-medium text-primary',
            )}
          >
            {language.label}
            {selected && <Check className="h-4 w-4" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** Two taps to change language: open, pick. The menu closes on the pick; the AI output language sits underneath. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, outputLanguage, setLanguage, setOutputLanguage } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const choose = (set: (language: AppLanguage) => void) => (next: AppLanguage) => {
    set(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <HeaderTooltip label={t('langSwitcher.title', 'Language')}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" aria-label={t('langSwitcher.label', 'Language')}>
            <Globe className="h-5 w-5" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
      </HeaderTooltip>
      <PopoverContent align="end" className="w-60 space-y-3 p-2">
        <LanguageChoices label={t('langSwitcher.uiLanguage', 'Interface language')} value={language} onChange={choose(setLanguage)} />
        <div className="border-t" />
        <LanguageChoices label={t('langSwitcher.outputLanguage', 'AI output language')} value={outputLanguage} onChange={choose(setOutputLanguage)} />
      </PopoverContent>
    </Popover>
  );
}
