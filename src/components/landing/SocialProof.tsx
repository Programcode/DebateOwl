import { motion } from "framer-motion";

const SocialProof = () => {
    return (
        <section className="py-12 relative overflow-hidden">
            <div className="section-container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center"
                >
                    <p className="text-muted-foreground text-sm md:text-base mb-8">
                        Built for competitive debaters at tournaments worldwide
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-50">
                        {["Harvard", "Stanford", "Yale", "Princeton", "MIT", "Berkeley"].map((name, index) => (
                            <motion.div
                                key={name}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: index * 0.1 }}
                                viewport={{ once: true }}
                                className="text-lg md:text-xl font-semibold text-muted-foreground"
                            >
                                {name}
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default SocialProof;
