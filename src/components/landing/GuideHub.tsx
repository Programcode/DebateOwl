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
    { id: "compare", paths: ["/best-ai-debate-tools", "/debateowl-vs-chatgpt"] },
] as const;

const TOOLS = GROUPS.find((group) => group.id === "tools")!;
const linkClass = "inline-flex text-muted-foreground underline-offset-4 hover:text-primary hover:underline pointer-coarse:min-h-11 pointer-coarse:items-center";

/**
 * /hu and /es: the guides are in English, so only the free tools show, at their
 * addresses in that language, plus one link to the English guides on the home page.
 */
const TranslatedToolsHub = ({ language }: { language: "hu" | "es" }) => {
    const { t } = useTranslation();
    return (
        <section aria-labelledby="guide-hub-title" className="py-24">
            <div className="section-container">
                <Reveal className="mb-12 text-center">
                    <h2 id="guide-hub-title" className="section-heading mb-4">{t('guideHub.title')}</h2>
                    <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('guideHub.subtitle')}</p>
                </Reveal>

                <Reveal delay={0.05} className="mx-auto max-w-md">
                    <nav aria-labelledby="guide-hub-tools">
                        <h3 id="guide-hub-tools" className="mb-3 font-semibold">{t('guideHub.tools')}</h3>
                        <ul className="space-y-2">
                            {TOOLS.paths.map((path) => (
                                <li key={path}>
                                    <Link to={localizedPath(path, language)} className={linkClass}>{t(`guideHub.links.${path.slice(1)}`)}</Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                    {/* The English home page lists every guide; a plain link loads it from the server. */}
                    <p className="mt-6">
                        <a href="/#guide-hub-title" hrefLang="en" className={linkClass}>{t('guideHub.englishGuides')}</a>
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
        <section aria-labelledby="guide-hub-title" className="py-24">
            <div className="section-container">
                <Reveal className="mb-12 text-center">
                    <h2 id="guide-hub-title" className="section-heading mb-4">{t('guideHub.title')}</h2>
                    <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('guideHub.subtitle')}</p>
                </Reveal>

                <Reveal delay={0.05} className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
                    {GROUPS.map((group) => (
                        <nav key={group.id} aria-labelledby={`guide-hub-${group.id}`}>
                            <h3 id={`guide-hub-${group.id}`} className="mb-3 font-semibold">{t(`guideHub.${group.id}`)}</h3>
                            <ul className="space-y-2">
                                {group.paths.map((path) => (
                                    <li key={path}>
                                        {/* Static pages, not app routes: a plain link loads each from the server. */}
                                        <a href={path} className={linkClass}>
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
