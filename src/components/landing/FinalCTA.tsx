import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";

const FinalCTA = () => {
    const { t } = useTranslation();
    const appPrefetch = useRoutePrefetch("/app");

    return (
        <section className="relative overflow-hidden py-14 md:py-24">
            <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-secondary/10 to-[rgb(255_196_20/0.14)]" />
            <div className="absolute inset-0 animated-grid opacity-45" />

            <div className="orb orb-primary -top-40 left-0 h-80 w-80 opacity-55" />
            <div className="orb orb-accent -bottom-40 right-0 h-96 w-96 opacity-55" />

            <div className="section-container relative z-10">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <h2 className="section-heading">{t('finalCta.title')}</h2>

                    <div className="mt-8 flex justify-center">
                        <Link to="/app" {...appPrefetch} className="btn-primary-gradient inline-flex w-full items-center justify-center gap-3 px-10 py-4 text-lg sm:w-auto md:py-5">
                            <span className="relative z-10">{t('finalCta.cta')}</span>
                            <ArrowRight aria-hidden="true" className="relative z-10 h-5 w-5" />
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};

export default FinalCTA;
