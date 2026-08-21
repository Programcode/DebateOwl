import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Check, Crown, Sparkles, Zap } from "lucide-react";

const Pricing = () => {
    const { t } = useTranslation();

    const TRIAL_FEATURES = [
        t('pricing.trialFeature1'),
        t('pricing.trialFeature2'),
        t('pricing.trialFeature3'),
        t('pricing.trialFeature4'),
    ];

    const PRO_FEATURES = [
        t('pricing.proFeature1'),
        t('pricing.proFeature2'),
        t('pricing.proFeature3'),
        t('pricing.proFeature4'),
        t('pricing.proFeature5'),
    ];

    return (
        <section id="pricing" className="relative overflow-hidden py-24">
            <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/10 to-background" />
            <div className="absolute inset-0 animated-grid opacity-40" />

            <div className="section-container relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="mb-14 text-center"
                >
                    <h2 className="text-3xl font-bold md:text-4xl lg:text-5xl tracking-tight">
                        {t('pricing.title')}
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                        {t('pricing.subtitle')}
                    </p>
                </motion.div>

                <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        viewport={{ once: true }}
                        className="rounded-2xl border border-border/70 bg-card/80 p-7 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-2xl font-semibold text-foreground">{t('pricing.trial')}</h3>
                            <span className="rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t('pricing.trialBadge')}
                            </span>
                        </div>
                        <p className="text-4xl font-bold text-foreground">
                            {t('pricing.trialPrice')}<span className="text-base font-medium text-muted-foreground"> {t('pricing.trialPeriod')}</span>
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{t('pricing.trialDesc')}</p>

                        <ul className="mt-6 space-y-3">
                            {TRIAL_FEATURES.map((feature) => (
                                <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90 transition-colors duration-200 hover:text-foreground">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <a href="/app" className="btn-secondary-outline mt-8 inline-flex w-full items-center justify-center gap-2 py-3">
                            <Zap className="h-4 w-4" />
                            {t('pricing.startTrial')}
                        </a>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        viewport={{ once: true }}
                        className="relative rounded-2xl border-2 border-primary/45 bg-card/85 p-7 shadow-xl backdrop-blur ring-1 ring-primary/10 transition-all duration-300 hover:-translate-y-1"
                    >
                        <div className="absolute -top-4 left-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
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
                                <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90 transition-colors duration-200 hover:text-foreground">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <a href="/app" className="btn-primary-gradient shimmer mt-8 inline-flex w-full items-center justify-center gap-2 py-3">
                            <Crown className="relative z-10 h-4 w-4" />
                            <span className="relative z-10">{t('pricing.subscribe')}</span>
                        </a>
                    </motion.div>
                </div>

                <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    viewport={{ once: true }}
                    className="mt-7 text-center text-sm text-muted-foreground"
                >
                    {t('pricing.noFreePlan')}
                </motion.p>
            </div>
        </section>
    );
};

export default Pricing;
