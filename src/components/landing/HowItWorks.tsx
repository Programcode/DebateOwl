import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { FileSearch, Sparkles, Trophy } from "lucide-react";

const HowItWorks = () => {
    const { t } = useTranslation();

    const steps = [
        { icon: FileSearch, step: "1", title: t('howItWorks.step1Title'), description: t('howItWorks.step1Desc') },
        { icon: Sparkles, step: "2", title: t('howItWorks.step2Title'), description: t('howItWorks.step2Desc') },
        { icon: Trophy, step: "3", title: t('howItWorks.step3Title'), description: t('howItWorks.step3Desc') },
    ];

    return (
        <section id="how-it-works" className="relative bg-secondary/10 py-12 md:py-20">
            <div className="section-container">
                <Reveal className="mb-8 text-center md:mb-12">
                    <h2 className="section-heading">{t('howItWorks.title')}</h2>
                </Reveal>

                {/* A short list on phones (icon beside the text), three columns from md up. */}
                <ol className="mx-auto grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-3 md:gap-6">
                    {steps.map((step, index) => (
                        <li key={step.step}>
                            <Reveal delay={index * 0.05} className="flex h-full items-center gap-4 rounded-xl border-2 border-border bg-card p-4 md:flex-col md:p-6 md:text-center">
                                <div className="relative shrink-0">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-card shadow-[0_3px_0_var(--do-border-strong)] dark:shadow-[0_3px_0_var(--do-ledge-neutral)] md:h-16 md:w-16">
                                        <step.icon aria-hidden="true" className="h-6 w-6 text-primary md:h-7 md:w-7" />
                                    </div>
                                    <div aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gold font-display text-xs font-[600] text-on-gold shadow-[0_2px_0_var(--do-accent-ledge)]">
                                        {step.step}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-display text-lg font-[600] text-heading md:text-xl">{step.title}</h3>
                                    <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
                                </div>
                            </Reveal>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
};

export default HowItWorks;
