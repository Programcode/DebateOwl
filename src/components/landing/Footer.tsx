import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const Footer = () => {
    const { t } = useTranslation();

    return (
        <footer className="py-12 border-t border-border/50">
            <div className="section-container">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        {/* In-app links: no full reload through the startup shell. */}
                        <Link to="/" className="flex items-center gap-2 pointer-coarse:min-h-11">
                            <img
                                src="/favicon-72.png"
                                alt={t('common.logoAlt')}
                                width={32}
                                height={32}
                                className="h-8 w-8 rounded-lg border border-primary/20 object-cover"
                            />
                            <span className="text-lg font-bold text-foreground">DebateLab</span>
                        </Link>
                    </div>

                    <nav aria-label={t('footer.navLabel')} className="flex flex-wrap items-center justify-center gap-4 text-sm">
                        {/* Static guide pages, not app routes: plain links load them from the server. */}
                        <a href="/debatelab-pricing" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11">
                            {t('footer.pricingGuide')}
                        </a>
                        <a href="/best-ai-debate-tools" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11">
                            {t('footer.compareTools')}
                        </a>
                        <Link to="/terms" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11">
                            {t('footer.terms')}
                        </Link>
                        <Link to="/privacy" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline pointer-coarse:min-h-11">
                            {t('footer.privacy')}
                        </Link>
                    </nav>

                    <p className="text-sm text-muted-foreground">
                        {t('footer.copyright')}
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
