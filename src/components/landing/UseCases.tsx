import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";
import { GraduationCap, Users, Gavel } from "lucide-react";

const UseCases = () => {
    const { t } = useTranslation();

    const personas = [
        {
            icon: GraduationCap,
            title: t('useCases.forDebaters'),
            subtitle: t('useCases.debaterSubtitle'),
            points: [t('useCases.debater1'), t('useCases.debater2'), t('useCases.debater3'), t('useCases.debater4')]
        },
        {
            icon: Users,
            title: t('useCases.forCoaches'),
            subtitle: t('useCases.coachSubtitle'),
            points: [t('useCases.coach1'), t('useCases.coach2'), t('useCases.coach3'), t('useCases.coach4')]
        },
        {
            icon: Gavel,
            title: t('useCases.forJudges'),
            subtitle: t('useCases.judgeSubtitle'),
            points: [t('useCases.judge1'), t('useCases.judge2'), t('useCases.judge3'), t('useCases.judge4')]
        }
    ];

    return (
        <section className="py-24 relative">
            <div className="section-container">
                <Reveal className="text-center mb-16">
                    <h2 className="section-heading mb-4">{t('useCases.title')}</h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        {t('useCases.description')}
                    </p>
                </Reveal>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {personas.map((persona, index) => (
                        <Reveal key={persona.title} delay={index * 0.05}>
                        <div className="feature-card h-full p-8">
                            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-6">
                                <persona.icon aria-hidden="true" className="w-7 h-7 text-primary" />
                            </div>
                            <h3 className="text-2xl font-bold mb-1">{persona.title}</h3>
                            <p className="text-primary font-medium mb-6">{persona.subtitle}</p>

                            <ul className="space-y-3">
                                {persona.points.map((point, i) => (
                                    <li key={i} className="flex items-start gap-2 text-muted-foreground text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default UseCases;
