import React from "react";
import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";
import { Owl } from "@/components/brand/Owl";

const Hero = () => {
    const { t } = useTranslation();
    const appPrefetch = useRoutePrefetch("/app");

    const trustChips = [
        t('hero.trialBadge'),
        t('hero.trustBullet1'),
        t('hero.trustBullet2'),
    ];

    return (
        <section className="relative overflow-hidden pt-20 pb-10 md:pt-28 md:pb-16 lg:min-h-[44rem] lg:pt-32">
            <div className="absolute inset-0 aurora-bg opacity-80" />
            <div className="absolute inset-0 animated-grid opacity-50" />
            <div className="orb orb-primary w-[420px] h-[420px] -top-44 -left-44 opacity-70" />
            <div className="orb orb-accent w-[520px] h-[520px] -right-32 top-1/3 opacity-60" />
            <div className="absolute inset-0 bg-linear-to-b from-background/40 via-background/75 to-background pointer-events-none" />

            <div className="section-container relative z-10">
                <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none">
                        {/* Below lg the product preview is hidden, so Ollie greets the visitor here instead. */}
                        <Reveal onLoad className="mb-3 lg:hidden">
                            <Owl pose="point" size={88} priority breathe={false} className="-ml-2" />
                        </Reveal>

                        <Reveal onLoad delay={0.05}>
                            <h1 className="text-balance font-display text-[clamp(2.25rem,1.2rem+4.5vw,4.5rem)] font-[600] leading-[1.05] tracking-[-0.025em] text-heading">
                                {t('hero.headline')}
                            </h1>
                        </Reveal>

                        <Reveal onLoad delay={0.1}>
                            <p className="mt-4 max-w-xl text-lg text-muted-foreground md:mt-6 md:text-xl">
                                {t('hero.subheadline')}
                            </p>
                        </Reveal>

                        <Reveal onLoad delay={0.15} className="mt-7 md:mt-9">
                            <Link
                                to="/app"
                                {...appPrefetch}
                                className="btn-primary-gradient inline-flex w-full items-center justify-center gap-2 px-8 py-4 text-lg sm:w-auto"
                            >
                                <span className="relative z-10">{t('hero.cta')}</span>
                                <ArrowRight aria-hidden="true" className="relative z-10 h-5 w-5" />
                            </Link>
                        </Reveal>

                        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
                            {trustChips.map((item) => (
                                <li key={item} className="flex items-center gap-1.5 text-sm font-bold text-foreground/85">
                                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-success-text" />
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

    // The generate sample shows a case in the sections Generate writes.
    const caseRow = (key: string) => ({ label: t(`hero.preview.sampleCase.${key}Label`), text: t(`hero.preview.sampleCase.${key}`) });
    const samples: Record<DemoMode, { title: string; rows: Array<{ label: string; text: string }> }> = {
        generate: {
            title: t('hero.preview.sampleCase.title'),
            rows: ['opening', 'argument', 'evidence', 'ifTheySay', 'closing'].map(caseRow),
        },
        crossfire: {
            title: t('hero.preview.sampleCrossfireTitle'),
            rows: [
                { label: t('hero.preview.sampleQuestionLabel'), text: t('hero.preview.sampleQuestion') },
                { label: t('hero.preview.sampleAnswerLabel'), text: t('hero.preview.sampleAnswer') },
            ],
        },
        sparring: {
            title: t('hero.preview.sampleSparringTitle'),
            rows: [
                { label: t('hero.preview.sampleOpeningLabel'), text: t('hero.preview.sampleOpening') },
                { label: t('hero.preview.sampleResponseLabel'), text: t('hero.preview.sampleResponse') },
            ],
        },
    };
    const sample = samples[mode];
    const modes: Array<{ key: DemoMode; label: string }> = [
        { key: "generate", label: t('hero.preview.modeGenerate') },
        { key: "crossfire", label: t('hero.preview.modeCrossfire') },
        { key: "sparring", label: t('hero.preview.modeSparring') },
    ];

    return (
        <Reveal onLoad delay={0.1} className="relative hidden w-full lg:block">
            <div className="absolute -inset-8 bg-linear-to-r from-plume-400/25 via-plume-200/20 to-[rgb(255_196_20/0.22)] blur-3xl" />
            {/* The owl points the visitor at the product. */}
            <Owl pose="point" size={140} priority breathe={false} className="absolute -bottom-10 -left-12 z-20 -scale-x-100" />
            <div className="relative overflow-hidden rounded-xl border-2 border-border bg-card shadow-2xl">
                {/* Browser chrome */}
                <div className="flex items-center border-b-2 border-border px-5 py-3">
                    <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 bg-background p-5 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="space-y-4 rounded-lg border-2 border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-display text-lg font-[600] text-heading">{t(`features.${mode}`)}</p>
                            <div className="flex rounded-full bg-surface-sunken p-1 ring-1 ring-inset ring-border" role="group" aria-label={t('hero.preview.modeLabel')}>
                                {modes.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        aria-pressed={mode === item.key}
                                        onClick={() => setMode(item.key)}
                                        className={`rounded-full px-2.5 py-1 text-xs font-bold transition-[color,background-color,box-shadow] duration-200 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring pointer-coarse:min-h-11 ${mode === item.key ? "bg-card text-heading shadow-[0_2px_0_var(--do-border-strong)] dark:bg-surface-raised" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3" aria-hidden="true" {...{ inert: '' }}>
                            <div className="space-y-1.5">
                                <label htmlFor="hero-motion" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {t('hero.preview.topicLabel')}
                                </label>
                                <input
                                    id="hero-motion"
                                    type="text"
                                    value={motionText}
                                    readOnly
                                    tabIndex={-1}
                                    className="w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
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

                    <div className="space-y-3 rounded-lg border-2 border-border bg-card p-4" aria-hidden="true">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sample.title}</p>
                        </div>

                        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                            {sample.rows.map((row, index) => (
                                <div key={row.label} className={index > 0 ? "border-t border-primary/15 pt-3" : undefined}>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{row.label}</p>
                                    <p className="mt-1 text-sm leading-relaxed text-foreground">{row.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Reveal>
    );
};

export default Hero;
