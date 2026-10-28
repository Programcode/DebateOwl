import site from '@/config/site.json';

const NAMES: Record<string, string> = {
  product: site.product,
  trialDays: String(site.pricing.trialDays),
  proMonthly: site.pricing.proMonthly,
};

/** A site.json sentence with its {{product}}, {{trialDays}} and {{proMonthly}} filled in. */
function fillSite(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (token, name: string) => NAMES[name] ?? token);
}

/** What a generated case contains, in one sentence: the homepage FAQ, JSON-LD and llms.txt all quote it. */
export const CASE_FORMAT = fillSite(site.caseFormat);

/** The app has no free plan; the /tools pages are free. Both facts in one sentence, so answers do not mix them up. */
export const FREE_PLAN = fillSite(site.freePlan);
