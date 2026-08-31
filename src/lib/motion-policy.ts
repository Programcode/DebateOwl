export const ROUTE_TRANSITION_DURATION_SECONDS = 0.16;

const ROUTE_EASE = [0.22, 1, 0.36, 1] as const;

export function getRouteMotion(shouldReduceMotion: boolean) {
  return {
    initial: shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.998 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.998 },
    transition: {
      duration: shouldReduceMotion ? 0 : ROUTE_TRANSITION_DURATION_SECONDS,
      ease: ROUTE_EASE,
    },
  };
}
