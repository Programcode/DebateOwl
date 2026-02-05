import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const Hero = () => {
    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
            {/* Animated Background */}
            <div className="absolute inset-0 animated-grid opacity-100" />

            {/* Floating Orbs */}
            <div className="orb orb-primary w-96 h-96 -top-48 -left-48 opacity-60" />
            <div className="orb orb-accent w-[500px] h-[500px] -top-20 right-0 opacity-50" />
            <div className="orb orb-primary w-72 h-72 bottom-20 left-1/4 opacity-40" />
            <div className="orb orb-accent w-64 h-64 bottom-0 right-1/4 opacity-40" />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-background via-background/50 to-background pointer-events-none" />

            <div className="section-container relative z-10">
                <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-6"
                    >
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-sm text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            AI-Powered Debate Preparation
                        </span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
                    >
                        Win Every Debate With{" "}
                        <span className="gradient-text">AI-Powered Research</span>
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-lg md:text-xl text-muted-foreground max-w-3xl mb-10 text-balance"
                    >
                        DebateLab combines advanced AI with real-time web search to help you build
                        bulletproof cases, crush opposing arguments, and practice like a champion.
                    </motion.p>

                    {/* CTAs */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-col sm:flex-row gap-4 justify-center"
                    >
                        <a
                            href="/app"
                            className="btn-primary-gradient shimmer flex items-center justify-center gap-2 text-lg px-8 py-4"
                        >
                            <span className="relative z-10">Start Debating Free</span>
                            <ArrowRight className="w-5 h-5 relative z-10" />
                        </a>
                    </motion.div>

                    {/* Hero Visual */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                        className="mt-16 w-full max-w-4xl"
                    >
                        <div className="relative">
                            <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-accent/30 to-primary/30 rounded-2xl blur-2xl opacity-60" />
                            <div className="relative glass-card overflow-hidden rounded-2xl border border-border shadow-2xl">
                                <img
                                    src="/hero-visual.png"
                                    alt="DebateLab Interface"
                                    className="w-full h-auto"
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default Hero;
