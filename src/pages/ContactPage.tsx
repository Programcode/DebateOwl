import { Trans, useTranslation } from 'react-i18next';
import site from '@/config/site.json';
import { PublicPageShell } from '@/components/layout/PublicPageShell';
import { usePageHead } from '@/lib/seo/use-page-head';

const linkClass = 'font-medium text-primary underline underline-offset-4 hover:text-primary/80';

/** Email only: no form, phone number or street address. */
export default function ContactPage() {
  const { t } = useTranslation();
  usePageHead('/contact');
  const product = site.product;
  const mail = (address: string) => <a href={`mailto:${address}`} className={linkClass} />;

  return (
    <PublicPageShell className="max-w-[65ch]" footer>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('contactPage.title', { product })}</h1>

      <div className="mt-8 space-y-8 text-base leading-7 text-foreground">
        <section>
          <h2 id="short-answer" className="text-lg font-semibold">{t('contactPage.question', { product })}</h2>
          <p>
            <Trans i18nKey="contactPage.answer" values={{ email: site.contactEmail }} components={{ email: mail(site.contactEmail) }} />
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('contactPage.topicsHeading')}</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <Trans i18nKey="contactPage.support" values={{ product }} components={{ home: <a href={`${site.origin}/`} className={linkClass} /> }} />
            </li>
            <li>
              <Trans i18nKey="contactPage.privacy" values={{ email: site.privacyEmail }} components={{ email: mail(site.privacyEmail) }} />
            </li>
            <li>{t('contactPage.feedback', { product })}</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('contactPage.tipHeading')}</h2>
          <p>{t('contactPage.tip')}</p>
        </section>
      </div>
    </PublicPageShell>
  );
}
