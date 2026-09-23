/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMockState,
  setMockAuthUser,
  setMockTableResponse,
  supabaseMock,
} from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/client", () => ({ supabase: supabaseMock }));

import { useSettingsStore } from "@/lib/stores/settings-store";
import i18n from "@/i18n";

describe("settings-store", () => {
  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    useSettingsStore.getState().resetLocalData();
  });

  it("uses GPT-5.6 Luna through OpenRouter for all features", () => {
    const state = useSettingsStore.getState();
    expect(state.featureConfigs.generate.provider).toBe("openrouter");
    expect(state.featureConfigs.generate.model).toBe("openai/gpt-5.6-luna");
    expect(state.featureConfigs.generate.reasoningEffort).toBe("low");
    expect(state.featureConfigs.brainstorm.temperature).toBe(0.9);
    expect(state.featureConfigs.factoids.temperature).toBe(0.3);
  });

  it("setFeatureConfig merges updates and persists", async () => {
    const store = useSettingsStore.getState();
    store.setFeatureConfig("generate", { temperature: 0.2 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSettingsStore.getState().featureConfigs.generate.temperature).toBe(0.2);
    expect(supabaseMock.from).toHaveBeenCalledWith("user_settings");
  });

  it("setSystemPrompt updates local state and persists settings", async () => {
    const store = useSettingsStore.getState();
    store.setSystemPrompt("Custom system");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSettingsStore.getState().customSystemPrompt).toBe("Custom system");
    expect(supabaseMock.from).toHaveBeenCalledWith("user_settings");
  });

  it("setOutputLanguage updates state and persists", async () => {
    useSettingsStore.getState().setOutputLanguage("hu");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSettingsStore.getState().outputLanguage).toBe("hu");
    expect(supabaseMock.from).toHaveBeenCalledWith("user_settings");
  });

  it("hydrateFromServer merges defaults with server configs", async () => {
    setMockTableResponse("user_settings", {
      single: {
        language: "es",
        theme: "dark",
        custom_system_prompt: "Server prompt",
        feature_configs: {
          generate: { temperature: 0.4 },
        },
      },
    });
    const store = useSettingsStore.getState();
    await store.hydrateFromServer();

    const state = useSettingsStore.getState();
    expect(state.language).toBe("es");
    expect(state.theme).toBe("dark");
    expect(state.customSystemPrompt).toBe("Server prompt");
    expect(state.featureConfigs.generate.temperature).toBe(0.4);
    expect(state.featureConfigs.generate.provider).toBe("openrouter");
    expect(state.featureConfigs.generate.model).toBe("openai/gpt-5.6-luna");
    expect(state.featureConfigs.attack.model).toBe("openai/gpt-5.6-luna");
  });

  it("resetLocalData restores defaults", () => {
    const store = useSettingsStore.getState();
    store.setTheme("dark");
    store.setSystemPrompt("Custom");
    store.setWikiResearchEnabled(true);
    store.resetLocalData();

    const state = useSettingsStore.getState();
    expect(state.theme).toBe("system");
    expect(state.customSystemPrompt).toBeUndefined();
    expect(state.featureConfigs.generate.model).toBe("openai/gpt-5.6-luna");
    expect(state.wikiResearchEnabled).toBe(false);
  });

  it("keeps wiki research local and omits it from server writes", async () => {
    const store = useSettingsStore.getState();
    store.setWikiResearchEnabled(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useSettingsStore.getState().wikiResearchEnabled).toBe(true);
    expect(supabaseMock.from).not.toHaveBeenCalled();

    store.setTheme("dark");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const settingsQuery = supabaseMock.from.mock.results.find(({ value }) => value.update.mock.calls.length)?.value;
    expect(settingsQuery.update).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
    expect(settingsQuery.update.mock.results[0].value.eq).toHaveBeenCalledWith("user_id", "user_1");
    expect(settingsQuery.upsert).not.toHaveBeenCalled();
    expect(settingsQuery.update.mock.calls[0][0]).not.toHaveProperty("wiki_research_enabled");
  });

  it("reports settings persistence failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const eq = vi.fn(async () => ({ data: null, error: { message: "database unavailable" } }));
    supabaseMock.from.mockImplementationOnce((() => ({ update: () => ({ eq }) })) as never);

    useSettingsStore.getState().setTheme("dark");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).toHaveBeenCalledWith("[SettingsStore] Failed to persist settings:", "database unavailable");
    warnSpy.mockRestore();
  });

  it("getFeatureConfig returns the stored config, or defaults when missing", () => {
    useSettingsStore.getState().setFeatureConfig("ask", { temperature: 0.42 });
    expect(useSettingsStore.getState().getFeatureConfig("ask").temperature).toBe(0.42);

    useSettingsStore.setState({ featureConfigs: {} } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    const config = useSettingsStore.getState().getFeatureConfig("ask");
    expect(config.provider).toBe("openrouter");
    expect(config.model).toBe("openai/gpt-5.6-luna");
  });

  it("canonicalizes legacy and unknown server configs without client credentials", async () => {
    setMockTableResponse("user_settings", {
      single: {
        feature_configs: {
          generate: {
            provider: "openai",
            model: "gpt-5.5",
            temperature: 0.4,
            reasoningEffort: "high",
            apiKey: "legacy-secret",
            baseUrl: "https://legacy.example.test",
          },
          attack: {
            provider: "unknown-provider",
            model: "unknown-model",
            temperature: 0.8,
            reasoningEffort: "invalid",
            apiKey: "another-secret",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    const generate = state.featureConfigs.generate;
    const attack = state.featureConfigs.attack;
    expect(generate).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      temperature: 0.4,
      reasoningEffort: "high",
    });
    expect(generate).not.toHaveProperty("apiKey");
    expect(generate).not.toHaveProperty("baseUrl");
    expect(attack).toMatchObject({ provider: "openrouter", model: "openai/gpt-5.6-luna", reasoningEffort: "low" });
    expect(attack).not.toHaveProperty("apiKey");

    const settingsWrite = supabaseMock.from.mock.results.find(({ value }) => value.update.mock.calls.length)?.value;
    expect(settingsWrite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        feature_configs: expect.objectContaining({
          generate: expect.objectContaining({ provider: "openrouter", model: "openai/gpt-5.6-luna" }),
          attack: expect.objectContaining({ provider: "openrouter", model: "openai/gpt-5.6-luna" }),
        }),
      }),
    );
    expect(settingsWrite.update.mock.calls[0][0].feature_configs.generate).not.toHaveProperty("apiKey");
    expect(settingsWrite.update.mock.calls[0][0].feature_configs.generate).not.toHaveProperty("baseUrl");
    expect(settingsWrite.update.mock.results[0].value.eq).toHaveBeenCalledWith("user_id", "user_1");
  });

  it("moves a trial user's former GLM default to Luna", async () => {
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "trial",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "z-ai/glm-5.3-flash",
            temperature: 0.7,
            reasoningEffort: "low",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("openai/gpt-5.6-luna");
    const settingsWrite = supabaseMock.from.mock.results.find(({ value }) => value.update.mock.calls.length)?.value;
    expect(settingsWrite.update).toHaveBeenCalledWith(expect.objectContaining({
      feature_configs: expect.objectContaining({
        generate: expect.objectContaining({ model: "openai/gpt-5.6-luna" }),
      }),
    }));
  });

  it("keeps GLM selected for Pro users", async () => {
    setMockTableResponse("subscriptions", {
      select: [{ status: "active", current_period_end: "2099-01-01T00:00:00.000Z" }],
    });
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "pro",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "z-ai/glm-5.3-flash",
            temperature: 0.7,
            reasoningEffort: "medium",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate).toMatchObject({
      model: "z-ai/glm-5.3-flash",
      reasoningEffort: "medium",
    });
  });

  it("keeps Auto Fast for trial users", async () => {
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "trial",
        trial_ends_at: "2099-01-01T00:00:00.000Z",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "auto-fast",
            temperature: 0.7,
            reasoningEffort: "high",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate).toMatchObject({
      model: "auto-fast",
      reasoningEffort: "high",
    });
  });

  it("moves an inaccessible Auto Pro selection to Auto Fast", async () => {
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "trial",
        trial_ends_at: "2099-01-01T00:00:00.000Z",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "auto-pro",
            temperature: 0.7,
            reasoningEffort: "high",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("auto-fast");
  });

  it("keeps Auto Pro for active Pro users", async () => {
    setMockTableResponse("subscriptions", {
      select: [{ status: "active", current_period_end: "2099-01-01T00:00:00.000Z" }],
    });
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "pro",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "auto-pro",
            temperature: 0.7,
            reasoningEffort: "high",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("auto-pro");
  });

  it("uses Sonnet when an active Pro user has no saved feature configs", async () => {
    setMockTableResponse("subscriptions", {
      select: [{ status: "trialing", current_period_end: "2099-01-01T00:00:00.000Z" }],
    });
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "pro",
        feature_configs: {},
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("anthropic/claude-sonnet-5");
    expect(useSettingsStore.getState().featureConfigs.sparring.model).toBe("anthropic/claude-sonnet-5");
  });

  it("does not rewrite model settings when subscription access cannot be read", async () => {
    setMockTableResponse("subscriptions", { error: { message: "subscription read failed" } });
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "pro",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "z-ai/glm-5.3-flash",
            temperature: 0.7,
            reasoningEffort: "high",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("openai/gpt-5.6-luna");
    const settingsWrites = supabaseMock.from.mock.results.filter(({ value }) =>
      value.upsert.mock.calls.length || value.update.mock.calls.length
    );
    expect(settingsWrites).toHaveLength(0);
  });

  it("moves a former Pro user on a trial from GLM to Luna", async () => {
    setMockTableResponse("subscriptions", { select: [] });
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "pro",
        grace_period_ends_at: "2020-01-01T00:00:00.000Z",
        trial_ends_at: "2099-01-01T00:00:00.000Z",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "z-ai/glm-5.3-flash",
            temperature: 0.7,
            reasoningEffort: "low",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("openai/gpt-5.6-luna");
  });

  it("does not rewrite server feature configs that are already canonical", async () => {
    const featureConfigs = structuredClone(useSettingsStore.getState().featureConfigs);
    setMockTableResponse("user_settings", {
      single: {
        language: "en",
        output_language: "en",
        theme: "system",
        custom_system_prompt: null,
        feature_configs: featureConfigs,
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const settingsWrites = supabaseMock.from.mock.results.filter(({ value }) =>
      value.upsert.mock.calls.length || value.update.mock.calls.length
    );
    expect(settingsWrites).toHaveLength(0);
  });

  it("does not write settings when user is not signed in", async () => {
    setMockAuthUser(null);
    const store = useSettingsStore.getState();
    store.setTheme("dark");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("persists a cleared system prompt as null and carries a set one into config writes", async () => {
    const store = useSettingsStore.getState();
    store.setSystemPrompt("You are a debate coach.");
    store.setFeatureConfig("generate", { temperature: 0.5 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const configWrite = supabaseMock.from.mock.results
      .map(({ value }) => value.update?.mock.calls?.at(-1)?.[0])
      .filter(Boolean)
      .at(-1);
    expect(configWrite.custom_system_prompt).toBe("You are a debate coach.");

    store.setSystemPrompt("");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const clearWrite = supabaseMock.from.mock.results
      .map(({ value }) => value.update?.mock.calls?.at(-1)?.[0])
      .filter(Boolean)
      .at(-1);
    expect(clearWrite.custom_system_prompt).toBeNull();
  });

  it("setLanguage updates state and switches the i18n runtime", () => {
    const spy = vi.spyOn(i18n, "changeLanguage");
    useSettingsStore.getState().setLanguage("hu");

    expect(useSettingsStore.getState().language).toBe("hu");
    expect(spy).toHaveBeenCalledWith("hu");
    spy.mockRestore();
  });

  it('hydrateFromServer returns early when no server row exists', async () => {
    setMockTableResponse('user_settings', { single: null });

    useSettingsStore.setState({ theme: 'dark' });
    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('hydrateFromServer applies fallback values when server fields are empty', async () => {
    setMockTableResponse('user_settings', {
      single: {
        language: undefined,
        theme: undefined,
        custom_system_prompt: '',
        feature_configs: undefined,
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    const state = useSettingsStore.getState();
    expect(state.language).toBe('en');
    expect(state.theme).toBe('system');
    expect(state.customSystemPrompt).toBeUndefined();
    expect(state.featureConfigs.generate.model).toBe('openai/gpt-5.6-luna');
  });

  it('normalizes persisted state in onRehydrateStorage callback', () => {
    const onRehydrateStorage = useSettingsStore.persist.getOptions().onRehydrateStorage;
    expect(onRehydrateStorage).toBeTypeOf('function');

    const afterRehydrate = onRehydrateStorage?.(useSettingsStore.getState());
    if (!afterRehydrate) throw new Error('Expected a rehydration callback');

    const partialState = {
      featureConfigs: undefined,
      language: '',
      theme: '',
      wikiResearchEnabled: undefined,
    } as any;

    afterRehydrate(partialState);

    expect(partialState.featureConfigs.generate).toBeDefined();
    expect(partialState.language).toBe('en');
    expect(partialState.theme).toBe('system');
    expect(partialState.wikiResearchEnabled).toBe(false);
  });

  it('canonicalizes legacy local configs and removes client credentials', () => {
    const onRehydrateStorage = useSettingsStore.persist.getOptions().onRehydrateStorage;
    const afterRehydrate = onRehydrateStorage?.(useSettingsStore.getState());
    if (!afterRehydrate) throw new Error('Expected a rehydration callback');

    const partialState = {
      featureConfigs: {
        generate: {
          provider: 'google',
          model: 'gemini-3-flash-preview',
          temperature: 0.3,
          reasoningEffort: 'medium',
          apiKey: 'legacy-secret',
          baseUrl: 'https://legacy.example.test',
        },
      },
    } as any;

    afterRehydrate(partialState);

    expect(partialState.featureConfigs.generate).toMatchObject({
      provider: 'openrouter',
      model: 'google/gemini-3.8-flash',
      temperature: 0.3,
      reasoningEffort: 'medium',
    });
    expect(partialState.featureConfigs.generate).not.toHaveProperty('apiKey');
    expect(partialState.featureConfigs.generate).not.toHaveProperty('baseUrl');
  });

  it('normalizes a stored local mock fixture back to the real provider on rehydration', () => {
    const onRehydrateStorage = useSettingsStore.persist.getOptions().onRehydrateStorage;
    const afterRehydrate = onRehydrateStorage?.(useSettingsStore.getState());
    if (!afterRehydrate) throw new Error('Expected a rehydration callback');

    const partialState = {
      featureConfigs: {
        generate: { provider: 'mock', model: 'local', temperature: 0.7 },
      },
    } as any;

    afterRehydrate(partialState);

    // The in-app mock provider is gone; e2e specs stub the network instead, so
    // a leftover 'mock'/'local' pair must not survive into a live config.
    expect(partialState.featureConfigs.generate).toMatchObject({
      provider: 'openrouter',
      reasoningEffort: 'low',
    });
    expect(partialState.featureConfigs.generate.model).not.toBe('local');
  });

  it('durably migrates legacy local credentials to the default OpenRouter config', async () => {
    localStorage.setItem('debate-trainer-settings', JSON.stringify({
      version: 0,
      state: {
        featureConfigs: {
          generate: {
            provider: 'openai',
            model: 'gpt-5.5',
            temperature: 0.4,
            apiKey: 'legacy-secret',
            baseUrl: 'https://legacy.example.test',
          },
        },
      },
    }));

    await useSettingsStore.persist.rehydrate();

    const persisted = JSON.parse(localStorage.getItem('debate-trainer-settings') || '{}');
    expect(persisted.version).toBe(2);
    expect(persisted.state.featureConfigs.generate).toMatchObject({
      provider: 'openrouter',
      model: 'openai/gpt-5.6-luna',
      temperature: 0.4,
      reasoningEffort: 'low',
    });
    expect(persisted.state.featureConfigs.generate).not.toHaveProperty('apiKey');
    expect(persisted.state.featureConfigs.generate).not.toHaveProperty('baseUrl');
  });

  it('uses Luna for a saved GLM default until entitlement hydration completes', async () => {
    localStorage.setItem('debate-trainer-settings', JSON.stringify({
      version: 1,
      state: {
        featureConfigs: {
          generate: {
            provider: 'openrouter',
            model: 'z-ai/glm-5.3-flash',
            temperature: 0.7,
            reasoningEffort: 'low',
          },
        },
      },
    }));

    await useSettingsStore.persist.rehydrate();

    const persisted = JSON.parse(localStorage.getItem('debate-trainer-settings') || '{}');
    expect(persisted.version).toBe(2);
    expect(persisted.state.featureConfigs.generate.model).toBe('openai/gpt-5.6-luna');
  });

  it("keeps Auto Fast for trial users", async () => {
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "trial",
        trial_ends_at: "2099-01-01T00:00:00.000Z",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "auto-fast",
            temperature: 0.7,
            reasoningEffort: "high",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate).toMatchObject({
      model: "auto-fast",
      reasoningEffort: "high",
    });
  });

  it("moves an inaccessible Auto Pro selection to Auto Fast", async () => {
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "trial",
        trial_ends_at: "2099-01-01T00:00:00.000Z",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "auto-pro",
            temperature: 0.7,
            reasoningEffort: "high",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("auto-fast");
  });

  it("keeps Auto Pro for active Pro users", async () => {
    setMockTableResponse("subscriptions", {
      select: [{ status: "active", current_period_end: "2099-01-01T00:00:00.000Z" }],
    });
    setMockTableResponse("user_settings", {
      single: {
        subscription_tier: "pro",
        feature_configs: {
          generate: {
            provider: "openrouter",
            model: "auto-pro",
            temperature: 0.7,
            reasoningEffort: "high",
          },
        },
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().featureConfigs.generate.model).toBe("auto-pro");
  });

  it('resetLocalData can preserve only the interface language', () => {
    const store = useSettingsStore.getState();
    store.setLanguage('hu');
    store.setOutputLanguage('hu');
    store.setTheme('dark');
    store.setSystemPrompt('custom');
    store.resetLocalData(true);

    const state = useSettingsStore.getState();
    expect(state.language).toBe('hu');
    expect(state.outputLanguage).toBe('en');
    expect(state.theme).toBe('system');
    expect(state.customSystemPrompt).toBeUndefined();
  });

  it('hydrateFromServer accepts Hungarian language settings', async () => {
    setMockTableResponse('user_settings', {
      single: {
        language: 'hu',
        output_language: 'hu',
        feature_configs: undefined,
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().language).toBe('hu');
    expect(useSettingsStore.getState().outputLanguage).toBe('hu');
    expect(document.documentElement.lang).toBe('hu');
  });

  it('hydrateFromServer rejects unsupported language settings', async () => {
    setMockTableResponse('user_settings', {
      single: {
        language: 'zz',
        output_language: 'zz',
        feature_configs: undefined,
      },
    });

    await useSettingsStore.getState().hydrateFromServer();

    expect(useSettingsStore.getState().language).toBe('en');
    expect(useSettingsStore.getState().outputLanguage).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('normalizes unsupported locally persisted languages', () => {
    const onRehydrateStorage = useSettingsStore.persist.getOptions().onRehydrateStorage;
    const afterRehydrate = onRehydrateStorage?.(useSettingsStore.getState());
    if (!afterRehydrate) throw new Error('Expected a rehydration callback');

    const partialState = {
      featureConfigs: undefined,
      language: 'zz',
      outputLanguage: 'zz',
    } as any;

    afterRehydrate(partialState);

    expect(partialState.language).toBe('en');
    expect(partialState.outputLanguage).toBe('en');
  });
});
