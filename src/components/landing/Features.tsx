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
        <section id="features" className="relative py-12 md:py-20">
            <div className="absolute inset-0 pointer-events-none">
                {/* Positioned with top, not a translate, so nothing can override it. */}
                <div className="orb orb-primary left-0 top-[calc(50%-12rem)] h-96 w-96 opacity-40" />
                <div className="orb orb-accent bottom-0 right-0 h-80 w-80 opacity-40" />
            </div>

            <div className="section-container relative z-10">
                <Reveal className="mb-8 text-center md:mb-12">
                    <h2 className="section-heading">{t('features.title')}</h2>
                </Reveal>

                {/* Phones get icon tiles, two across; the one-line description joins from sm up. */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {features.map((feature, index) => (
                        <Reveal
                            key={feature.title}
                            delay={index * 0.03}
                            // An odd last tile takes the whole row while the grid is two across.
                            className={index === features.length - 1 && features.length % 2 ? "h-full max-md:col-span-2" : "h-full"}
                        >
                            <div className="feature-card flex h-full flex-col gap-3 p-4 sm:p-5">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-tint shadow-[0_3px_0_var(--do-primary-tint-border)]">
                                    <feature.icon aria-hidden="true" className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-display text-base font-[600] leading-snug text-heading sm:text-lg">{feature.title}</h3>
                                    <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{feature.description}</p>
                                </div>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Features;
