import { useDebateStore, type Debate } from "@/lib/stores/debate-store";

export const TEST_DEBATE_ID = "11111111-2222-4333-8444-555555555555";

/** Makes a Current Debate active, the way a hydrated signed-in user has one. */
export function seedCurrentDebate(overrides: Partial<Debate> = {}): Debate {
  const debate: Debate = {
    id: TEST_DEBATE_ID,
    motion: "This House would make public transport free",
    settings: {},
    instructions: "",
    lastActivityAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
  useDebateStore.setState({
    ownerUserId: "test-user",
    debates: [debate],
    currentDebateId: debate.id,
    oneOff: false,
    hydrated: true,
    dialog: null,
    dialogMotion: "",
  });
  return debate;
}

export function resetDebates() {
  useDebateStore.setState({ ownerUserId: null, debates: [], currentDebateId: null, oneOff: false, hydrated: false, loadFailed: false, dialog: null, dialogMotion: "" });
}

/** One-off mode: tools neither read from nor save to a debate. */
export function enableOneOffMode() {
  resetDebates();
  useDebateStore.setState({ oneOff: true });
}
