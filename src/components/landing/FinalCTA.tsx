import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const FinalCTA = () => {
    const { t } = useTranslation();

    return (
        <section className="relative overflow-hidden py-24">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-emerald-200/20 dark:to-emerald-900/20" />
            <div className="absolute inset-0 animated-grid opacity-45" />

            <div className="orb orb-primary -top-40 left-0 h-80 w-80 opacity-55" />
            <div className="orb orb-accent -bottom-40 right-0 h-96 w-96 opacity-55" />

            <div className="section-container relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="mx-auto max-w-3xl text-center"
                >
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground/85">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {t('finalCta.freeTrialAvailable')}
                    </div>

                    <h2 className="text-3xl font-bold md:text-4xl lg:text-5xl">
                        {t('finalCta.title')}
                    </h2>

                    <p className="mt-6 text-lg text-muted-foreground md:text-xl">
                        {t('finalCta.subtitle')}
                    </p>

                    <motion.a
                        href="/app"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="btn-primary-gradient shimmer mt-10 inline-flex items-center gap-3 px-10 py-5 text-lg"
                    >
                        <span className="relative z-10">{t('finalCta.cta')}</span>
                        <ArrowRight className="relative z-10 h-5 w-5" />
                    </motion.a>
                </motion.div>
            </div>
        </section>
    );
};

export default FinalCTA;
