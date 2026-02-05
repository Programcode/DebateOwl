// src/components/features/onboarding/OnboardingTour.tsx
import { useEffect, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useOnboardingStore } from '@/hooks/use-onboarding';

const tourSteps: Step[] = [
    {
        target: 'body',
        content: (
            <div className="text-center">
                <h2 className="text-xl font-bold mb-2">Welcome to DebateLab! 🎉</h2>
                <p className="text-muted-foreground">
                    Let's take a quick tour to help you create your first debate case.
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
                <h3 className="font-semibold mb-1">Step 1: Enter Your Motion</h3>
                <p className="text-sm text-muted-foreground">
                    Type any debate topic here. For example: "This house believes that AI will create more jobs than it destroys."
                </p>
            </div>
        ),
        placement: 'bottom',
    },
    {
        target: '[data-tour="generate-button"]',
        content: (
            <div>
                <h3 className="font-semibold mb-1">Step 2: Generate Your Case</h3>
                <p className="text-sm text-muted-foreground">
                    Click this button to generate a structured debate case with contentions, evidence, and rebuttals.
                </p>
            </div>
        ),
        placement: 'top',
    },
    {
        target: '[data-tour="export-section"]',
        content: (
            <div>
                <h3 className="font-semibold mb-1">Step 3: Save & Export</h3>
                <p className="text-sm text-muted-foreground">
                    After generating, you can save your case to history or export it as a Word document.
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
                <h2 className="text-xl font-bold mb-2">You're Ready! 🚀</h2>
                <p className="text-muted-foreground">
                    Explore the other features: Attack arguments, Coach chat, and Research factoids.
                </p>
            </div>
        ),
        placement: 'center',
    },
];

export function OnboardingTour() {
    const { isTourRunning, hasCompletedOnboarding, setOnboardingComplete, startTour, stopTour } = useOnboardingStore();

    // Start tour automatically for new users
    useEffect(() => {
        if (!hasCompletedOnboarding) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => startTour(), 500);
            return () => clearTimeout(timer);
        }
    }, [hasCompletedOnboarding, startTour]);

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
                back: 'Back',
                close: 'Close',
                last: 'Get Started!',
                next: 'Next',
                skip: 'Skip Tour',
            }}
        />
    );
}
