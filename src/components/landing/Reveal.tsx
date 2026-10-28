import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
    children: ReactNode;
    className?: string;
    /** Seconds; capped so long lists don't trail in. */
    delay?: number;
    /** On-load content (the hero) animates at once instead of on scroll. */
    onLoad?: boolean;
}

/**
 * The one landing reveal: a short fade-up the first time content scrolls into view.
 * Hover effects belong on an inner element, never on this one, so the two never fight.
 * A CSS transition (.landing-reveal), so the landing page loads no animation library.
 */
export function Reveal({ children, className, delay = 0, onLoad = false }: RevealProps) {
    // Prerendered HTML already shows this content. Running the entrance on the
    // render that replaces it would hide it for a moment, so only later mounts animate.
    const [prerendered] = useState(() => typeof document === "undefined" || document.getElementById("root")?.dataset.prerendered !== undefined);
    const [shown, setShown] = useState(prerendered);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (shown || !element) return;
        if (onLoad || typeof IntersectionObserver === "undefined") {
            // One frame at the hidden state first, so the transition has somewhere to start.
            const frame = requestAnimationFrame(() => setShown(true));
            return () => cancelAnimationFrame(frame);
        }
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            setShown(true);
            observer.disconnect();
        }, { rootMargin: "0px 0px -15% 0px" });
        observer.observe(element);
        return () => observer.disconnect();
    }, [onLoad, shown]);

    if (prerendered) return <div className={className}>{children}</div>;
    return (
        <div
            ref={ref}
            className={cn("landing-reveal", className)}
            data-shown={shown || undefined}
            style={{ transitionDelay: `${Math.min(delay, 0.2)}s` }}
        >
            {children}
        </div>
    );
}
