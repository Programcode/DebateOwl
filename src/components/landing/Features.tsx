import { motion } from "framer-motion";
import {
    BookOpen,
    Zap,
    Swords,
    Brain,
    Search,
    Database,
    MessageCircle,
    Timer,
    GitBranch,
} from "lucide-react";

const features = [
    {
        icon: Zap,
        title: "Generate",
        description: "Build full cases with claims, warrants, impacts, and speech-ready structure.",
    },
    {
        icon: Swords,
        title: "Attack",
        description: "Stress-test arguments with weakness detection, fallacy checks, and rebuttal angles.",
    },
    {
        icon: Brain,
        title: "Brainstorm",
        description: "Explore motion ideas with structured ideation modes for faster prep.",
    },
    {
        icon: Search,
        title: "Factoids",
        description: "Run deep research with source checks and evidence snippets for your case files.",
    },
    {
        icon: MessageCircle,
        title: "Ask Coach",
        description: "Chat through strategy, cross-ex plans, and speaking choices with context memory.",
    },
    {
        icon: Database,
        title: "Source Library",
        description: "Save and activate sources so AI outputs stay grounded in your own research.",
    },
    {
        icon: Timer,
        title: "Debate Timer",
        description: "Practice speech pacing with multiple debate formats and keyboard controls.",
    },
    {
        icon: GitBranch,
        title: "Flowchart",
        description: "Map argument trees visually and export your round strategy board.",
    },
    {
        icon: BookOpen,
        title: "History",
        description: "Reopen saved cases, chats, attacks, and factoids whenever you need them.",
    },
];

const Features = () => {
    return (
        <section id="features" className="relative py-24">
            <div className="absolute inset-0 pointer-events-none">
                <div className="orb orb-primary left-0 top-1/2 h-96 w-96 -translate-y-1/2 opacity-40" />
                <div className="orb orb-accent bottom-0 right-0 h-80 w-80 opacity-40" />
            </div>

            <div className="section-container relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="mb-16 text-center"
                >
                    <h2 className="text-3xl font-bold md:text-4xl lg:text-5xl">
                        Every Core Tool In <span className="gradient-text">One Workspace</span>
                    </h2>
                    <p className="mx-auto mt-4 max-w-3xl text-lg text-muted-foreground">
                        Generate, attack, research, coach, and practice without jumping between disconnected apps.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.06 }}
                            viewport={{ once: true }}
                            className="feature-card group"
                        >
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-colors group-hover:border-primary/40">
                                <feature.icon className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="mb-2 text-xl font-semibold text-foreground">{feature.title}</h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Features;
