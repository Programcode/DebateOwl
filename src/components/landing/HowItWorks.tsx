import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { FileSearch, Sparkles, Trophy } from "lucide-react";

const HowItWorks = () => {
    const { t } = useTranslation();

    const steps = [
        { icon: FileSearch, step: "01", title: t('howItWorks.step1Title'), description: t('howItWorks.step1Desc') },
        { icon: Sparkles, step: "02", title: t('howItWorks.step2Title'), description: t('howItWorks.step2Desc') },
        { icon: Trophy, step: "03", title: t('howItWorks.step3Title'), description: t('howItWorks.step3Desc') },
    ];

    return (
        <section id="how-it-works" className="py-24 relative">
            <div className="section-container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 tracking-tight">
                        {t('howItWorks.title')}
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        {t('howItWorks.subtitle')}
                    </p>
                </motion.div>

                <div className="relative">
                    <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-4">
                        {steps.map((step, index) => (
                            <motion.div
                                key={step.step}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: index * 0.15 }}
                                viewport={{ once: true }}
                                className="relative flex flex-col items-center text-center"
                            >
                                <div className="relative mb-6">
                                    <div className="w-20 h-20 rounded-full bg-secondary border border-border flex items-center justify-center relative z-10 transition-transform duration-300 hover:scale-110 motion-reduce:hover:scale-100">
                                        <step.icon className="w-8 h-8 text-primary" />
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground shadow-md">
                                        {step.step}
                                    </div>
                                </div>

                                <h3 className="text-xl font-semibold mb-3 text-foreground">{step.title}</h3>
                                <p className="text-muted-foreground text-sm max-w-xs">{step.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
