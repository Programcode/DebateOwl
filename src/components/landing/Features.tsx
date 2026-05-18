import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
    BookOpen,
    Zap,
    Swords,
    Brain,
    Search,
    Database,
    MessageCircle,
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
        { icon: Database, title: t('features.library'), description: t('features.libraryDesc') },
        { icon: Timer, title: t('features.timer'), description: t('features.timerDesc') },
        { icon: GitBranch, title: t('features.flowchart'), description: t('features.flowchartDesc') },
        { icon: BookOpen, title: t('features.history'), description: t('features.historyDesc') },
    ];

    return (
        <section id="features" className="relative py-24">
            <div className="absolute inset-0 pointer-events-none">
                <div className="orb orb-primary left-0 top-1/2 h-96 w-96 -translate-y-1/2 opacity-40" />
                <div className="orb orb-accent bottom-0 right-0 h-80 w-80 opacity-40" />
            </div>

            <div className="section-container relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="mb-16 text-center"
                >
                    <h2 className="text-3xl font-bold md:text-4xl lg:text-5xl">
                        {t('features.title')}
                    </h2>
                    <p className="mx-auto mt-4 max-w-3xl text-lg text-muted-foreground">
                        {t('features.subtitle')}
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.06 }}
                            viewport={{ once: true }}
                            className="feature-card group"
                        >
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-colors group-hover:border-primary/40">
                                <feature.icon className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="mb-2 text-xl font-semibold text-foreground">{feature.title}</h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Features;
