import { motion } from "framer-motion";

const proofItems = [
    { value: "9", label: "Prep Modes" },
    { value: "2", label: "Plans (Trial + Pro)" },
    { value: "3", label: "Major 2026 Upgrades" },
    { value: "1", label: "Unified Workspace" },
];

const SocialProof = () => {
    return (
        <section className="relative overflow-hidden py-12">
            <div className="section-container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center"
                >
                    <p className="mb-7 text-sm text-muted-foreground md:text-base">
                        One platform for research, strategy, rebuttals, and speaking practice.
                    </p>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                        {proofItems.map((item, index) => (
                            <motion.div
                                key={item.label}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, delay: index * 0.06 }}
                                viewport={{ once: true }}
                                className="rounded-xl border border-border/70 bg-card/70 px-4 py-4"
                            >
                                <div className="text-2xl font-bold text-foreground">{item.value}</div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default SocialProof;
