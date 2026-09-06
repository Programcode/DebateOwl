// src/hooks/use-onboarding.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
    hasCompletedOnboarding: boolean;
    isTourRunning: boolean;
    setOnboardingComplete: () => void;
    startTour: () => void;
    stopTour: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set) => ({
            hasCompletedOnboarding: false,
            isTourRunning: false,
            setOnboardingComplete: () => set({ hasCompletedOnboarding: true, isTourRunning: false }),
            startTour: () => set({ isTourRunning: true }),
            stopTour: () => set({ isTourRunning: false }),
        }),
        {
            name: 'debate-trainer-onboarding',
        }
    )
);
