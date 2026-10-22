import React from "react";
import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";

const Hero = () => {
    const { t } = useTranslation();
    const appPrefetch = useRoutePrefetch("/app");

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
        <section className="relative min-h-[100dvh] overflow-hidden pt-24 pb-20 md:pt-32">
            <div className="absolute inset-0 aurora-bg opacity-80" />
            <div className="absolute inset-0 animated-grid opacity-50" />
            <div className="orb orb-primary w-[420px] h-[420px] -top-44 -left-44 opacity-70" />
            <div className="orb orb-accent w-[520px] h-[520px] -right-32 top-1/3 opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background pointer-events-none" />

            <div className="section-container relative z-10">
                <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
                    <div>
                        <Reveal onLoad className="mb-6">
                            {/* rounded-2xl, not a pill: long Spanish and Hungarian copy wraps cleanly. */}
                            <span className="inline-flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground/80">
                                <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                {t('hero.announcement')}
                            </span>
                        </Reveal>

                        <Reveal onLoad delay={0.05}>
                            <h1 className="text-balance text-[clamp(2.25rem,1.2rem+4.5vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.03em]">
                                {t('hero.headline')}
                            </h1>
                        </Reveal>

                        <Reveal onLoad delay={0.1}>
                            <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
                                {t('hero.subheadline')}
                            </p>
                        </Reveal>

                        <Reveal onLoad delay={0.15} className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Link
                                to="/app"
                                {...appPrefetch}
                                className="btn-primary-gradient inline-flex items-center justify-center gap-2 px-8 py-4 text-lg"
                            >
                                <span className="relative z-10">{t('hero.cta')}</span>
                                <ArrowRight aria-hidden="true" className="relative z-10 h-5 w-5" />
                            </Link>
                            <a
                                href="#pricing"
                                className="btn-secondary-outline inline-flex items-center justify-center gap-2 px-8 py-4 text-lg"
                            >
                                {t('hero.ctaSecondary')}
                            </a>
                        </Reveal>

                        <Reveal onLoad delay={0.15} className="mt-8 grid gap-3 sm:grid-cols-3">
                            {planHighlights.map((item) => (
                                <div key={item.label} className="rounded-xl border border-border/70 bg-card p-4">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</p>
                                    <p className="mt-1 text-base font-semibold text-foreground">{item.value}</p>
                                </div>
                            ))}
                        </Reveal>

                        <ul className="mt-8 space-y-3">
                            {trustBullets.map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm text-foreground/85">
                                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
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
        <Reveal onLoad delay={0.1} className="relative">
            <div className="absolute -inset-8 bg-gradient-to-r from-primary/20 via-cyan-400/20 to-emerald-400/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
                {/* Browser chrome */}
                <div className="flex items-center border-b border-border/60 px-5 py-3">
                    <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 bg-background p-5 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-base font-semibold text-foreground">{t(`features.${mode}`)}</p>
                            <div className="flex rounded-lg border border-border/70 bg-background p-1" role="group" aria-label={t('hero.preview.modeLabel')}>
                                {modes.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        aria-pressed={mode === item.key}
                                        onClick={() => setMode(item.key)}
                                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 ${mode === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label htmlFor="hero-motion" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                                    <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        {t('hero.preview.sideLabel')}
                                    </span>
                                    <span id="hero-side" className="flex h-9 items-center rounded-md border border-border/70 bg-background px-2 text-sm text-foreground">{t('hero.preview.sidePro')}</span>
                                </div>
                                <div className="space-y-1.5">
                                    <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('hero.preview.roleLabel')}</span>
                                    <span className="flex h-9 items-center rounded-md border border-border/70 bg-background px-2 text-sm text-foreground">{t('hero.preview.roleValue')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sample.title}</p>
                        </div>

                        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{sample.firstLabel}</p>
                                <p className="mt-1 text-sm leading-relaxed text-foreground">{sample.first}</p>
                            </div>
                            <div className="border-t border-primary/15 pt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{sample.secondLabel}</p>
                                <p className="mt-1 text-sm leading-relaxed text-foreground">{sample.second}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Reveal>
    );
};

export default Hero;
