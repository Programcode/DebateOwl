import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'hu', label: 'Magyar' },
] as const;

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, setLanguage } = useSettingsStore();

  return (
    <div className="flex items-center gap-1.5">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'es' | 'hu')}>
        <SelectTrigger className="h-8 w-[110px] text-xs" aria-label={t('langSwitcher.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang) => (
            <SelectItem key={lang.value} value={lang.value}>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
