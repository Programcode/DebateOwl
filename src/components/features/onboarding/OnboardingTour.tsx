// src/components/features/onboarding/OnboardingTour.tsx
import { useEffect, useLayoutEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Joyride, { ACTIONS, CallBackProps, EVENTS, STATUS, Step } from 'react-joyride';
import { useLocation } from 'react-router-dom';
import { Owl } from '@/components/brand/Owl';
import { Button } from '@/components/ui/button';
import { hasCompletedOnboarding as completedFor, useOnboardingStore } from '@/hooks/use-onboarding';
import { focusCurrentDebate, focusTourPrimary } from '@/lib/onboarding-tour-load';
import { useDebateStore } from '@/lib/stores/debate-store';

// Below `lg` the tour draws no overlay, so a tap still reaches the page.
// On a phone the bottom tab bar is the navigation; from `md` until `lg` it is
// the header menu. The tooltip stays under both (z-40) and the header (z-50).
// Joyride draws the tooltip at zIndex + 100.
const COMPACT_LAYOUT_QUERY = '(max-width: 1023px)';
const COMPACT_TOOLTIP_Z_INDEX = 35;

function useCompactLayout() {
    const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(COMPACT_LAYOUT_QUERY).matches === true);
    useEffect(() => {
        const query = window.matchMedia?.(COMPACT_LAYOUT_QUERY);
        if (!query) return;
        const update = () => setCompact(query.matches);
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    return compact;
}

export function OnboardingTour({
    eligibleAt,
    userId,
    continueFromIntro = false,
}: {
    eligibleAt?: number;
    userId: string;
    /** The owl welcome just closed, so the Start debate step opens before the next paint. */
    continueFromIntro?: boolean;
}) {
    const { t } = useTranslation();
    const hasCompletedOnboarding = useOnboardingStore((state) => completedFor(state, userId));
    const { isTourRunning, setOnboardingComplete, startTour, stopTour } = useOnboardingStore();
    const compactLayout = useCompactLayout();
    const location = useLocation();
    const currentDebateId = useDebateStore((state) => state.currentDebateId);
    const debateDialog = useDebateStore((state) => state.dialog);
    const openDebateDialog = useDebateStore((state) => state.openDialog);
    const [stepIndex, setStepIndex] = useState(0);

    // The tour starts with the Current Debate, because every tool works inside it.
    const allTourSteps = useMemo<Step[]>(() => [
        {
            target: '[data-tour="current-debate"]',
            content: (
                <div>
                    <h2 className="mb-2 font-display text-xl font-[600] text-heading">{t('onboarding.welcome')}</h2>
                    <p className="text-muted-foreground">
                        {currentDebateId ? t('onboarding.debateCurrentDesc') : t('onboarding.debateFirstDesc')}
                    </p>
                    {!currentDebateId && (
                        // Joyride lets clicks through its highlight only after a mouse move, so touch needs this button.
                        <Button className="mt-3" onClick={() => openDebateDialog('create')}>{t('debate.startDebate')}</Button>
                    )}
                </div>
            ),
            placement: 'bottom',
            disableBeacon: true,
            // One primary action per step: before a debate exists that is Start debate.
            ...(currentDebateId ? {} : {
                styles: {
                    buttonNext: {
                        backgroundColor: 'var(--do-surface)',
                        border: '2px solid var(--do-border-strong)',
                        boxShadow: '0 3px 0 var(--do-border-strong)',
                        color: 'hsl(var(--primary))',
                    },
                },
            }),
        },
        {
            target: '[data-tour="mode-library"], [data-tour="nav-library"]',
            content: <TourCopy title={t('onboarding.library')} description={t('onboarding.libraryDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-generate"], [data-tour="nav-generate"]',
            content: <TourCopy title={t('onboarding.generate')} description={t('onboarding.generateDesc')} />,
            placement: 'bottom',
        },
        {
            target: 'body',
            content: (
                <div className="flex flex-col items-center text-center">
                    {/* A small celebration, once: the owl in place of the old emoji. */}
                    <Owl pose="celebrating" size={72} className="mb-2" />
                    <h2 className="mb-2 text-balance font-display text-xl font-[600] text-heading">{t('onboarding.ready')}</h2>
                    <p className="text-muted-foreground">
                        {t('onboarding.readyDesc')}
                    </p>
                </div>
            ),
            placement: 'center',
        },
    ], [currentDebateId, openDebateDialog, t]);

    const resolveTourSteps = useCallback(() => {
        if (typeof document === 'undefined') return allTourSteps;
        return allTourSteps.map((step) => {
            if (step.target === 'body') return step;
            const target = String(step.target);
            const element = Array.from(document.querySelectorAll<HTMLElement>(target))
                .find((candidate) => {
                    const style = window.getComputedStyle(candidate);
                    const rect = candidate.getBoundingClientRect();
                    return style.display !== 'none'
                        && style.visibility !== 'hidden'
                        && candidate.getClientRects().length > 0
                        && rect.width > 0
                        && rect.height > 0;
                });
            return element
                ? { ...step, target: element }
                : { ...step, target: 'body', placement: 'center' as const };
        });
    }, [allTourSteps]);
    const [tourSteps, setTourSteps] = useState(allTourSteps);
    // Joyride scrolls a target to 20px from the top, which hides it under the sticky header.
    const [scrollOffset, setScrollOffset] = useState(20);
    const prepareTour = useCallback(() => {
        setTourSteps(resolveTourSteps());
        setScrollOffset((document.querySelector('header')?.getBoundingClientRect().height ?? 0) + 24);
    }, [resolveTourSteps]);

    // The parent leaves `continueFromIntro` true for the whole Start debate step.
    // Consume it once the spotlight has opened. `startTour` does not reset
    // `stepIndex`, and the create-dialog pause still depends on `debateDialog`,
    // so a later language or debate change must not run this handoff again.
    // If the card is not in the document yet, leave it pending for the next pass.
    const handoffPending = useRef(continueFromIntro);
    useLayoutEffect(() => {
        if (!handoffPending.current || hasCompletedOnboarding || location.pathname !== '/app') return;
        if (!document.querySelector('[data-tour="current-debate"]')) return;
        handoffPending.current = false;
        prepareTour();
        startTour();
    }, [hasCompletedOnboarding, location.pathname, prepareTour, startTour]);

    // Joyride also focuses a hidden beacon. That runs in its mount timeout, so
    // the visible Next button has to take focus after it. The welcome dialog
    // has already given up restoring focus to the page body.
    useEffect(() => {
        if (!continueFromIntro || hasCompletedOnboarding || !isTourRunning) return;
        const timer = window.setTimeout(() => { focusTourPrimary(); }, 0);
        return () => window.clearTimeout(timer);
    }, [continueFromIntro, hasCompletedOnboarding, isTourRunning]);

    // Start tour automatically for new users
    useEffect(() => {
        if (hasCompletedOnboarding || location.pathname !== '/app') return;

        // Start as soon as the first target exists, not after a fixed delay; give up waiting after 500ms.
        const startedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
        const waitedBefore = typeof performance === 'undefined' || eligibleAt === undefined ? 0 : startedAt - eligibleAt;
        const autoStartDelay = Math.max(0, 500 - waitedBefore);
        const deadline = startedAt + autoStartDelay;
        let frame = 0;
        const tryStart = () => {
            const now = typeof performance === 'undefined' ? Date.now() : performance.now();
            if (document.querySelector('[data-tour="current-debate"]') || now >= deadline) {
                prepareTour();
                startTour();
                return;
            }
            frame = requestAnimationFrame(tryStart);
        };
        frame = requestAnimationFrame(tryStart);
        return () => cancelAnimationFrame(frame);
    }, [eligibleAt, hasCompletedOnboarding, location.pathname, prepareTour, startTour]);

    useEffect(() => {
        if (isTourRunning) prepareTour();
    }, [isTourRunning, location.pathname, prepareTour]);

    // The tour belongs to the Tools page. Leaving it pauses the tour, so a step never
    // floats over another page's form pointing at nothing; it resumes on return.
    useEffect(() => {
        if (isTourRunning && location.pathname !== '/app') {
            stopTour();
        }
    }, [isTourRunning, location.pathname, stopTour]);

    // Starting a debate from the first step pauses the tour while its dialog is
    // open, then moves on once the new debate is current.
    const debateBeforeDialog = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (debateDialog === 'create') {
            if (debateBeforeDialog.current === undefined) debateBeforeDialog.current = currentDebateId;
            return;
        }
        if (debateDialog !== null || debateBeforeDialog.current === undefined) return;
        const started = currentDebateId !== null && currentDebateId !== debateBeforeDialog.current;
        debateBeforeDialog.current = undefined;
        if (started && isTourRunning) setStepIndex((index) => (index === 0 ? 1 : index));
    }, [currentDebateId, debateDialog, isTourRunning]);

    const handleJoyrideCallback = useCallback((data: CallBackProps) => {
        const { action, index, status, type } = data;
        const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

        if (finishedStatuses.includes(status)) {
            setOnboardingComplete(userId);
            setStepIndex(0);
            // The tooltip is about to unmount. The card it was pointing at is the
            // control the student can use next.
            requestAnimationFrame(() => { focusCurrentDebate(); });
        } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
        }
    }, [setOnboardingComplete, userId]);

    return (
        <Joyride
            steps={tourSteps}
            stepIndex={stepIndex}
            run={isTourRunning && debateDialog === null}
            continuous
            disableOverlay={compactLayout}
            scrollOffset={scrollOffset}
            scrollToFirstStep
            showSkipButton
            showProgress
            callback={handleJoyrideCallback}
            styles={{
                options: {
                    arrowColor: 'hsl(var(--popover))',
                    backgroundColor: 'hsl(var(--popover))',
                    overlayColor: 'var(--do-overlay)',
                    primaryColor: 'hsl(var(--primary))',
                    textColor: 'hsl(var(--popover-foreground))',
                    // Hungarian footer labels wrap at Joyride's default 380px.
                    width: 'min(440px, calc(100vw - 2rem))',
                    zIndex: compactLayout ? COMPACT_TOOLTIP_Z_INDEX - 100 : 10000,
                },
                tooltip: {
                    backgroundColor: 'hsl(var(--popover))',
                    border: '2px solid hsl(var(--border))',
                    borderRadius: '24px',
                    boxShadow: 'var(--app-shadow-xl)',
                    color: 'hsl(var(--popover-foreground))',
                    padding: '1.25rem',
                },
                tooltipContent: {
                    textAlign: 'left',
                },
                buttonClose: {
                    color: 'hsl(var(--muted-foreground))',
                },
                // The tour's buttons press like the app's (.btn in index.css draws the ledge).
                buttonNext: {
                    backgroundColor: 'var(--do-primary)',
                    borderRadius: '14px',
                    boxShadow: '0 3px 0 var(--do-primary-ledge)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    padding: '0.625rem 1rem',
                },
                buttonBack: {
                    color: 'hsl(var(--muted-foreground))',
                },
                buttonSkip: {
                    color: 'hsl(var(--muted-foreground))',
                    whiteSpace: 'nowrap',
                },
            }}
            locale={{
                back: t('onboarding.back'),
                close: t('onboarding.close'),
                last: t('onboarding.getStarted'),
                next: t('onboarding.next'),
                nextLabelWithProgress: t('onboarding.nextWithProgress'),
                skip: t('onboarding.skip'),
            }}
        />
    );
}

function TourCopy({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h3 className="mb-1 font-extrabold text-heading">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
}
