import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";

const plans = [
    {
        name: "Free",
        description: "Get started with limited AI calls",
        price: "$0",
        period: "forever",
        features: [
            "Basic AI research assistant",
            "5 case generations per month",
            "Limited source library",
            "Community support",
        ],
        cta: "Start Free",
        featured: false,
    },
    {
        name: "Pro",
        description: "Unlimited research, exports, and coaching",
        price: "$19",
        period: "/month",
        features: [
            "Unlimited AI interactions",
            "Unlimited case generation",
            "Full source library",
            "AI Coach with voice input",
            "Export to Word",
            "Priority support",
        ],
        cta: "Start Pro Trial",
        featured: true,
    },
];

const Pricing = () => {
    return (
        <section id="pricing" className="py-24 relative">
            <div className="section-container">
                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                        Simple, <span className="gradient-text">Transparent</span> Pricing
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        Start free, no credit card required
                    </p>
                </motion.div>

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                    {plans.map((plan, index) => (
                        <motion.div
                            key={plan.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            viewport={{ once: true }}
                            className={`relative glass-card p-8 ${plan.featured ? "border-primary/50" : ""
                                }`}
                        >
                            {plan.featured && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary rounded-full text-xs font-semibold text-primary-foreground">
                                    Most Popular
                                </div>
                            )}

                            <div className="mb-6">
                                <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
                                <p className="text-muted-foreground text-sm">{plan.description}</p>
                            </div>

                            <div className="mb-6">
                                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                                <span className="text-muted-foreground ml-1">{plan.period}</span>
                            </div>

                            <ul className="space-y-3 mb-8">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            <a
                                href="/app"
                                className={`w-full flex items-center justify-center gap-2 ${plan.featured
                                        ? "btn-primary-gradient shimmer"
                                        : "btn-secondary-outline"
                                    }`}
                            >
                                <span className="relative z-10">{plan.cta}</span>
                                <ArrowRight className="w-4 h-4 relative z-10" />
                            </a>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Pricing;
