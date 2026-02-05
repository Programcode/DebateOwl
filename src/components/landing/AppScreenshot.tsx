import { motion } from "framer-motion";

const AppScreenshot = () => {
    return (
        <section className="py-24 relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="orb orb-accent w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30" />
            </div>

            <div className="section-container relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-12"
                >
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                        Your AI Debate Partner, <span className="gradient-text">Ready 24/7</span>
                    </h2>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.7 }}
                    viewport={{ once: true }}
                    className="max-w-5xl mx-auto"
                >
                    <div className="relative">
                        {/* Glow effect */}
                        <div className="absolute -inset-4 md:-inset-8 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-3xl blur-3xl opacity-60" />

                        {/* Screenshot container */}
                        <div className="relative glass-card overflow-hidden rounded-2xl border border-border shadow-2xl p-2">
                            <div className="rounded-xl overflow-hidden">
                                <img
                                    src="/hero-visual.png"
                                    alt="DebateLab App Interface"
                                    className="w-full h-auto"
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default AppScreenshot;
