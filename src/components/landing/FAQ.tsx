import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";

const faqs = [
    {
        question: "Does the AI hallucinate arguments?",
        answer: "We minimize hallucinations using 'Active Grounding'. By forcing the AI to use only the sources you provide (or that we find via live search), the output is strictly tied to real evidence. We also provide citations for every claim."
    },
    {
        question: "Is this cheating?",
        answer: "No. DebateLab is a research assistant and practice tool. It helps you find information and structure your thoughts faster, but you still need to present the arguments, understand the logic, and make the strategic decisions in the round."
    },
    {
        question: "Can I export my cases?",
        answer: "Yes! You can export any generated case directly to a formatted Microsoft Word (.docx) document, ready for printing or further editing at a tournament."
    },
    {
        question: "Do I need an API key?",
        answer: "You can use your own OpenAI/Google keys for unlimited usage, or use our limited free tier which provides daily credits to get you started without any setup."
    },
    {
        question: "What speech format does it use?",
        answer: "We default to the standard 4-6-6-3 Public Forum format (Constructive, Rebuttal, Summary, Final Focus), but the AI is flexible enough to adapt to Lincoln-Douglas or Policy structures via custom prompts."
    }
];

const FAQ = () => {
    return (
        <section className="py-24 bg-secondary/5">
            <div className="section-container max-w-3xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="text-center mb-12"
                >
                    <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
                    <p className="text-muted-foreground">Everything you need to know about the platform.</p>
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
                                <AccordionContent className="text-muted-foreground text-base leading-relaxed">
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
