import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";

const FinalCTA = () => {
    const { t } = useTranslation();
    const appPrefetch = useRoutePrefetch("/app");

    return (
        <section className="relative overflow-hidden py-24">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-emerald-200/20 dark:to-emerald-900/20" />
            <div className="absolute inset-0 animated-grid opacity-45" />

            <div className="orb orb-primary -top-40 left-0 h-80 w-80 opacity-55" />
            <div className="orb orb-accent -bottom-40 right-0 h-96 w-96 opacity-55" />

            <div className="section-container relative z-10">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-foreground/85">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {t('finalCta.freeTrialAvailable')}
                    </div>

                    <h2 className="section-heading">{t('finalCta.title')}</h2>

                    <p className="mt-6 text-lg text-muted-foreground md:text-xl">
                        {t('finalCta.subtitle')}
                    </p>

                    <div className="mt-10 inline-flex">
                        <Link to="/app" {...appPrefetch} className="btn-primary-gradient inline-flex items-center gap-3 px-10 py-5 text-lg">
                            <span className="relative z-10">{t('finalCta.cta')}</span>
                            <ArrowRight className="relative z-10 h-5 w-5" />
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};

export default FinalCTA;
