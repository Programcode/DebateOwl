import { useTranslation } from "react-i18next";
import site from '@/config/site.json';
import { OwlMark } from '@/components/brand/Owl';
import { Link } from "react-router-dom";
import { localizedPath, useRouteLanguage } from "@/lib/seo/localized-routes";

const Footer = () => {
    const { t } = useTranslation();
    const language = useRouteLanguage();

    return (
        <footer className="py-12 border-t border-border/50">
            <div className="section-container">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        {/* In-app links: no full reload through the startup shell. */}
                        <Link to="/" className="flex items-center gap-2 pointer-coarse:min-h-11">
                            <OwlMark size={32} alt={t('common.logoAlt')} />
                            <span className="font-display text-lg font-[600] text-heading">{site.product}</span>
                        </Link>
                    </div>

                    <nav aria-label={t('footer.navLabel')} className="flex flex-wrap items-center justify-center gap-4 text-sm">
                        <Link to={localizedPath("/tools", language)} className="inline-flex min-h-6 items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center">
                            {t('tools:footer.freeTools')}
                        </Link>
                        {/* Static guide pages, not app routes: plain links load them from the server. */}
                        <a href="/debateowl-pricing" className="inline-flex min-h-6 items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center">
                            {t('footer.pricingGuide')}
                        </a>
                        <a href="/best-ai-debate-tools" className="inline-flex min-h-6 items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center">
                            {t('footer.compareTools')}
                        </a>
                        <Link to="/terms" className="inline-flex min-h-6 items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center">
                            {t('footer.terms')}
                        </Link>
                        <Link to="/privacy" className="inline-flex min-h-6 items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center">
                            {t('footer.privacy')}
                        </Link>
                    </nav>

                    <div className="text-center text-sm text-muted-foreground md:text-right">
                        {/* The old name, so searchers and answer engines that know it can match the two. */}
                        <p>{t('footer.formerly')}</p>
                        <p>{t('footer.copyright')}</p>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
