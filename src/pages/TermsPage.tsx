import { Trans, useTranslation } from 'react-i18next';
import site from '@/config/site.json';
import { PublicPageShell } from '@/components/layout/PublicPageShell';
import { usePageHead } from '@/lib/seo/use-page-head';

export default function TermsPage() {
  const { t } = useTranslation();
  usePageHead('/terms');

  const sections = Array.from({ length: 11 }, (_, i) => i + 1);
  const emails = { contactEmail: site.contactEmail, privacyEmail: site.privacyEmail };
  const mail = (address: string) => <a href={`mailto:${address}`} className="font-medium text-primary underline underline-offset-4 hover:text-primary/80" />;

  return (
    <PublicPageShell className="max-w-[65ch]" footer>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('termsPage.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('termsPage.lastUpdated')}: {t('termsPage.date')}</p>

        <div className="mt-8 space-y-6 text-base leading-7 text-foreground">
          {sections.map((n) => (
            <section key={n}>
              <h2 className="text-lg font-semibold">{n}. {t(`termsPage.s${n}`)}</h2>
              <p>
                {/* Section 11 wraps the addresses in <contact> and <privacy>, which become mailto links. */}
                <Trans i18nKey={`termsPage.p${n}`} values={emails} components={{ contact: mail(site.contactEmail), privacy: mail(site.privacyEmail) }} />
              </p>
            </section>
          ))}
        </div>
    </PublicPageShell>
  );
}
