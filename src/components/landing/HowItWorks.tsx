import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { FileSearch, Sparkles, Trophy } from "lucide-react";

const HowItWorks = () => {
    const { t } = useTranslation();

    const steps = [
        { icon: FileSearch, step: "01", title: t('howItWorks.step1Title'), description: t('howItWorks.step1Desc') },
        { icon: Sparkles, step: "02", title: t('howItWorks.step2Title'), description: t('howItWorks.step2Desc') },
        { icon: Trophy, step: "03", title: t('howItWorks.step3Title'), description: t('howItWorks.step3Desc') },
    ];

    return (
        <section id="how-it-works" className="py-24 relative">
            <div className="section-container">
                <Reveal className="text-center mb-16">
                    <h2 className="section-heading mb-4">{t('howItWorks.title')}</h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        {t('howItWorks.subtitle')}
                    </p>
                </Reveal>

                <div className="relative">
                    <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-4">
                        {steps.map((step, index) => (
                            <Reveal key={step.step} delay={index * 0.05} className="relative flex flex-col items-center text-center">
                                <div className="relative mb-6">
                                    <div className="w-20 h-20 rounded-full bg-secondary border border-border flex items-center justify-center relative z-10">
                                        <step.icon aria-hidden="true" className="w-8 h-8 text-primary" />
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground shadow-md">
                                        {step.step}
                                    </div>
                                </div>

                                <h3 className="text-xl font-semibold mb-3 text-foreground">{step.title}</h3>
                                <p className="text-muted-foreground text-sm max-w-xs">{step.description}</p>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
