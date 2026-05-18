// src/components/features/onboarding/OnboardingTour.tsx
import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useLocation } from 'react-router-dom';
import { useOnboardingStore } from '@/hooks/use-onboarding';

export function OnboardingTour() {
    const { t } = useTranslation();
    const { isTourRunning, hasCompletedOnboarding, setOnboardingComplete, startTour, stopTour } = useOnboardingStore();
    const location = useLocation();

    const tourSteps: Step[] = [
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
            target: '#motion',
            content: (
                <div>
                    <h3 className="font-semibold mb-1">{t('onboarding.step1')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('onboarding.step1Desc')}
                    </p>
                </div>
            ),
            placement: 'bottom',
        },
        {
            target: '[data-tour="generate-button"]',
            content: (
                <div>
                    <h3 className="font-semibold mb-1">{t('onboarding.step2')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('onboarding.step2Desc')}
                    </p>
                </div>
            ),
            placement: 'top',
        },
        {
            target: '[data-tour="export-section"]',
            content: (
                <div>
                    <h3 className="font-semibold mb-1">{t('onboarding.step3')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('onboarding.step3Desc')}
                    </p>
                </div>
            ),
            placement: 'left',
            spotlightClicks: false,
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
    ];

    // Start tour automatically for new users
    useEffect(() => {
        if (hasCompletedOnboarding || location.pathname !== '/app/generate') return;

        // Small delay to ensure DOM is ready on Generate page
        const timer = setTimeout(() => startTour(), 500);
        return () => clearTimeout(timer);
    }, [hasCompletedOnboarding, location.pathname, startTour]);

    // Prevent broken tooltips if user navigates away from Generate mid-tour
    useEffect(() => {
        if (isTourRunning && location.pathname !== '/app/generate') {
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
                    primaryColor: 'hsl(var(--primary))',
                    zIndex: 10000,
                },
                tooltip: {
                    borderRadius: '0.5rem',
                    padding: '1rem',
                },
                buttonNext: {
                    backgroundColor: 'hsl(var(--primary))',
                    borderRadius: '0.375rem',
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
