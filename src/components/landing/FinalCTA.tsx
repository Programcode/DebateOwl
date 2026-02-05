import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const FinalCTA = () => {
    return (
        <section className="py-24 relative overflow-hidden">
            {/* Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/5" />
            <div className="absolute inset-0 animated-grid opacity-50" />

            {/* Orbs */}
            <div className="orb orb-primary w-80 h-80 -top-40 left-0 opacity-50" />
            <div className="orb orb-accent w-96 h-96 -bottom-40 right-0 opacity-50" />

            <div className="section-container relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center max-w-3xl mx-auto"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-sm text-muted-foreground mb-6">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Join thousands of debaters
                    </div>

                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
                        Ready to Outprepare{" "}
                        <span className="gradient-text">Your Competition?</span>
                    </h2>

                    <p className="text-lg md:text-xl text-muted-foreground mb-10">
                        Join thousands of debaters using AI to win.
                    </p>

                    <motion.a
                        href="/app"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-3 btn-primary-gradient shimmer text-lg px-10 py-5"
                    >
                        <span className="relative z-10">Launch DebateLab</span>
                        <ArrowRight className="w-5 h-5 relative z-10" />
                    </motion.a>
                </motion.div>
            </div>
        </section>
    );
};

export default FinalCTA;
