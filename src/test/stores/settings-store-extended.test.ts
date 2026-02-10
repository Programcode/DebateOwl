// src/test/stores/settings-store-extended.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
                single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
            insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
            upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        auth: {
            getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null })),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        },
    },
}));

// Import after mocking
import { useSettingsStore } from '@/lib/stores/settings-store';

// Helper to create default configs since it's not exported
const createDefaultConfigs = () => ({
    generate: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 },
    attack: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 },
    brainstorm: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.9 },
    factoids: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.3 },
    ask: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 },
});

describe('Settings Store Extended', () => {
    beforeEach(() => {
        // Reset store state before each test
        act(() => {
            useSettingsStore.setState({
                language: 'en',
                theme: 'system',
                featureConfigs: createDefaultConfigs() as ReturnType<typeof createDefaultConfigs>,
                customSystemPrompt: undefined,
                wikiResearchEnabled: false,
            });
        });
    });

    describe('Language Settings', () => {
        it('gets default language', () => {
            const state = useSettingsStore.getState();
            expect(state.language).toBe('en');
        });

        it('sets language to Spanish', () => {
            const store = useSettingsStore.getState();
            act(() => {
                store.setLanguage('es');
            });
            expect(useSettingsStore.getState().language).toBe('es');
        });

        it('sets language to English', () => {
            act(() => {
                useSettingsStore.setState({ language: 'es' });
            });
            const store = useSettingsStore.getState();
            act(() => {
                store.setLanguage('en');
            });
            expect(useSettingsStore.getState().language).toBe('en');
        });
    });

    describe('Theme Settings', () => {
        it('gets default theme', () => {
            const state = useSettingsStore.getState();
            expect(state.theme).toBe('system');
        });

        it('sets theme to dark', () => {
            const store = useSettingsStore.getState();
            act(() => {
                store.setTheme('dark');
            });
            expect(useSettingsStore.getState().theme).toBe('dark');
        });

        it('sets theme to light', () => {
            const store = useSettingsStore.getState();
            act(() => {
                store.setTheme('light');
            });
            expect(useSettingsStore.getState().theme).toBe('light');
        });

        it('sets theme to system', () => {
            act(() => {
                useSettingsStore.setState({ theme: 'dark' });
            });
            const store = useSettingsStore.getState();
            act(() => {
                store.setTheme('system');
            });
            expect(useSettingsStore.getState().theme).toBe('system');
        });
    });

    describe('Feature Configs', () => {
        it('has feature configs defined', () => {
            const configs = useSettingsStore.getState().featureConfigs;
            expect(configs).toBeDefined();
            expect(typeof configs).toBe('object');
        });

        it('sets feature config for generate', () => {
            const store = useSettingsStore.getState();
            act(() => {
                store.setFeatureConfig('generate', { temperature: 0.5 });
            });
            expect(useSettingsStore.getState().featureConfigs.generate.temperature).toBe(0.5);
        });

        it('sets feature config for attack', () => {
            const store = useSettingsStore.getState();
            act(() => {
                store.setFeatureConfig('attack', { temperature: 0.8 });
            });
            expect(useSettingsStore.getState().featureConfigs.attack.temperature).toBe(0.8);
        });

        it('preserves other configs when updating one', () => {
            const store = useSettingsStore.getState();
            const originalBrainstormTemp = store.featureConfigs.brainstorm.temperature;
            act(() => {
                store.setFeatureConfig('generate', { temperature: 0.5 });
            });
            expect(useSettingsStore.getState().featureConfigs.brainstorm.temperature).toBe(originalBrainstormTemp);
        });

        it('gets feature config for specific feature', () => {
            const store = useSettingsStore.getState();
            const config = store.getFeatureConfig('generate');
            expect(config).toBeDefined();
            expect(config.provider).toBe('google');
        });
    });

    describe('System Prompt', () => {
        it('gets default undefined system prompt', () => {
            const state = useSettingsStore.getState();
            expect(state.customSystemPrompt).toBeUndefined();
        });

        it('sets custom system prompt', () => {
            const store = useSettingsStore.getState();
            act(() => {
                store.setSystemPrompt('You are a debate coach.');
            });
            expect(useSettingsStore.getState().customSystemPrompt).toBe('You are a debate coach.');
        });

        it('clears system prompt', () => {
            act(() => {
                useSettingsStore.setState({ customSystemPrompt: 'Custom prompt' });
            });
            const store = useSettingsStore.getState();
            act(() => {
                store.setSystemPrompt('');
            });
            expect(useSettingsStore.getState().customSystemPrompt).toBe('');
        });

        it('handles multiline system prompt', () => {
            const store = useSettingsStore.getState();
            const multilinePrompt = `You are a debate coach.
Focus on:
1. Logic
2. Evidence
3. Delivery`;
            act(() => {
                store.setSystemPrompt(multilinePrompt);
            });
            expect(useSettingsStore.getState().customSystemPrompt).toBe(multilinePrompt);
        });
    });

    describe('Reset', () => {
        it('resets to default settings', () => {
            // Set non-default values
            act(() => {
                useSettingsStore.setState({
                    language: 'es',
                    theme: 'dark',
                    customSystemPrompt: 'Custom prompt',
                });
            });

            const store = useSettingsStore.getState();
            act(() => {
                store.resetLocalData();
            });

            const state = useSettingsStore.getState();
            expect(state.language).toBe('en');
            expect(state.theme).toBe('system');
            expect(state.customSystemPrompt).toBeUndefined();
            expect(state.wikiResearchEnabled).toBe(false);
        });
    });
});
