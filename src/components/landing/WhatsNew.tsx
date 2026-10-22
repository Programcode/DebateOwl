import { useTranslation } from "react-i18next";
import { Crown, GitBranch, Timer, History, Crosshair, Dumbbell } from "lucide-react";
import { Reveal } from "./Reveal";

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
                <Reveal className="mb-14 text-center">
                    <h2 className="section-heading">{t('whatsNew.title')}</h2>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                        {t('whatsNew.subtitle')}
                    </p>
                </Reveal>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {updates.map((update, index) => (
                        <Reveal key={update.title} delay={index * 0.05}>
                            <div className="h-full rounded-2xl border border-border/70 bg-card p-6 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-lg">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                                        <update.icon aria-hidden="true" className="h-5 w-5 text-primary" />
                                    </div>
                                    <span className="rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {update.badge}
                                    </span>
                                </div>
                                <h3 className="text-xl font-semibold text-foreground">{update.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{update.description}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default WhatsNew;
