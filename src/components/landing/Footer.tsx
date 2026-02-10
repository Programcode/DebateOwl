import { Brain } from "lucide-react";

const Footer = () => {
    return (
        <footer className="py-12 border-t border-border/50">
            <div className="section-container">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    {/* Logo */}
                    <div className="flex items-center gap-6">
                        <a href="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                                <Brain className="w-5 h-5 text-primary" />
                            </div>
                            <span className="text-lg font-bold text-foreground">DebateLab</span>
                        </a>
                        <span className="hidden md:inline text-muted-foreground text-sm">
                            AI-Powered Debate Prep
                        </span>
                    </div>

                    {/* Links - Removed per user request */}
                    <div className="flex items-center gap-4 text-sm">
                        <a href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                            Terms
                        </a>
                        <a href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                            Privacy
                        </a>
                    </div>

                    {/* Copyright */}
                    <p className="text-sm text-muted-foreground">
                        © 2026 DebateLab. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
