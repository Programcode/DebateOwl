import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { APP_LANGUAGES, isAppLanguage } from '@/lib/languages';

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, outputLanguage, setLanguage, setOutputLanguage } = useSettingsStore();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" aria-label={t('langSwitcher.label', 'Language settings')}>
          <Globe className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('langSwitcher.title', 'Language')}</DialogTitle>
          <DialogDescription>{t('langSwitcher.description', 'Choose the app language and the language used in AI outputs.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="space-y-2">
            <Label>{t('langSwitcher.uiLanguage', 'Interface language')}</Label>
            <Select value={language} onValueChange={(value) => isAppLanguage(value) && setLanguage(value)}>
              <SelectTrigger aria-label={t('langSwitcher.uiLanguage', 'Interface language')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(APP_LANGUAGES).map(([value, language]) => (
                  <SelectItem key={value} value={value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('langSwitcher.outputLanguage', 'AI output language')}</Label>
            <Select value={outputLanguage} onValueChange={(value) => isAppLanguage(value) && setOutputLanguage(value)}>
              <SelectTrigger aria-label={t('langSwitcher.outputLanguage', 'AI output language')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(APP_LANGUAGES).map(([value, language]) => (
                  <SelectItem key={value} value={value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
