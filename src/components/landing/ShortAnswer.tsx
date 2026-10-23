import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { factsAsOf } from "@/lib/seo/pages";
import { Reveal } from "./Reveal";

/**
 * The reader's main question and a short, honest answer, as the first H2 under the hero.
 * Answer engines quote this block, so it names when another tool fits better.
 */
const ShortAnswer = () => {
    const { t, i18n } = useTranslation();

    return (
        <section aria-labelledby="short-answer" className="py-20">
            <div className="section-container max-w-3xl">
                <Reveal>
                    <h2 id="short-answer" className="section-heading mb-5">{t('shortAnswer.question')}</h2>
                    <p className="text-lg leading-relaxed text-muted-foreground">
                        {t('shortAnswer.answer', { asOf: factsAsOf(i18n.language) })}
                    </p>
                    {/* A static guide page, not an app route: a plain link loads it from the server. */}
                    <a
                        href="/best-ai-debate-tools"
                        className="mt-5 inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
                    >
                        {t('shortAnswer.compare')}
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </a>
                    <p className="mt-4 text-muted-foreground">
                        {t('tools:home.freeTools')}{' '}
                        <Link
                            to="/tools"
                            className="inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
                        >
                            {t('tools:footer.freeTools')}
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                    </p>
                </Reveal>
            </div>
        </section>
    );
};

export default ShortAnswer;
