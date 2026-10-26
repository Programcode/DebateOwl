import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import {
    BookOpen,
    Zap,
    Swords,
    Brain,
    Search,
    Database,
    MessageCircle,
    Crosshair,
    Dumbbell,
    Timer,
    GitBranch,
} from "lucide-react";

const Features = () => {
    const { t } = useTranslation();

    const features = [
        { icon: Zap, title: t('features.generate'), description: t('features.generateDesc') },
        { icon: Swords, title: t('features.attack'), description: t('features.attackDesc') },
        { icon: Brain, title: t('features.brainstorm'), description: t('features.brainstormDesc') },
        { icon: Search, title: t('features.factoids'), description: t('features.factoidsDesc') },
        { icon: MessageCircle, title: t('features.ask'), description: t('features.askDesc') },
        { icon: Crosshair, title: t('features.crossfire'), description: t('features.crossfireDesc') },
        { icon: Dumbbell, title: t('features.sparring'), description: t('features.sparringDesc') },
        { icon: Database, title: t('features.library'), description: t('features.libraryDesc') },
        { icon: Timer, title: t('features.timer'), description: t('features.timerDesc') },
        { icon: GitBranch, title: t('features.flowchart'), description: t('features.flowchartDesc') },
        { icon: BookOpen, title: t('features.history'), description: t('features.historyDesc') },
    ];

    return (
        <section id="features" className="relative py-24">
            <div className="absolute inset-0 pointer-events-none">
                {/* Positioned with top, not a translate, so nothing can override it. */}
                <div className="orb orb-primary left-0 top-[calc(50%-12rem)] h-96 w-96 opacity-40" />
                <div className="orb orb-accent bottom-0 right-0 h-80 w-80 opacity-40" />
            </div>

            <div className="section-container relative z-10">
                <Reveal className="mb-12 text-center">
                    <h2 className="section-heading">{t('features.title')}</h2>
                </Reveal>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature, index) => (
                        <Reveal key={feature.title} delay={index * 0.04}>
                            <div className="feature-card h-full">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-brand-tint shadow-[0_3px_0_var(--do-primary-tint-border)]">
                                    <feature.icon aria-hidden="true" className="h-6 w-6 text-primary" />
                                </div>
                                <h3 className="mb-2 font-display text-xl font-[600] text-heading">{feature.title}</h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Features;
