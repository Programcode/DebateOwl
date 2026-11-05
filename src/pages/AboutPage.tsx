import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import site from '@/config/site.json';
import { PublicPageShell } from '@/components/layout/PublicPageShell';
import { formatPlanPrice, PRO_MONTHLY_PRICE, TRIAL_DAYS } from '@/lib/billing/plan';
import { usePageHead } from '@/lib/seo/use-page-head';

const linkClass = 'font-medium text-primary underline underline-offset-4 hover:text-primary/80';
// The day the DebateAI facts below were last checked on those products' own pages; move it when they are.
const DEBATE_AI_CHECKED_ON = '2026-11-05';

/** Verified facts only: no user counts, testimonials, partnerships or outcome claims. */
export default function AboutPage() {
  const { t, i18n } = useTranslation();
  usePageHead('/about');
  const product = site.product;
  const { operator } = site.organization;
  const longDate = (iso: string) => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));
  const renamedOn = longDate(site.formerly.until);
  const price = formatPlanPrice(PRO_MONTHLY_PRICE, i18n.language);

  return (
    <PublicPageShell className="max-w-[65ch]" footer>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('aboutPage.title', { product })}</h1>

      <div className="mt-8 space-y-8 text-base leading-7 text-foreground">
        <section>
          <h2 id="short-answer" className="text-lg font-semibold">{t('aboutPage.question', { product })}</h2>
          <p>
            <Trans i18nKey="aboutPage.answer" values={{ product }} components={{ home: <a href={`${site.origin}/`} className={linkClass} /> }} />
          </p>
          <p className="mt-4">
            <Trans i18nKey="aboutPage.notThis" values={{ product }} components={{ press: <Link to="/press" className={linkClass} /> }} />
          </p>
        </section>
        <section>
          <h2 id="not-debateai" className="text-lg font-semibold">{t('aboutPage.debateAiHeading', { product })}</h2>
          <p>{t('aboutPage.debateAiIntro', { product })}</p>
          {/* Facts from each product's own public pages only; /debateowl-vs-debatable is a static page, so a plain link. */}
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              <Trans
                i18nKey="aboutPage.debateAiOrg"
                components={{
                  site: <a href="https://www.debateai.org/" className={linkClass} />,
                  compare: <a href="https://www.debateai.org/compare/debateai-vs-chatgpt" className={linkClass} />,
                  faq: <a href="https://www.debateai.org/blog/why-we-built-debateai" className={linkClass} />,
                }}
              />
            </li>
            <li><Trans i18nKey="aboutPage.debateAiCom" values={{ product }} components={{ compare: <a href="/debateowl-vs-debatable" className={linkClass} /> }} /></li>
            <li><Trans i18nKey="aboutPage.debateAiNet" components={{ ph: <a href="https://www.producthunt.com/products/debate-ai" className={linkClass} /> }} /></li>
            <li><Trans i18nKey="aboutPage.debateAiX" components={{ x: <a href="https://x.com/debateai" className={linkClass} /> }} /></li>
            <li>{t('aboutPage.debateAiOther')}</li>
          </ul>
          <p className="mt-4">
            <Trans
              i18nKey="aboutPage.debateAiContrast"
              values={{ product, trialDays: TRIAL_DAYS, price }}
              components={{ tools: <Link to="/tools" className={linkClass} />, demo: <Link to="/ai-debate" className={linkClass} /> }}
            />
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{t('aboutPage.debateAiChecked', { date: longDate(DEBATE_AI_CHECKED_ON) })}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('aboutPage.makerHeading', { product })}</h2>
          <p>
            <Trans
              i18nKey="aboutPage.maker"
              values={{ product, email: site.contactEmail }}
              components={{
                pistack: <a href={operator.publishesAs.url} className={linkClass} />,
                github: <a href={operator.github} className={linkClass} />,
                email: <a href={`mailto:${site.contactEmail}`} className={linkClass} />,
              }}
            />
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
              values={{ trialDays: TRIAL_DAYS, price }}
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
            <li><Link to="/press" className={linkClass}>{t('footer.press')}</Link></li>
          </ul>
        </section>
      </div>
    </PublicPageShell>
  );
}
