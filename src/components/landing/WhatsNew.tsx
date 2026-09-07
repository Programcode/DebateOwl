import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Crown, GitBranch, Timer, History, Sparkles, Crosshair, Dumbbell } from "lucide-react";

const WhatsNew = () => {
    const { t } = useTranslation();

    const updates = [
        { icon: Crown, title: t('whatsNew.sub1Title'), description: t('whatsNew.sub1Desc'), badge: t('whatsNew.sub1Badge') },
        { icon: GitBranch, title: t('whatsNew.sub2Title'), description: t('whatsNew.sub2Desc'), badge: t('whatsNew.sub2Badge') },
        { icon: Timer, title: t('whatsNew.sub3Title'), description: t('whatsNew.sub3Desc'), badge: t('whatsNew.sub3Badge') },
        { icon: History, title: t('whatsNew.sub4Title'), description: t('whatsNew.sub4Desc'), badge: t('whatsNew.sub4Badge') },
        { icon: Crosshair, title: t('whatsNew.sub5Title'), description: t('whatsNew.sub5Desc'), badge: t('whatsNew.sub5Badge') },
        { icon: Dumbbell, title: t('whatsNew.sub6Title'), description: t('whatsNew.sub6Desc'), badge: t('whatsNew.sub6Badge') },
    ];

    return (
        <section id="whats-new" className="relative py-24 bg-secondary/10">
            <div className="section-container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="mb-14 text-center"
                >
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground/85">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {t('whatsNew.title')}
                    </div>
                    <h2 className="text-3xl font-bold md:text-4xl lg:text-5xl tracking-tight">
                        {t('whatsNew.title')}
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                        {t('whatsNew.subtitle')}
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {updates.map((update, index) => (
                        <motion.div
                            key={update.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45, delay: index * 0.08 }}
                            viewport={{ once: true }}
                            className="group rounded-2xl border border-border/70 bg-card/75 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                                    <update.icon className="h-5 w-5 text-primary transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100" />
                                </div>
                                <span className="rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                                    {update.badge}
                                </span>
                            </div>
                            <h3 className="text-xl font-semibold text-foreground">{update.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{update.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default WhatsNew;
