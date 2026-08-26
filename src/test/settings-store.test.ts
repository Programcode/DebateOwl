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

  it("uses Gemini 3 Flash defaults for all features", () => {
    const state = useSettingsStore.getState();
    expect(state.featureConfigs.generate.provider).toBe("google");
    expect(state.featureConfigs.generate.model).toBe("gemini-3-flash-preview");
    expect(state.featureConfigs.brainstorm.temperature).toBe(0.9);
    expect(state.featureConfigs.factoids.temperature).toBe(0.3);
    expect(state.featureConfigs.sparring.model).toBe("gemini-3-flash-preview");
    expect(state.featureConfigs.sparring.temperature).toBe(0.75);
  });

  it("setFeatureConfig merges updates and persists with UPDATE, not UPSERT", async () => {
    const store = useSettingsStore.getState();
    store.setFeatureConfig("sparring", { temperature: 0.2 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useSettingsStore.getState().featureConfigs.sparring.temperature).toBe(0.2);
    expect(supabaseMock.from).toHaveBeenCalledWith("user_settings");
    const settingsQuery = supabaseMock.from.mock.results.find(({ value }) => value.update)?.value;
    expect(settingsQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      feature_configs: expect.objectContaining({
        sparring: expect.objectContaining({ temperature: 0.2 }),
      }),
    }));
    expect(settingsQuery.upsert).not.toHaveBeenCalled();
  });

  it("setSystemPrompt updates local state and updates settings", async () => {
    const store = useSettingsStore.getState();
    store.setSystemPrompt("Custom system");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSettingsStore.getState().customSystemPrompt).toBe("Custom system");
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
    expect(state.featureConfigs.generate.provider).toBe("google");
    expect(state.featureConfigs.generate.model).toBe("gemini-3-flash-preview");
    expect(state.featureConfigs.attack.model).toBe("gemini-3-flash-preview");
    expect(state.featureConfigs.sparring.model).toBe("gemini-3-flash-preview");
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
    expect(state.featureConfigs.generate.model).toBe("gemini-3-flash-preview");
    expect(state.featureConfigs.sparring.model).toBe("gemini-3-flash-preview");
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

    const settingsQuery = supabaseMock.from.mock.results.find(({ value }) => value.update)?.value;
    expect(settingsQuery.update).toHaveBeenCalledWith(expect.any(Object));
    expect(settingsQuery.update.mock.calls[0][0]).not.toHaveProperty("wiki_research_enabled");
    expect(settingsQuery.upsert).not.toHaveBeenCalled();
  });

  it("reports settings persistence failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const eq = vi.fn(async () => ({ data: null, error: { message: "database unavailable" } }));
    const update = vi.fn(() => ({ eq }));
    supabaseMock.from.mockImplementationOnce((() => ({ update })) as never);

    useSettingsStore.getState().setTheme("dark");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).toHaveBeenCalledWith("[SettingsStore] Failed to persist settings:", "database unavailable");
    warnSpy.mockRestore();
  });

  it("getFeatureConfig returns defaults when missing", () => {
    useSettingsStore.setState({ featureConfigs: {} } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    const askConfig = useSettingsStore.getState().getFeatureConfig("ask");
    const sparringConfig = useSettingsStore.getState().getFeatureConfig("sparring");
    expect(askConfig.provider).toBe("google");
    expect(askConfig.model).toBe("gemini-3-flash-preview");
    expect(sparringConfig.provider).toBe("google");
    expect(sparringConfig.temperature).toBe(0.75);
  });

  it("does not update settings when user is not signed in", async () => {
    setMockAuthUser(null);
    const store = useSettingsStore.getState();
    store.setTheme("dark");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
