import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";
import { cn } from "@/lib/utils";

const Navbar = () => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const appPrefetch = useRoutePrefetch("/app");

    // The nav is static on load; its edge appears once content scrolls under it.
    useEffect(() => {
        const update = () => setScrolled(window.scrollY > 0);
        update();
        window.addEventListener("scroll", update, { passive: true });
        return () => window.removeEventListener("scroll", update);
    }, []);

    const navLinks = [
        { href: "#features", label: t('nav.features') },
        { href: "#whats-new", label: t('nav.whatsNew') },
        { href: "#pricing", label: t('nav.pricing') },
        { href: "#how-it-works", label: t('nav.howItWorks') },
    ];

    return (
        <nav
            className={cn(
                "fixed left-0 right-0 top-[var(--staging-banner-height,0px)] z-50 nav-blur",
                scrolled || isOpen ? "border-border shadow-sm" : "border-transparent",
            )}
            aria-label={t('nav.mainNavigation')}
        >
            <div className="section-container">
                <div className="flex h-16 items-center justify-between md:h-20">
                    <Link to="/" className="group flex items-center gap-2 pointer-coarse:min-h-11">
                        <img
                            src="/favicon-72.png"
                            alt={t('common.logoAlt')}
                            width={36}
                            height={36}
                            className="h-9 w-9 rounded-lg border border-primary/20 object-cover transition-colors group-hover:border-primary/40"
                        />
                        <span className="text-xl font-bold text-foreground">DebateLab</span>
                    </Link>

                    <div className="hidden items-center gap-7 md:flex">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:text-foreground rounded-sm"
                            >
                                {link.label}
                            </a>
                        ))}
                    </div>

                    <div className="hidden items-center gap-3 md:flex">
                        <LanguageSwitcher />
                        <Link to="/app" {...appPrefetch} className="btn-primary-gradient inline-flex items-center gap-2 text-sm">
                            <span className="relative z-10">{t('nav.startTrial')}</span>
                            <ArrowRight aria-hidden="true" className="relative z-10 h-4 w-4" />
                        </Link>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-foreground md:hidden"
                        aria-label={isOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                        aria-expanded={isOpen}
                    >
                        {isOpen ? <X aria-hidden="true" className="h-6 w-6" /> : <Menu aria-hidden="true" className="h-6 w-6" />}
                    </button>
                </div>
            </div>

            {isOpen && (
                // Opacity and a 4px drop in 180ms; reduced motion keeps the fade only.
                <div className="border-b border-border bg-background md:hidden animate-in fade-in-0 slide-in-from-top-1 duration-180 ease-out-strong">
                    <div className="section-container flex flex-col gap-1 py-4">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                onClick={() => setIsOpen(false)}
                                className="flex min-h-11 items-center text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {link.label}
                            </a>
                        ))}
                        <Link
                            to="/app"
                            {...appPrefetch}
                            onClick={() => setIsOpen(false)}
                            className="btn-primary-gradient mt-2 inline-flex items-center justify-center gap-2"
                        >
                            <span className="relative z-10">{t('nav.startTrial')}</span>
                            <ArrowRight aria-hidden="true" className="relative z-10 h-4 w-4" />
                        </Link>
                        <LanguageSwitcher />
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
