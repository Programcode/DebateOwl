import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import site from '@/config/site.json';
import { PublicPageShell } from '@/components/layout/PublicPageShell';
import { formatPlanPrice, PRO_MONTHLY_PRICE, TRIAL_DAYS } from '@/lib/billing/plan';
import { usePageHead } from '@/lib/seo/use-page-head';

const linkClass = 'font-medium text-primary underline underline-offset-4 hover:text-primary/80';
// The day the facts below were last checked; move it when they are.
const CHECKED_ON = '2026-11-02';

/**
 * The fact sheet for press and answer engines: what DebateOwl is, who makes it
 * and what it is not. Verified facts only, and no phone number or street address.
 */
export default function PressPage() {
  const { t, i18n } = useTranslation();
  usePageHead('/press');
  const product = site.product;
  const longDate = (iso: string) => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));
  const facts: Array<[string, ReactNode]> = [
    [t('pressPage.nameLabel'), <>{t('pressPage.name', { product, alternateName: site.alternateName })}</>],
    [t('pressPage.websiteLabel'), <a href={`${site.origin}/`} className={linkClass}>{new URL(site.origin).host}</a>],
    [t('pressPage.formerlyLabel'), <>{t('pressPage.formerly', { name: site.formerly.name, host: site.formerly.host, date: longDate(site.formerly.until) })}</>],
    [t('pressPage.makerLabel'), <Trans i18nKey="pressPage.maker" components={{ github: <a href={site.organization.operator.github} className={linkClass} />, pistack: <a href={site.organization.operator.publishesAs.url} className={linkClass} /> }} />],
    [t('pressPage.launchedLabel'), <>{t('pressPage.launched', { name: site.formerly.name })}</>],
    [t('pressPage.languagesLabel'), <>{t('aboutPage.languages')}</>],
    [t('pressPage.pricingLabel'), (
      <Trans
        i18nKey="pressPage.pricing"
        values={{ trialDays: TRIAL_DAYS, price: formatPlanPrice(PRO_MONTHLY_PRICE, i18n.language) }}
        components={{ tools: <Link to="/tools" className={linkClass} /> }}
      />
    )],
    [t('pressPage.contactLabel'), <a href={`mailto:${site.contactEmail}`} className={linkClass}>{site.contactEmail}</a>],
  ];

  return (
    <PublicPageShell className="max-w-[65ch]" footer>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('pressPage.title', { product })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('pressPage.checked', { date: longDate(CHECKED_ON) })}</p>

      <div className="mt-8 space-y-8 text-base leading-7 text-foreground">
        <section>
          <h2 id="short-answer" className="text-lg font-semibold">{t('aboutPage.question', { product })}</h2>
          <p>
            <Trans i18nKey="pressPage.definition" values={{ product }} components={{ home: <a href={`${site.origin}/`} className={linkClass} /> }} />
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('pressPage.factsHeading')}</h2>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-semibold">{label}</dt>
                <dd className="mb-2 sm:mb-0">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('pressPage.logoHeading')}</h2>
          <img src={site.organization.logo.path} alt={t('pressPage.logoAlt', { product })} width={96} height={96} className="mt-3 rounded-2xl" />
          <ul className="mt-3 list-disc space-y-1 pl-6">
            <li><a href={site.organization.logo.path} download="debateowl-logo-512.png" className={linkClass}>{t('pressPage.logoPng')}</a></li>
            <li><a href="/owl-mark.svg" download="debateowl-logo.svg" className={linkClass}>{t('pressPage.logoSvg')}</a></li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('pressPage.notHeading')}</h2>
          <p>{t('pressPage.not', { product })}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('aboutPage.linksHeading', { product })}</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li><Link to="/about" className={linkClass}>{t('footer.about')}</Link></li>
            {/* The pricing guide is a static page, not an app route: a plain link loads it from the server. */}
            <li><a href="/debateowl-pricing" className={linkClass}>{t('footer.pricingGuide')}</a></li>
            <li><Link to="/contact" className={linkClass}>{t('footer.contact')}</Link></li>
          </ul>
        </section>
      </div>
    </PublicPageShell>
  );
}
