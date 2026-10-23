import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";
import { PREP_MODE_COUNT, UTILITY_COUNT } from "@/components/features/tools/tool-links";
import { factsAsOf } from "@/lib/seo/pages";

const Pricing = () => {
    const { t, i18n } = useTranslation();
    const appPrefetch = useRoutePrefetch("/app");

    const modeCounts = { modes: PREP_MODE_COUNT, utilities: UTILITY_COUNT };

    const TRIAL_FEATURES = [
        t('pricing.trialFeature1'),
        t('pricing.trialFeature2', modeCounts),
        t('pricing.trialFeature3'),
        t('pricing.trialFeature4'),
    ];

    const PRO_FEATURES = [
        t('pricing.proFeature1'),
        t('pricing.proFeature2', modeCounts),
        t('pricing.proFeature3'),
        t('pricing.proFeature4'),
        t('pricing.proFeature5'),
    ];

    return (
        <section id="pricing" className="relative overflow-hidden py-24">
            <div className="absolute inset-0 bg-linear-to-b from-background via-secondary/10 to-background" />
            <div className="absolute inset-0 animated-grid opacity-40" />

            <div className="section-container relative z-10">
                <Reveal className="mb-14 text-center">
                    <h2 className="section-heading">{t('pricing.title')}</h2>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                        {t('pricing.subtitle')}
                    </p>
                </Reveal>

                <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
                    <Reveal>
                    <div className="h-full rounded-2xl border border-border/70 bg-card p-7 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-lg">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-2xl font-semibold text-foreground">{t('pricing.trial')}</h3>
                            <span className="rounded-full border border-border/70 bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t('pricing.trialBadge')}
                            </span>
                        </div>
                        <p className="text-4xl font-bold text-foreground">
                            {t('pricing.trialPrice')}<span className="text-base font-medium text-muted-foreground"> {t('pricing.trialPeriod')}</span>
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{t('pricing.trialDesc')}</p>

                        <ul className="mt-6 space-y-3">
                            {TRIAL_FEATURES.map((feature) => (
                                <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90">
                                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <Link to="/app" {...appPrefetch} className="btn-secondary-outline mt-8 inline-flex w-full items-center justify-center gap-2 py-3">
                            <Zap aria-hidden="true" className="h-4 w-4" />
                            {t('pricing.startTrial')}
                        </Link>
                    </div>
                    </Reveal>

                    <Reveal delay={0.05}>
                    <div className="relative h-full rounded-2xl border-2 border-primary/45 bg-card p-7 shadow-xl ring-1 ring-primary/10 transition-[border-color,box-shadow] duration-200 hover:border-primary/60">
                        <div className="absolute -top-4 left-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                            {t('pricing.recommended')}
                        </div>

                        <div className="mb-4 mt-2 flex items-center justify-between">
                            <h3 className="text-2xl font-semibold text-foreground">{t('pricing.pro')}</h3>
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                                {t('pricing.proBadge')}
                            </span>
                        </div>
                        <p className="text-4xl font-bold text-foreground">
                            {t('pricing.proPrice')}<span className="text-base font-medium text-muted-foreground">{t('pricing.proPeriod')}</span>
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{t('pricing.proDesc')}</p>

                        <ul className="mt-6 space-y-3">
                            {PRO_FEATURES.map((feature) => (
                                <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90">
                                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <Link to="/app" {...appPrefetch} className="btn-primary-gradient mt-8 inline-flex w-full items-center justify-center gap-2 py-3">
                            <Crown aria-hidden="true" className="relative z-10 h-4 w-4" />
                            <span className="relative z-10">{t('pricing.subscribe')}</span>
                        </Link>
                    </div>
                    </Reveal>
                </div>

                <p className="mt-7 text-center text-sm text-muted-foreground">
                    {t('pricing.noFreePlan')} {t('pricing.asOf', { asOf: factsAsOf(i18n.language) })}
                </p>
            </div>
        </section>
    );
};

export default Pricing;
