import { motion } from "framer-motion";
import { GraduationCap, Users, Gavel } from "lucide-react";

const personas = [
    {
        icon: GraduationCap,
        title: "For Debaters",
        subtitle: "Cut Prep Time in Half",
        points: [
            "Generate cases in minutes, not hours",
            "Practice speeches while commuting",
            "Never get caught without a definition",
            "Build a personal evidence library"
        ]
    },
    {
        icon: Users,
        title: "For Coaches",
        subtitle: "Scale Your Feedback",
        points: [
            "Review student cases instantly",
            "Generate practice topics on the fly",
            "Focus on strategy instead of formatting",
            "Track research progress effortlessly"
        ]
    },
    {
        icon: Gavel,
        title: "For Judges",
        subtitle: "Deepen Your Analysis",
        points: [
            "Understand complex topic literature",
            "Spot logical fallacies in real-time",
            "Check sourcing accuracy quickly",
            "Write better ballots with clear reasoning"
        ]
    }
];

const UseCases = () => {
    return (
        <section className="py-24 relative">
            <div className="section-container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        Built for <span className="gradient-text">Every Role</span>
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        Whether you are competing, coaching, or judging, DebateLab gives you the edge.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {personas.map((persona, index) => (
                        <motion.div
                            key={persona.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1, duration: 0.5 }}
                            viewport={{ once: true }}
                            className="glass-card p-8 rounded-2xl border border-border feature-card"
                        >
                            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-6">
                                <persona.icon className="w-7 h-7 text-primary" />
                            </div>
                            <h3 className="text-2xl font-bold mb-1">{persona.title}</h3>
                            <p className="text-accent font-medium mb-6">{persona.subtitle}</p>

                            <ul className="space-y-3">
                                {persona.points.map((point, i) => (
                                    <li key={i} className="flex items-start gap-2 text-muted-foreground text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default UseCases;
