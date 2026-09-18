import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMockState,
  setMockAuthUser,
  setMockTableResponse,
  supabaseMock,
} from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/client", () => ({ supabase: supabaseMock }));

import { useSettingsStore } from "@/lib/stores/settings-store";

describe("settings-store", () => {
  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    useSettingsStore.getState().resetLocalData();
  });

  it("uses GLM 5.3 Flash through OpenRouter for all features", () => {
    const state = useSettingsStore.getState();
    expect(state.featureConfigs.generate.provider).toBe("openrouter");
    expect(state.featureConfigs.generate.model).toBe("z-ai/glm-5.3-flash");
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

  it("setSystemPrompt updates local state and upserts settings", async () => {
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
    expect(state.featureConfigs.generate.model).toBe("z-ai/glm-5.3-flash");
    expect(state.featureConfigs.attack.model).toBe("z-ai/glm-5.3-flash");
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
    expect(state.featureConfigs.generate.model).toBe("z-ai/glm-5.3-flash");
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

    const settingsQuery = supabaseMock.from.mock.results.find(({ value }) => value.upsert)?.value;
    expect(settingsQuery.upsert).toHaveBeenCalledWith(
      expect.any(Object),
      { onConflict: "user_id" },
    );
    expect(settingsQuery.upsert.mock.calls[0][0]).not.toHaveProperty("wiki_research_enabled");
  });

  it("reports settings persistence failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const upsert = vi.fn(async () => ({ data: null, error: { message: "database unavailable" } }));
    supabaseMock.from.mockImplementationOnce((() => ({ upsert })) as never);

    useSettingsStore.getState().setTheme("dark");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).toHaveBeenCalledWith("[SettingsStore] Failed to persist settings:", "database unavailable");
    warnSpy.mockRestore();
  });

  it("getFeatureConfig returns defaults when missing", () => {
    useSettingsStore.setState({ featureConfigs: {} } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    const config = useSettingsStore.getState().getFeatureConfig("ask");
    expect(config.provider).toBe("openrouter");
    expect(config.model).toBe("z-ai/glm-5.3-flash");
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
      model: "z-ai/glm-5.3-flash",
      temperature: 0.4,
      reasoningEffort: "high",
    });
    expect(generate).not.toHaveProperty("apiKey");
    expect(generate).not.toHaveProperty("baseUrl");
    expect(attack).toMatchObject({ provider: "openrouter", model: "z-ai/glm-5.3-flash", reasoningEffort: "low" });
    expect(attack).not.toHaveProperty("apiKey");

    const settingsWrite = supabaseMock.from.mock.results.find(({ value }) => value.update.mock.calls.length)?.value;
    expect(settingsWrite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        feature_configs: expect.objectContaining({
          generate: expect.objectContaining({ provider: "openrouter", model: "z-ai/glm-5.3-flash" }),
          attack: expect.objectContaining({ provider: "openrouter", model: "z-ai/glm-5.3-flash" }),
        }),
      }),
    );
    expect(settingsWrite.update.mock.calls[0][0].feature_configs.generate).not.toHaveProperty("apiKey");
    expect(settingsWrite.update.mock.calls[0][0].feature_configs.generate).not.toHaveProperty("baseUrl");
    expect(settingsWrite.update.mock.results[0].value.eq).toHaveBeenCalledWith("user_id", "user_1");
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

  it("does not upsert when user is not signed in", async () => {
    setMockAuthUser(null);
    const store = useSettingsStore.getState();
    store.setTheme("dark");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
