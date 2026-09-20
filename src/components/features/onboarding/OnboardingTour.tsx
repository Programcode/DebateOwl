// src/components/features/onboarding/OnboardingTour.tsx
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useLocation } from 'react-router-dom';
import { useOnboardingStore } from '@/hooks/use-onboarding';

export function OnboardingTour({ autoStartDelay = 500 }: { autoStartDelay?: number } = {}) {
    const { t } = useTranslation();
    const { isTourRunning, hasCompletedOnboarding, setOnboardingComplete, startTour, stopTour } = useOnboardingStore();
    const location = useLocation();

    const allTourSteps = useMemo<Step[]>(() => [
        {
            target: 'body',
            content: (
                <div className="text-center">
                    <h2 className="text-xl font-bold mb-2">{t('onboarding.welcome')}</h2>
                    <p className="text-muted-foreground">
                        {t('onboarding.welcomeDesc')}
                    </p>
                </div>
            ),
            placement: 'center',
            disableBeacon: true,
        },
        {
            target: '[data-tour="mode-generate"], [data-tour="nav-generate"]',
            content: (
                <div>
                    <h3 className="font-semibold mb-1">{t('onboarding.generate')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('onboarding.generateDesc')}
                    </p>
                </div>
            ),
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-attack"], [data-tour="nav-attack"]',
            content: (
                <div>
                    <h3 className="font-semibold mb-1">{t('onboarding.attack')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('onboarding.attackDesc')}
                    </p>
                </div>
            ),
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-brainstorm"], [data-tour="nav-brainstorm"]',
            content: (
                <div>
                    <h3 className="font-semibold mb-1">{t('onboarding.brainstorm')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('onboarding.brainstormDesc')}
                    </p>
                </div>
            ),
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-factoids"], [data-tour="nav-factoids"]',
            content: <TourCopy title={t('onboarding.factoids')} description={t('onboarding.factoidsDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-ask"], [data-tour="nav-ask"]',
            content: <TourCopy title={t('onboarding.ask')} description={t('onboarding.askDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-crossfire"], [data-tour="nav-crossfire"]',
            content: <TourCopy title={t('onboarding.crossfire')} description={t('onboarding.crossfireDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-sparring"], [data-tour="nav-sparring"]',
            content: <TourCopy title={t('onboarding.sparring')} description={t('onboarding.sparringDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-library"], [data-tour="nav-library"]',
            content: <TourCopy title={t('onboarding.library')} description={t('onboarding.libraryDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-timer"], [data-tour="nav-timer"]',
            content: <TourCopy title={t('onboarding.timer')} description={t('onboarding.timerDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-flowchart"], [data-tour="nav-flowchart"]',
            content: <TourCopy title={t('onboarding.flowchart')} description={t('onboarding.flowchartDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="mode-history"], [data-tour="nav-history"]',
            content: <TourCopy title={t('onboarding.history')} description={t('onboarding.historyDesc')} />,
            placement: 'bottom',
        },
        {
            target: '[data-tour="nav-settings"]',
            content: <TourCopy title={t('onboarding.settings')} description={t('onboarding.settingsDesc')} />,
            placement: 'bottom',
        },
        {
            target: 'body',
            content: (
                <div className="text-center">
                    <h2 className="text-xl font-bold mb-2">{t('onboarding.ready')}</h2>
                    <p className="text-muted-foreground">
                        {t('onboarding.readyDesc')}
                    </p>
                </div>
            ),
            placement: 'center',
        },
    ], [t]);

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

    // Start tour automatically for new users
    useEffect(() => {
        if (hasCompletedOnboarding || location.pathname !== '/app') return;

        // Small delay to ensure DOM is ready on the mode overview.
        const timer = setTimeout(() => {
            setTourSteps(resolveTourSteps());
            startTour();
        }, autoStartDelay);
        return () => clearTimeout(timer);
    }, [autoStartDelay, hasCompletedOnboarding, location.pathname, resolveTourSteps, startTour]);

    useEffect(() => {
        if (isTourRunning) setTourSteps(resolveTourSteps());
    }, [isTourRunning, location.pathname, resolveTourSteps]);

    // Prevent broken tooltips if user navigates away from the app mid-tour
    useEffect(() => {
        if (isTourRunning && !location.pathname.startsWith('/app')) {
            stopTour();
        }
    }, [isTourRunning, location.pathname, stopTour]);

    const handleJoyrideCallback = useCallback((data: CallBackProps) => {
        const { status } = data;
        const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

        if (finishedStatuses.includes(status)) {
            setOnboardingComplete();
        }
    }, [setOnboardingComplete]);

    return (
        <Joyride
            steps={tourSteps}
            run={isTourRunning}
            continuous
            showSkipButton
            showProgress
            callback={handleJoyrideCallback}
            styles={{
                options: {
                    arrowColor: 'hsl(var(--popover))',
                    backgroundColor: 'hsl(var(--popover))',
                    overlayColor: 'hsl(var(--background) / 0.72)',
                    primaryColor: 'hsl(var(--primary))',
                    textColor: 'hsl(var(--popover-foreground))',
                    zIndex: 10000,
                },
                tooltip: {
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    boxShadow: '0 20px 45px hsl(var(--foreground) / 0.18)',
                    color: 'hsl(var(--popover-foreground))',
                    padding: '1rem',
                },
                buttonClose: {
                    color: 'hsl(var(--muted-foreground))',
                },
                buttonNext: {
                    backgroundColor: 'hsl(var(--primary))',
                    borderRadius: '0.375rem',
                    color: 'hsl(var(--primary-foreground))',
                    padding: '0.5rem 1rem',
                },
                buttonBack: {
                    color: 'hsl(var(--muted-foreground))',
                },
                buttonSkip: {
                    color: 'hsl(var(--muted-foreground))',
                },
            }}
            locale={{
                back: t('onboarding.back'),
                close: t('onboarding.close'),
                last: t('onboarding.getStarted'),
                next: t('onboarding.next'),
                skip: t('onboarding.skip'),
            }}
        />
    );
}

function TourCopy({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
}
