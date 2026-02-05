import { motion } from "framer-motion";
import { BookOpen, Zap, Target, Brain, Search, Scale } from "lucide-react";

const features = [
    {
        icon: BookOpen,
        title: "Source Library",
        description: "Save URLs, snippets, and AI responses to build your personal knowledge base. Active sources get injected into every AI interaction.",
    },
    {
        icon: Zap,
        title: "Case Generator",
        description: "Generate tournament-ready cases in the 4-6-6-3 speech format. Export directly to Word with one click.",
    },
    {
        icon: Target,
        title: "Argument Attack",
        description: "Get ruthless critiques of any argument. Detect logical fallacies and weak points before your opponent does.",
    },
    {
        icon: Brain,
        title: "AI Coach",
        description: "Practice with an interactive coach that remembers your conversation and adapts to your style. Supports voice input.",
    },
    {
        icon: Search,
        title: "Deep Research",
        description: "Multi-round web search powered by Jina AI. The AI refines queries automatically to find the best evidence.",
    },
    {
        icon: Scale,
        title: "Judge Paradigms",
        description: "Test your arguments against different judge styles including Logic-Heavy, Values-Focused, or Policy-based.",
    },
];

const Features = () => {
    return (
        <section id="features" className="py-24 relative">
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="orb orb-primary w-96 h-96 top-1/2 left-0 -translate-y-1/2 opacity-40" />
                <div className="orb orb-accent w-80 h-80 bottom-0 right-0 opacity-40" />
            </div>

            <div className="section-container relative z-10">
                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                        Everything You Need to{" "}
                        <span className="gradient-text">Dominate</span>
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        Powerful tools designed specifically for competitive debaters
                    </p>
                </motion.div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            viewport={{ once: true }}
                            className="feature-card group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:border-primary/40 transition-colors">
                                <feature.icon className="w-6 h-6 text-primary" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-foreground">{feature.title}</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Features;
