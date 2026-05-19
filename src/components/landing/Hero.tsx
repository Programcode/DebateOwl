import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

const Hero = () => {
    const { t } = useTranslation();

    const planHighlights = [
        { label: t('hero.trialBadge'), value: "3 days" },
        { label: t('hero.requestsBadge'), value: t('hero.requestsBadgeValue') },
        { label: t('hero.proBadge'), value: "$5/month + tax" },
    ];

    const trustBullets = [
        t('hero.trustBullet1'),
        t('hero.trustBullet2'),
        t('hero.trustBullet3'),
    ];

    return (
        <section className="relative min-h-screen overflow-hidden pt-24 pb-20 md:pt-32">
            <div className="absolute inset-0 aurora-bg opacity-80" />
            <div className="absolute inset-0 animated-grid opacity-50" />
            <div className="orb orb-primary w-[420px] h-[420px] -top-44 -left-44 opacity-70" />
            <div className="orb orb-accent w-[520px] h-[520px] -right-32 top-1/3 opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background pointer-events-none" />

            <div className="section-container relative z-10">
                <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="mb-6"
                        >
                            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground/80">
                                <Sparkles className="h-4 w-4 text-primary" />
                                New in 2026: subscriptions, flowcharts, and upgraded timer tools
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
                        >
                            {t('hero.headline')}
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl"
                        >
                            {t('hero.subheadline')}
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="mt-9 flex flex-col gap-3 sm:flex-row"
                        >
                            <a
                                href="/app"
                                className="btn-primary-gradient shimmer inline-flex items-center justify-center gap-2 px-8 py-4 text-lg"
                            >
                                <span className="relative z-10">{t('hero.cta')}</span>
                                <ArrowRight className="relative z-10 h-5 w-5" />
                            </a>
                            <a
                                href="#pricing"
                                className="btn-secondary-outline inline-flex items-center justify-center gap-2 px-8 py-4 text-lg"
                            >
                                {t('hero.ctaSecondary')}
                            </a>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="mt-8 grid gap-3 sm:grid-cols-3"
                        >
                            {planHighlights.map((item) => (
                                <div key={item.label} className="rounded-xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</p>
                                    <p className="mt-1 text-base font-semibold text-foreground">{item.value}</p>
                                </div>
                            ))}
                        </motion.div>

                        <motion.ul
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.5 }}
                            className="mt-8 space-y-3"
                        >
                            {trustBullets.map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm text-foreground/85">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </motion.ul>
                    </div>

                    <HeroPreview />
                </div>
            </div>
        </section>
    );
};

const HeroPreview = () => (
    <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.35 }}
        className="relative"
    >
        <div className="absolute -inset-8 bg-gradient-to-r from-primary/20 via-cyan-400/20 to-emerald-400/20 blur-3xl" />
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Generate Page Preview</p>
            </div>
            <div className="grid gap-4 bg-background/95 p-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4 rounded-xl border border-border/70 bg-card/70 p-4">
                    <h3 className="text-base font-semibold text-foreground">Case Generator</h3>
                    <div className="space-y-3">
                        <div className="rounded-md border border-border/70 bg-background px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Resolution</p>
                            <p className="mt-1 text-sm text-foreground">THBT social media should be treated as a public utility.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-border/70 bg-background px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Side</p>
                                <p className="mt-1 text-sm text-foreground">Affirmative</p>
                            </div>
                            <div className="rounded-md border border-border/70 bg-background px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contentions</p>
                                <p className="mt-1 text-sm text-foreground">3</p>
                            </div>
                        </div>
                        <div className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                            Generate Case
                        </div>
                    </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Live Output Snapshot</p>
                    <div className="rounded-md border border-emerald-200/80 bg-emerald-50/80 p-3 dark:border-emerald-900 dark:bg-emerald-950/60">
                        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">Thesis</p>
                        <p className="mt-1 text-xs text-emerald-900/90 dark:text-emerald-100/90">
                            Regulating major platforms improves transparency and protects public discourse.
                        </p>
                    </div>
                    <div className="rounded-md border border-sky-200/80 bg-sky-50/80 p-3 dark:border-sky-900 dark:bg-sky-950/60">
                        <p className="text-xs font-semibold text-sky-900 dark:text-sky-100">Contention 1</p>
                        <p className="mt-1 text-xs text-sky-900/90 dark:text-sky-100/90">
                            Public-utility standards reduce arbitrary moderation and increase accountability.
                        </p>
                    </div>
                    <div className="rounded-md border border-amber-200/80 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/60">
                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Impact</p>
                        <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/90">
                            Better democratic participation through fairer information access.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </motion.div>
);

export default Hero;
