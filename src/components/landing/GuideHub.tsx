import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
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
    { id: "compare", paths: ["/best-ai-debate-tools", "/debatelab-vs-chatgpt"] },
] as const;

/** Language home pages such as /hu and /es. The guides are English, so the hub stays off them. */
const LOCALIZED_ROUTE = /^\/(?:es|hu)(?:\/|$)/;

const GuideHub = () => {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    if (LOCALIZED_ROUTE.test(pathname)) return null;

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
                                        <a
                                            href={path}
                                            className="inline-flex text-muted-foreground underline-offset-4 hover:text-primary hover:underline pointer-coarse:min-h-11 pointer-coarse:items-center"
                                        >
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
