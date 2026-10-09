import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { Database, ScanSearch, Sparkles, Network } from "lucide-react";

const DeepDive = () => {
    const { t } = useTranslation();

    const steps = [
        { icon: ScanSearch, title: t('deepDive.step1'), description: t('deepDive.step1Desc') },
        { icon: Database, title: t('deepDive.step2'), description: t('deepDive.step2Desc') },
        { icon: Network, title: t('deepDive.step3'), description: t('deepDive.step3Desc') },
        { icon: Sparkles, title: t('deepDive.step4'), description: t('deepDive.step4Desc') },
    ];

    return (
        <section className="py-24 relative overflow-hidden bg-secondary/5">
            <div className="section-container relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <Reveal>
                        <h2 className="section-heading mb-6">{t('deepDive.title')}</h2>
                        <p className="text-lg text-muted-foreground mb-8">
                            {t('deepDive.subtitle')}
                        </p>

                        <div className="space-y-6">
                            {steps.map((step, index) => (
                                <Reveal key={step.title} delay={index * 0.05} className="flex gap-4">
                                    <div className="mt-1 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <step.icon className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground">{step.title}</h3>
                                        <p className="text-sm text-muted-foreground">{step.description}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </Reveal>

                    <Reveal delay={0.05} className="relative">
                        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-accent/20 blur-3xl rounded-full opacity-40" />
                        <div className="glass-card p-8 rounded-2xl border border-border/50 relative overflow-hidden">
                            <div className="space-y-4 font-mono text-sm max-h-[400px] overflow-hidden opacity-90">
                                <div className="text-muted-foreground">{t('deepDive.preview.processHeading')}</div>
                                <div className="flex gap-2">
                                    <span className="text-green-500">➜</span>
                                    <span>{t('deepDive.preview.scanning')}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-green-500">➜</span>
                                    <span>{t('deepDive.preview.extracted')}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-blue-500">➜</span>
                                    <span>{t('deepDive.preview.vectorizing')}</span>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded border border-border/50 my-2">
                                    <span className="text-foreground">{t('deepDive.preview.query')}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-cyan-500">➜</span>
                                    <span>{t('deepDive.preview.retrieved')}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-cyan-500">➜</span>
                                    <span>{t('deepDive.preview.generating')}</span>
                                </div>
                                <div className="p-3 bg-primary/10 rounded border border-primary/20 text-foreground">
                                    {t('deepDive.preview.response')}
                                </div>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    );
};

export default DeepDive;
