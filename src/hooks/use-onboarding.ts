// src/hooks/use-onboarding.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
    /** Accounts that finished or skipped the tour on this browser. */
    completedUserIds: string[];
    /**
     * Version 0 kept one browser-wide flag with no owner. The next account to
     * sign in inherits it; every other account still sees the tour once.
     */
    legacyCompleted: boolean;
    isTourRunning: boolean;
    claimLegacyCompletion: (userId: string) => void;
    setOnboardingComplete: (userId: string) => void;
    startTour: () => void;
    stopTour: () => void;
}

type PersistedOnboarding = Pick<OnboardingState, 'completedUserIds' | 'legacyCompleted'>;

const withUser = (userIds: string[], userId: string) => (userIds.includes(userId) ? userIds : [...userIds, userId]);

export function hasCompletedOnboarding(state: PersistedOnboarding, userId: string | undefined): boolean {
    return !userId || state.legacyCompleted || state.completedUserIds.includes(userId);
}

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set) => ({
            completedUserIds: [] as string[],
            legacyCompleted: false,
            isTourRunning: false,
            claimLegacyCompletion: (userId) => set((state) => (state.legacyCompleted
                ? { legacyCompleted: false, completedUserIds: withUser(state.completedUserIds, userId) }
                : state)),
            setOnboardingComplete: (userId) => set((state) => ({
                completedUserIds: withUser(state.completedUserIds, userId),
                isTourRunning: false,
            })),
            startTour: () => set({ isTourRunning: true }),
            stopTour: () => set({ isTourRunning: false }),
        }),
        {
            name: 'debate-trainer-onboarding',
            version: 1,
            // A running tour belongs to this page load, not to the next account.
            partialize: ({ completedUserIds, legacyCompleted }): PersistedOnboarding => ({ completedUserIds, legacyCompleted }),
            migrate: (persisted, version): PersistedOnboarding => {
                if (version === 0) {
                    const legacy = persisted as { hasCompletedOnboarding?: unknown } | null;
                    return { completedUserIds: [], legacyCompleted: legacy?.hasCompletedOnboarding === true };
                }
                return persisted as PersistedOnboarding;
            },
        }
    )
);
