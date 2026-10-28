import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import site from '@/config/site.json';
import { PublicPageShell } from '@/components/layout/PublicPageShell';
import { formatPlanPrice, PRO_MONTHLY_PRICE, TRIAL_DAYS } from '@/lib/billing/plan';
import { usePageHead } from '@/lib/seo/use-page-head';

const linkClass = 'font-medium text-primary underline underline-offset-4 hover:text-primary/80';

/** Verified facts only: no user counts, testimonials, partnerships or outcome claims. */
export default function AboutPage() {
  const { t, i18n } = useTranslation();
  usePageHead('/about');
  const product = site.product;
  const renamedOn = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${site.formerly.until}T00:00:00Z`));

  return (
    <PublicPageShell className="max-w-[65ch]" footer>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('aboutPage.title', { product })}</h1>

      <div className="mt-8 space-y-8 text-base leading-7 text-foreground">
        <section>
          <h2 id="short-answer" className="text-lg font-semibold">{t('aboutPage.question', { product })}</h2>
          <p>
            <Trans i18nKey="aboutPage.answer" values={{ product }} components={{ home: <a href={`${site.origin}/`} className={linkClass} /> }} />
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('aboutPage.makerHeading')}</h2>
          <p>
            <Trans i18nKey="aboutPage.maker" values={{ product }} components={{ pistack: <a href={site.organization.parent.url} className={linkClass} /> }} />
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('aboutPage.nameHeading')}</h2>
          <p>{t('aboutPage.name', { product, date: renamedOn })}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('aboutPage.pricingHeading')}</h2>
          <p>
            <Trans
              i18nKey="aboutPage.pricing"
              values={{ trialDays: TRIAL_DAYS, price: formatPlanPrice(PRO_MONTHLY_PRICE, i18n.language) }}
              components={{ pricing: <a href="/debateowl-pricing" className={linkClass} /> }}
            />
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('aboutPage.languagesHeading')}</h2>
          <p>{t('aboutPage.languages')}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('aboutPage.linksHeading', { product })}</h2>
          <ul className="list-disc space-y-1 pl-6">
            {/* The pricing guide is a static page, not an app route: a plain link loads it from the server. */}
            <li><a href="/debateowl-pricing" className={linkClass}>{t('footer.pricingGuide')}</a></li>
            <li><Link to="/privacy" className={linkClass}>{t('footer.privacy')}</Link></li>
            <li><Link to="/terms" className={linkClass}>{t('footer.terms')}</Link></li>
            <li><Link to="/contact" className={linkClass}>{t('footer.contact')}</Link></li>
          </ul>
        </section>
      </div>
    </PublicPageShell>
  );
}
