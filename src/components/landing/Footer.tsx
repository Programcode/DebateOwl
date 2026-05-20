import { useTranslation } from "react-i18next";

const Footer = () => {
    const { t } = useTranslation();

    return (
        <footer className="py-12 border-t border-border/50">
            <div className="section-container">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <a href="/" className="flex items-center gap-2">
                            <img
                                src="/favicon.ico"
                                alt="DebateLab logo"
                                className="h-8 w-8 rounded-lg border border-primary/20 object-cover"
                            />
                            <span className="text-lg font-bold text-foreground">DebateLab</span>
                        </a>
                        <span className="hidden md:inline text-muted-foreground text-sm">
                            {t('footer.tagline')}
                        </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                        <a href="/terms" className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
                            {t('footer.terms')}
                        </a>
                        <a href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
                            {t('footer.privacy')}
                        </a>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        {t('footer.copyright')} All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
