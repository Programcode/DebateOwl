import { useTranslation } from 'react-i18next';

export default function PrivacyPage() {
  const { t } = useTranslation();

  const sections = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('privacyPage.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('privacyPage.lastUpdated')}: {t('privacyPage.date')}</p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-foreground">
          {sections.map((n) => (
            <section key={n}>
              <h2 className="text-lg font-semibold">{n}. {t(`privacyPage.s${n}`)}</h2>
              <p>{t(`privacyPage.p${n}`)}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
