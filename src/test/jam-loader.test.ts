import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JAM_PASSIVE_DELAY_MS, scheduleJamRecorder } from "@/jam-loader";

describe("scheduleJamRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    // jsdom's window timers are not the ones Vitest replaces on globalThis.
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    document.head.querySelectorAll("script[data-jam-recorder]").forEach((node) => node.remove());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.head.querySelectorAll("script[data-jam-recorder]").forEach((node) => node.remove());
    document.body.querySelectorAll("iframe").forEach((frame) => frame.remove());
  });

  function jamScripts(): string[] {
    return [...document.head.querySelectorAll("script[data-jam-recorder]")].map((script) => script.getAttribute("src") ?? "");
  }

  it("stays off the page until the first interaction", () => {
    scheduleJamRecorder({ mediaRecorderAvailable: true });
    vi.advanceTimersByTime(JAM_PASSIVE_DELAY_MS - 1);
    expect(jamScripts()).toEqual([]);

    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(1);
    expect(jamScripts()).toEqual([
      "https://js.jam.dev/recorder.js",
      "https://js.jam.dev/capture.js",
    ]);
  });

  it("loads after the passive delay when nobody interacts", () => {
    scheduleJamRecorder({ mediaRecorderAvailable: true });
    vi.advanceTimersByTime(JAM_PASSIVE_DELAY_MS + 1);
    expect(jamScripts()).toEqual([
      "https://js.jam.dev/recorder.js",
      "https://js.jam.dev/capture.js",
    ]);
  });

  it("does not load where MediaRecorder is missing", () => {
    scheduleJamRecorder({ mediaRecorderAvailable: false });
    window.dispatchEvent(new KeyboardEvent("keydown"));
    vi.advanceTimersByTime(JAM_PASSIVE_DELAY_MS + 1);
    expect(jamScripts()).toEqual([]);
  });

  it("removes Jam frames on pagehide and restores them from the back/forward cache", () => {
    const listened: string[] = [];
    const realAdd = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
      listened.push(String(type));
      realAdd(type, listener, options);
    });

    scheduleJamRecorder({ mediaRecorderAvailable: false });
    expect(listened).toContain("pagehide");
    expect(listened).toContain("pageshow");
    expect(listened).not.toContain("unload");
    expect(listened).not.toContain("beforeunload");

    const frame = document.createElement("iframe");
    frame.src = "https://recorder.jam.dev/capture";
    frame.dataset.jamCapture = "true";
    document.body.append(frame);

    window.dispatchEvent(new Event("pagehide"));
    expect(frame.isConnected).toBe(false);

    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored);
    expect(frame.isConnected).toBe(true);
    frame.remove();
  });
});
