import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { PREP_MODE_COUNT } from "@/components/features/tools/tool-links";
import { factsAsOf } from "@/lib/seo/pages";
import { Reveal } from "./Reveal";

const FAQ = () => {
    const { t, i18n } = useTranslation();
    const asOf = factsAsOf(i18n.language);

    const faqs = [
        { question: t('faq.q6'), answer: t('faq.a6', { modes: PREP_MODE_COUNT }) },
        { question: t('faq.q7'), answer: t('faq.a7') },
        { question: t('faq.q1'), answer: t('faq.a1', { asOf }) },
        { question: t('faq.q2'), answer: t('faq.a2') },
        { question: t('faq.q3'), answer: t('faq.a3') },
        { question: t('faq.q4'), answer: t('faq.a4') },
        { question: t('faq.q5'), answer: t('faq.a5') },
    ];

    return (
        <section id="faq" aria-labelledby="faq-title" className="bg-secondary/5 py-24">
            <div className="section-container max-w-3xl">
                <Reveal className="mb-12 text-center">
                    <h2 id="faq-title" className="section-heading mb-4">{t('faq.title')}</h2>
                    <p className="text-muted-foreground">{t('faq.subtitle')}</p>
                </Reveal>

                {/* Native disclosure: closed answers stay in the HTML, so crawlers and find-in-page see them. */}
                <Reveal delay={0.05}>
                    {faqs.map((faq) => (
                        <details key={faq.question} className="group border-b">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 text-left text-lg font-medium transition-colors duration-150 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                                {faq.question}
                                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform duration-150 ease-out-strong group-open:rotate-180" />
                            </summary>
                            <p className="pb-4 text-base leading-relaxed text-muted-foreground">{faq.answer}</p>
                        </details>
                    ))}
                </Reveal>
            </div>
        </section>
    );
};

export default FAQ;
