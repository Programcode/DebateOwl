import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { localizedPath, useRouteLanguage } from "@/lib/seo/localized-routes";
import { Reveal } from "./Reveal";

/**
 * Links from the landing page to the public guides and free tools, so crawlers
 * and readers reach them from the home page. Each link is a page in the sitemap;
 * scripts/check-links.mjs fails the build when the home page links to too few.
 */
const GROUPS = [
    { id: "practice", paths: ["/ai-debate-practice", "/ai-debate-case-generator", "/ai-rebuttal-generator", "/ai-debate-coach", "/debate-evidence-finder"] },
    { id: "formats", paths: ["/public-forum-debate", "/lincoln-douglas-debate", "/policy-debate", "/british-parliamentary-debate", "/world-schools-debate", "/congress-debate"] },
    { id: "skills", paths: ["/how-to-write-a-debate-case", "/how-to-practice-rebuttals", "/debate-clash-points", "/debate-fallacies", "/debate-judge-adaptation", "/how-to-prepare-for-a-debate-tournament"] },
    { id: "tools", paths: ["/tools", "/tools/debate-timer", "/tools/debate-motion-generator", "/tools/debate-flow-sheet", "/tools/speech-time-calculator"] },
    { id: "compare", paths: ["/best-ai-debate-tools", "/best-ai-for-debate", "/debateowl-vs-chatgpt", "/debateowl-vs-debate-ladder", "/free-vs-paid-ai-debate-tools", "/chatgpt-vs-claude-for-debate", "/best-ai-for-public-forum"] },
] as const;

const TOOLS = GROUPS.find((group) => group.id === "tools")!;
const chipClass = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-brand-tint-border hover:text-primary pointer-coarse:min-h-11";
/** One sideways-scrolling row of chips per group on phones; the chips wrap from md up. */
const chipRowClass = "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0";

const HubHeading = () => {
    const { t } = useTranslation();
    return (
        <Reveal className="mb-8 text-center md:mb-10">
            <h2 id="guide-hub-title" className="section-heading">{t('guideHub.title')}</h2>
            <p className="mx-auto mt-4 hidden max-w-2xl text-lg text-muted-foreground md:block">{t('guideHub.subtitle')}</p>
        </Reveal>
    );
};

/**
 * /hu and /es: the guides are in English, so only the free tools show, at their
 * addresses in that language, plus one link to the English guides on the home page.
 */
const TranslatedToolsHub = ({ language }: { language: "hu" | "es" }) => {
    const { t } = useTranslation();
    return (
        <section aria-labelledby="guide-hub-title" className="py-12 md:py-20">
            <div className="section-container">
                <HubHeading />

                <Reveal delay={0.05} className="mx-auto max-w-2xl">
                    <nav aria-labelledby="guide-hub-tools">
                        <h3 id="guide-hub-tools" className="mb-3 font-display text-lg font-[600] text-heading">{t('guideHub.tools')}</h3>
                        <ul className={chipRowClass}>
                            {TOOLS.paths.map((path) => (
                                <li key={path} className="shrink-0">
                                    <Link to={localizedPath(path, language)} className={chipClass}>{t(`guideHub.links.${path.slice(1)}`)}</Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                    {/* The English home page lists every guide; a plain link loads it from the server. */}
                    <p className="mt-5 flex flex-col items-start gap-2">
                        {language === "hu" && (
                            <a href="/hu/mi-vitafelkeszules" hrefLang="hu" className="inline-flex items-center font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11">{t('guideHub.hungarianPrep')}</a>
                        )}
                        <a href="/#guide-hub-title" hrefLang="en" className="inline-flex items-center font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11">{t('guideHub.englishGuides')}</a>
                    </p>
                </Reveal>
            </div>
        </section>
    );
};

const GuideHub = () => {
    const { t } = useTranslation();
    const language = useRouteLanguage();
    if (language !== "en") return <TranslatedToolsHub language={language} />;

    return (
        <section aria-labelledby="guide-hub-title" className="py-12 md:py-20">
            <div className="section-container">
                <HubHeading />

                <Reveal delay={0.05} className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
                    {GROUPS.map((group) => (
                        <nav key={group.id} aria-labelledby={`guide-hub-${group.id}`}>
                            <h3 id={`guide-hub-${group.id}`} className="mb-3 font-display text-lg font-[600] text-heading">{t(`guideHub.${group.id}`)}</h3>
                            <ul className={chipRowClass}>
                                {group.paths.map((path) => (
                                    <li key={path} className="shrink-0">
                                        {/* Static pages, not app routes: a plain link loads each from the server. */}
                                        <a href={path} className={chipClass}>
                                            {t(`guideHub.links.${path.slice(1)}`)}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    ))}
                </Reveal>
            </div>
        </section>
    );
};

export default GuideHub;
