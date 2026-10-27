import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { localizedPath, useRouteLanguage } from "@/lib/seo/localized-routes";
import { ArrowRight, ChevronDown } from "lucide-react";
import { factsAsOf } from "@/lib/seo/pages";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

const linkClass = "inline-flex items-center gap-1.5 rounded-full border-2 border-brand-tint-border bg-brand-tint px-4 py-2 text-sm font-bold text-primary transition-colors hover:border-primary/50 pointer-coarse:min-h-11";

/**
 * The reader's main question and a short, honest answer, as the first H2 under the hero.
 * Answer engines quote this block, so it names when another tool fits better.
 * On phones the answer folds to three lines; the full text stays in the HTML.
 */
const ShortAnswer = () => {
    const { t, i18n } = useTranslation();
    const language = useRouteLanguage();
    const [expanded, setExpanded] = useState(false);

    return (
        <section aria-labelledby="short-answer" className="py-8 md:py-16">
            <div className="section-container max-w-3xl">
                <Reveal className="rounded-xl border-2 border-border bg-card p-5 md:p-8">
                    <h2 id="short-answer" className="text-balance font-display text-2xl font-[600] leading-tight text-heading md:text-3xl">{t('shortAnswer.question')}</h2>
                    <p
                        id="short-answer-text"
                        className={cn("mt-3 leading-relaxed text-muted-foreground md:mt-4 md:line-clamp-none md:text-lg", !expanded && "line-clamp-3")}
                    >
                        {t('shortAnswer.answer', { asOf: factsAsOf(i18n.language) })}
                    </p>
                    <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls="short-answer-text"
                        onClick={() => setExpanded((open) => !open)}
                        className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary md:hidden"
                    >
                        {expanded ? t('shortAnswer.less') : t('shortAnswer.more')}
                        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform duration-150", expanded && "rotate-180")} />
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2 md:mt-5">
                        {/* A static guide page, not an app route: a plain link loads it from the server. */}
                        <a href="/best-ai-debate-tools" className={linkClass}>
                            {t('shortAnswer.compare')}
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </a>
                        <Link to={localizedPath("/tools", language)} className={linkClass}>
                            {t('tools:footer.freeTools')}
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};

export default ShortAnswer;
