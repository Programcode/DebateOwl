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
    useSettingsStore.setState({
      language: "en",
      theme: "system",
      customSystemPrompt: undefined,
      wikiResearchEnabled: false,
      featureConfigs: {
        generate: { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 },
        attack: { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 },
        brainstorm: { provider: "google", model: "gemini-3-flash-preview", temperature: 0.9 },
        factoids: { provider: "google", model: "gemini-3-flash-preview", temperature: 0.3 },
        ask: { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 },
      },
    });
  });

  it("uses Gemini 3 Flash defaults for all features", () => {
    const state = useSettingsStore.getState();
    expect(state.featureConfigs.generate.provider).toBe("google");
    expect(state.featureConfigs.generate.model).toBe("gemini-3-flash-preview");
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

  it("hydrateFromServer merges defaults with server configs", async () => {
    setMockTableResponse("user_settings", {
      single: {
        language: "es",
        theme: "dark",
        custom_system_prompt: "Server prompt",
        feature_configs: {
          generate: { provider: "google", model: "gemini-3-flash-preview", temperature: 0.4 },
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
    expect(state.featureConfigs.attack.model).toBe("gemini-3-flash-preview");
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
    expect(state.wikiResearchEnabled).toBe(false);
  });

  it("setWikiResearchEnabled updates local state only", () => {
    const store = useSettingsStore.getState();
    store.setWikiResearchEnabled(true);
    expect(useSettingsStore.getState().wikiResearchEnabled).toBe(true);
  });

  it("getFeatureConfig returns defaults when missing", () => {
    useSettingsStore.setState({ featureConfigs: {} } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    const config = useSettingsStore.getState().getFeatureConfig("ask");
    expect(config.provider).toBe("google");
    expect(config.model).toBe("gemini-3-flash-preview");
  });

  it("does not upsert when user is not signed in", () => {
    setMockAuthUser(null);
    const store = useSettingsStore.getState();
    store.setTheme("dark");
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
