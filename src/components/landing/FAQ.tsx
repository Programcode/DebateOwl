import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";

const faqs = [
    {
        question: "How much does DebateLab cost?",
        answer: "DebateLab starts with a 3-day trial that includes 5 AI requests per day. After the trial, Pro is $5/month + tax and increases usage to 50 requests per day with advanced model access."
    },
    {
        question: "What do I get with Pro?",
        answer: "Pro unlocks advanced models (including GPT-4o, Claude, and Gemini Pro options), higher daily limits, deep research workflows, and priority processing while keeping all core debate tools in one place."
    },
    {
        question: "Can I cancel or manage my subscription?",
        answer: "Yes. After signing in, go to Settings and open the subscription section to manage billing through the Stripe customer portal."
    },
    {
        question: "Does the AI hallucinate arguments?",
        answer: "DebateLab reduces hallucinations by grounding output in your active source library and research context. You can keep your strongest evidence active so generated responses stay anchored to your prep."
    },
    {
        question: "Can I save and export my work?",
        answer: "Yes. You can save cases, attacks, brainstorms, factoids, and chats in History, then export generated cases to Word when you need a print-ready draft."
    }
];

const FAQ = () => {
    return (
        <section className="bg-secondary/5 py-24">
            <div className="section-container max-w-3xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="mb-12 text-center"
                >
                    <h2 className="mb-4 text-3xl font-bold">Frequently Asked Questions</h2>
                    <p className="text-muted-foreground">Pricing, workflow, and product details at a glance.</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    viewport={{ once: true }}
                >
                    <Accordion type="single" collapsible className="w-full">
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`}>
                                <AccordionTrigger className="text-left text-lg">{faq.question}</AccordionTrigger>
                                <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </motion.div>
            </div>
        </section>
    );
};

export default FAQ;
