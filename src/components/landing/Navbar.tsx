import { useTranslation } from "react-i18next";
import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Menu, X, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";

const Navbar = () => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const shouldReduceMotion = useReducedMotion();
    const appPrefetch = useRoutePrefetch("/app");

    const navLinks = [
        { href: "#features", label: t('nav.features') },
        { href: "#whats-new", label: t('nav.whatsNew') },
        { href: "#pricing", label: t('nav.pricing') },
        { href: "#how-it-works", label: t('nav.howItWorks') },
    ];

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="fixed left-0 right-0 top-[var(--staging-banner-height,0px)] z-50 nav-blur"
            aria-label={t('nav.mainNavigation')}
        >
            <div className="section-container">
                <div className="flex h-16 items-center justify-between md:h-20">
                    <Link to="/" className="group flex items-center gap-2">
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
                        <Link to="/app" {...appPrefetch} className="btn-primary-gradient shimmer inline-flex items-center gap-2 text-sm">
                            <span className="relative z-10">{t('nav.startTrial')}</span>
                            <ArrowRight className="relative z-10 h-4 w-4" />
                        </Link>
                    </div>

                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="p-2 text-foreground md:hidden"
                        aria-label={isOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                        aria-expanded={isOpen}
                    >
                        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
                        className="border-b border-border bg-background/95 backdrop-blur-xl md:hidden"
                    >
                        <div className="section-container flex flex-col gap-4 py-4">
                            {navLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => setIsOpen(false)}
                                    className="py-2 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {link.label}
                                </a>
                            ))}
                            <Link
                                to="/app"
                                {...appPrefetch}
                                onClick={() => setIsOpen(false)}
                                className="btn-primary-gradient shimmer mt-2 inline-flex items-center justify-center gap-2"
                            >
                                <span className="relative z-10">{t('nav.startTrial')}</span>
                                <ArrowRight className="relative z-10 h-4 w-4" />
                            </Link>
                            <LanguageSwitcher />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
};

export default Navbar;
