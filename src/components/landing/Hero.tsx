import React from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

const Hero = () => {
    const { t } = useTranslation();

    const planHighlights = [
        { label: t('hero.trialBadge'), value: t('hero.trialBadgeValue') },
        { label: t('hero.requestsBadge'), value: t('hero.requestsBadgeValue') },
        { label: t('hero.proBadge'), value: `${t('pricing.proPrice')}${t('pricing.proPeriod')}` },
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
                                {t('hero.announcement')}
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

const HeroPreview = () => {
    const { t } = useTranslation();
    type DemoMode = "generate" | "crossfire" | "sparring";
    const [mode, setMode] = React.useState<DemoMode>("generate");
    const motionText = t('hero.preview.topicValue');

    const samples: Record<DemoMode, { title: string; firstLabel: string; first: string; secondLabel: string; second: string }> = {
        generate: {
            title: t('hero.preview.sampleCaseTitle'),
            firstLabel: t('hero.preview.sampleClaimLabel'),
            first: t('hero.preview.sampleClaim'),
            secondLabel: t('hero.preview.sampleEvidenceLabel'),
            second: t('hero.preview.sampleEvidence'),
        },
        crossfire: {
            title: t('hero.preview.sampleCrossfireTitle'),
            firstLabel: t('hero.preview.sampleQuestionLabel'),
            first: t('hero.preview.sampleQuestion'),
            secondLabel: t('hero.preview.sampleAnswerLabel'),
            second: t('hero.preview.sampleAnswer'),
        },
        sparring: {
            title: t('hero.preview.sampleSparringTitle'),
            firstLabel: t('hero.preview.sampleOpeningLabel'),
            first: t('hero.preview.sampleOpening'),
            secondLabel: t('hero.preview.sampleResponseLabel'),
            second: t('hero.preview.sampleResponse'),
        },
    };
    const sample = samples[mode];
    const modes: Array<{ key: DemoMode; label: string }> = [
        { key: "generate", label: t('hero.preview.modeGenerate') },
        { key: "crossfire", label: t('hero.preview.modeCrossfire') },
        { key: "sparring", label: t('hero.preview.modeSparring') },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="relative"
        >
            <div className="absolute -inset-8 bg-gradient-to-r from-primary/20 via-cyan-400/20 to-emerald-400/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-2xl backdrop-blur-xl">
                {/* Browser chrome */}
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                    <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('hero.preview.sampleLabel')}</p>
                </div>

                <div className="grid gap-4 bg-background/95 p-5 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="space-y-4 rounded-xl border border-border/70 bg-card/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-foreground">{t(`features.${mode}`)}</h3>
                            <div className="flex rounded-lg border border-border/70 bg-background/70 p-1" role="group" aria-label={t('hero.preview.modeLabel')}>
                                {modes.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        aria-pressed={mode === item.key}
                                        onClick={() => setMode(item.key)}
                                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label htmlFor="hero-motion" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {t('hero.preview.topicLabel')}
                                </label>
                                <input
                                    id="hero-motion"
                                    type="text"
                                    value={motionText}
                                    readOnly
                                    className="w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                        {t('hero.preview.sideLabel')}
                                    </span>
                                    <span id="hero-side" className="flex h-9 items-center rounded-md border border-border/70 bg-background px-2 text-sm text-foreground">{t('hero.preview.sidePro')}</span>
                                </div>
                                <div className="space-y-1.5">
                                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('hero.preview.roleLabel')}</span>
                                    <span className="flex h-9 items-center rounded-md border border-border/70 bg-background px-2 text-sm text-foreground">{t('hero.preview.roleValue')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sample.title}</p>
                        </div>

                        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{sample.firstLabel}</p>
                                <p className="mt-1 text-sm leading-relaxed text-foreground">{sample.first}</p>
                            </div>
                            <div className="border-t border-primary/15 pt-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{sample.secondLabel}</p>
                                <p className="mt-1 text-sm leading-relaxed text-foreground">{sample.second}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default Hero;
