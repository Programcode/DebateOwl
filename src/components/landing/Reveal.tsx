import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Full transform strings run on the compositor; the x/y shorthands animate on the main thread.
const HIDDEN = { opacity: 0, transform: "translateY(12px)" };
const SHOWN = { opacity: 1, transform: "translateY(0px)" };
const EASE_OUT_STRONG = [0.23, 1, 0.32, 1] as const;

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
 */
export function Reveal({ children, className, delay = 0, onLoad = false }: RevealProps) {
    const reduceMotion = useReducedMotion();
    // Prerendered HTML already shows this content. Running the entrance on the
    // render that replaces it would hide it for a moment, so only later mounts animate.
    const [prerendered] = useState(() => typeof document === "undefined" || document.getElementById("root")?.dataset.prerendered !== undefined);
    if (reduceMotion || prerendered) return <div className={className}>{children}</div>;
    const transition = { duration: 0.35, ease: EASE_OUT_STRONG, delay: Math.min(delay, 0.2) };
    return onLoad ? (
        <motion.div className={className} initial={HIDDEN} animate={SHOWN} transition={transition}>
            {children}
        </motion.div>
    ) : (
        <motion.div
            className={className}
            initial={HIDDEN}
            whileInView={SHOWN}
            transition={transition}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
        >
            {children}
        </motion.div>
    );
}
