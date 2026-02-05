import { motion } from "framer-motion";
import { FileSearch, Sparkles, Trophy } from "lucide-react";

const steps = [
    {
        icon: FileSearch,
        step: "01",
        title: "Research",
        description: "Paste URLs or describe your topic and DebateLab reads and indexes everything.",
    },
    {
        icon: Sparkles,
        step: "02",
        title: "Generate",
        description: "Create cases, counterarguments, and rebuttals powered by your sources.",
    },
    {
        icon: Trophy,
        step: "03",
        title: "Practice",
        description: "Spar with the AI coach, export your winning case, and dominate.",
    },
];

const HowItWorks = () => {
    return (
        <section id="how-it-works" className="py-24 relative">
            <div className="section-container">
                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                        How It <span className="gradient-text">Works</span>
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        Three simple steps to debate domination
                    </p>
                </motion.div>

                {/* Steps */}
                <div className="relative">
                    {/* Connection Line */}
                    <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-4">
                        {steps.map((step, index) => (
                            <motion.div
                                key={step.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: index * 0.15 }}
                                viewport={{ once: true }}
                                className="relative flex flex-col items-center text-center"
                            >
                                {/* Step Number Circle */}
                                <div className="relative mb-6">
                                    <div className="w-20 h-20 rounded-full bg-secondary border border-border flex items-center justify-center relative z-10">
                                        <step.icon className="w-8 h-8 text-primary" />
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
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
