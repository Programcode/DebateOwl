import { motion } from "framer-motion";
import { Database, ScanSearch, Sparkles, Network } from "lucide-react";

const steps = [
    {
        icon: ScanSearch,
        title: "1. AI Scanning",
        description: "We use Jina AI to read and index every URL you save, extracting clean text without clutter.",
    },
    {
        icon: Database,
        title: "2. Knowledge Base",
        description: "Your research is stored in a structured vector database, creating a personal library of facts.",
    },
    {
        icon: Network,
        title: "3. Context Injection",
        description: "Relevant evidence is automatically retrieved and injected into the AI's context window.",
    },
    {
        icon: Sparkles,
        title: "4. Grounded Output",
        description: "The AI generates arguments that strictly adhere to your evidence, reducing hallucinations.",
    },
];

const DeepDive = () => {
    return (
        <section className="py-24 relative overflow-hidden bg-secondary/5">
            <div className="section-container relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    {/* Text Content */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-3xl md:text-4xl font-bold mb-6">
                            Not Just Another Wrapper.<br />
                            <span className="gradient-text">Active Grounding™ Technology.</span>
                        </h2>
                        <p className="text-lg text-muted-foreground mb-8">
                            Most AI tools just guess. DebateLab actively reads your sources.
                            Our deep integration with Jina AI ensures that every argument is backed by the evidence you provide.
                        </p>

                        <div className="space-y-6">
                            {steps.map((step, index) => (
                                <motion.div
                                    key={step.title}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1, duration: 0.4 }}
                                    viewport={{ once: true }}
                                    className="flex gap-4"
                                >
                                    <div className="mt-1 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <step.icon className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground">{step.title}</h3>
                                        <p className="text-sm text-muted-foreground">{step.description}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Visual/Graphic */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6 }}
                        viewport={{ once: true }}
                        className="relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-accent/20 blur-3xl rounded-full opacity-40" />
                        <div className="glass-card p-8 rounded-2xl border border-border/50 relative">
                            <div className="space-y-4 font-mono text-sm max-h-[400px] overflow-hidden opacity-90">
                                <div className="text-muted-foreground">// Real-time Context Process</div>
                                <div className="flex gap-2">
                                    <span className="text-green-500">➜</span>
                                    <span>Scanning https://news.example.com...</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-green-500">➜</span>
                                    <span>Extracted 1,402 tokens of clean text</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-blue-500">➜</span>
                                    <span>Vectorizing content into Knowledge Base...</span>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded border border-border/50 my-2">
                                    <span className="text-accent">User Query: "Impact on economy?"</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-purple-500">➜</span>
                                    <span>Retrieved 3 relevant evidence chunks</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-purple-500">➜</span>
                                    <span>Generating grounded response...</span>
                                </div>
                                <div className="p-3 bg-primary/10 rounded border border-primary/20 text-foreground">
                                    "Based on the provided article, the economic impact is estimated at..."
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default DeepDive;
