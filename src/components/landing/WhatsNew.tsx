import { motion } from "framer-motion";
import { Crown, GitBranch, Timer, History, Sparkles } from "lucide-react";

const updates = [
    {
        icon: Crown,
        title: "Subscription Tiers",
        description: "New trial and Pro plans with usage limits, Stripe checkout, and in-app billing management.",
        badge: "Billing",
    },
    {
        icon: GitBranch,
        title: "Argument Flowcharts",
        description: "Build visual argument maps with linked nodes, saved diagrams, and export support.",
        badge: "New Tool",
    },
    {
        icon: Timer,
        title: "Upgraded Timer",
        description: "Practice across Standard, LD, PF, and Policy formats with keyboard shortcuts and alerts.",
        badge: "Improved",
    },
    {
        icon: History,
        title: "Saved Prep History",
        description: "Quickly reload previous cases, chats, attacks, brainstorms, and fact-check sessions.",
        badge: "Productivity",
    },
];

const WhatsNew = () => {
    return (
        <section id="whats-new" className="relative py-24 bg-secondary/10">
            <div className="section-container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="mb-14 text-center"
                >
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground/85">
                        <Sparkles className="h-4 w-4 text-primary" />
                        What&apos;s New
                    </div>
                    <h2 className="text-3xl font-bold md:text-4xl lg:text-5xl">
                        Shipped Recently for <span className="gradient-text">2026</span>
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                        The latest release focuses on monetization, better prep workflows, and cleaner round practice.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {updates.map((update, index) => (
                        <motion.div
                            key={update.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45, delay: index * 0.08 }}
                            viewport={{ once: true }}
                            className="rounded-2xl border border-border/70 bg-card/75 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                                    <update.icon className="h-5 w-5 text-primary" />
                                </div>
                                <span className="rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {update.badge}
                                </span>
                            </div>
                            <h3 className="text-xl font-semibold text-foreground">{update.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{update.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default WhatsNew;
