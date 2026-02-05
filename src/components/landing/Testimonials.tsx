import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const testimonials = [
    {
        quote: "DebateLab helped me cut my research time in half and win regionals.",
        author: "Alex Chen",
        role: "Student Debater",
    },
    {
        quote: "The argument attack feature is brutal — exactly what my students need.",
        author: "Dr. Sarah Mitchell",
        role: "Debate Coach",
    },
    {
        quote: "Finally, an AI tool built specifically for competitive debate.",
        author: "James Rodriguez",
        role: "Tournament Organizer",
    },
];

const Testimonials = () => {
    return (
        <section id="testimonials" className="py-24 relative">
            <div className="absolute inset-0 pointer-events-none">
                <div className="orb orb-primary w-72 h-72 top-0 right-1/4 opacity-30" />
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
                        Trusted by <span className="gradient-text">Champions</span>
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        See what debaters are saying about DebateLab
                    </p>
                </motion.div>

                {/* Testimonials Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {testimonials.map((testimonial, index) => (
                        <motion.div
                            key={testimonial.author}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            viewport={{ once: true }}
                            className="glass-card p-6 relative"
                        >
                            <Quote className="w-8 h-8 text-primary/30 absolute top-4 right-4" />
                            <p className="text-foreground text-lg mb-6 leading-relaxed">
                                "{testimonial.quote}"
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                                    {testimonial.author.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground">{testimonial.author}</p>
                                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Testimonials;
