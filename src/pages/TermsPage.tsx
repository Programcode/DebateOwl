import { useTranslation } from 'react-i18next';
import { PublicPageShell } from '@/components/layout/PublicPageShell';

export default function TermsPage() {
  const { t } = useTranslation();

  const sections = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <PublicPageShell className="max-w-[65ch]">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('termsPage.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('termsPage.lastUpdated')}: {t('termsPage.date')}</p>

        <div className="mt-8 space-y-6 text-base leading-7 text-foreground">
          {sections.map((n) => (
            <section key={n}>
              <h2 className="text-lg font-semibold">{n}. {t(`termsPage.s${n}`)}</h2>
              <p>{t(`termsPage.p${n}`)}</p>
            </section>
          ))}
        </div>
    </PublicPageShell>
  );
}
