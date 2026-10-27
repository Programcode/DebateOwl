import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";
import { PREP_MODE_COUNT, UTILITY_COUNT } from "@/components/features/tools/tool-links";
import { factsAsOf } from "@/lib/seo/pages";

const FeatureList = ({ items }: { items: string[] }) => (
    <ul className="mt-5 space-y-2.5">
        {items.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{feature}</span>
            </li>
        ))}
    </ul>
);

const Pricing = () => {
    const { t, i18n } = useTranslation();
    const appPrefetch = useRoutePrefetch("/app");

    const modeCounts = { modes: PREP_MODE_COUNT, utilities: UTILITY_COUNT };

    const TRIAL_FEATURES = [
        t('pricing.trialFeature1'),
        t('pricing.trialFeature2', modeCounts),
        t('pricing.trialFeature3'),
    ];

    const PRO_FEATURES = [
        t('pricing.proFeature1'),
        t('pricing.proFeature3'),
        t('pricing.proFeature5'),
    ];

    return (
        <section id="pricing" className="relative overflow-hidden py-12 md:py-20">
            <div className="absolute inset-0 bg-linear-to-b from-background via-secondary/10 to-background" />
            <div className="absolute inset-0 animated-grid opacity-40" />

            <div className="section-container relative z-10">
                <Reveal className="mb-10 text-center md:mb-12">
                    <h2 className="section-heading">{t('pricing.title')}</h2>
                </Reveal>

                <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
                    <Reveal>
                    <div className="flex h-full flex-col rounded-xl border-2 border-border bg-card p-6 transition-[border-color,box-shadow] duration-200 hover:border-brand-tint-border hover:shadow-lg">
                        <h3 className="font-display text-xl font-[600] text-heading">{t('pricing.trial')}</h3>
                        <p className="mt-1 font-display text-4xl font-[600] text-heading">
                            {t('pricing.trialPrice')}<span className="text-base font-medium text-muted-foreground"> {t('pricing.trialPeriod')}</span>
                        </p>
                        <FeatureList items={TRIAL_FEATURES} />
                        <div className="flex-1" />
                        <Link to="/app" {...appPrefetch} className="btn-secondary-outline mt-6 inline-flex w-full items-center justify-center gap-2 py-3 md:mt-8">
                            <Zap aria-hidden="true" className="h-4 w-4" />
                            {t('pricing.startTrial')}
                        </Link>
                    </div>
                    </Reveal>

                    <Reveal delay={0.05}>
                    <div className="relative flex h-full flex-col rounded-xl border-2 border-brand bg-card p-6 shadow-[0_6px_0_var(--do-primary-ledge)] transition-[border-color,box-shadow] duration-200 hover:border-primary/60">
                        <div className="absolute -top-4 left-6 inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_2px_0_var(--do-primary-ledge)]">
                            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                            {t('pricing.recommended')}
                        </div>
                        <h3 className="mt-1 font-display text-xl font-[600] text-heading">{t('pricing.pro')}</h3>
                        <p className="mt-1 font-display text-4xl font-[600] text-heading">
                            {t('pricing.proPrice')}<span className="text-base font-medium text-muted-foreground">{t('pricing.proPeriod')}</span>
                        </p>
                        <FeatureList items={PRO_FEATURES} />
                        <div className="flex-1" />
                        <Link to="/app" {...appPrefetch} className="btn-primary-gradient mt-6 inline-flex w-full items-center justify-center gap-2 py-3 md:mt-8">
                            <Crown aria-hidden="true" className="relative z-10 h-4 w-4" />
                            <span className="relative z-10">{t('pricing.subscribe')}</span>
                        </Link>
                    </div>
                    </Reveal>
                </div>

                <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground md:text-sm">
                    {t('pricing.noFreePlan')} {t('pricing.asOf', { asOf: factsAsOf(i18n.language) })}
                </p>
            </div>
        </section>
    );
};

export default Pricing;
