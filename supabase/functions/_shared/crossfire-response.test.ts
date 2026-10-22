import { validateCrossfireDebrief } from "./crossfire-response.ts";

Deno.test("Crossfire debrief normalizes omitted sections to documented empty values", () => {
  const result = validateCrossfireDebrief({}, [{ id: "T1" }]);
  if ("error" in result) throw new Error(result.error);
  const expected = {
    concessionsSecured: [],
    controlledQuestions: [],
    weakOrRepetitiveQuestions: [],
    evasiveOrIncompleteAnswers: [],
    missedFollowUps: [],
    betterFollowUpQuestions: [],
    strongestExchange: null,
  };
  if (JSON.stringify(result.value) !== JSON.stringify(expected)) {
    throw new Error(
      `omitted fields were not normalized: ${JSON.stringify(result.value)}`,
    );
  }
});

Deno.test("Crossfire debrief still rejects invalid non-omitted sections", () => {
  const invalidArray = validateCrossfireDebrief({ concessionsSecured: null }, [{
    id: "T1",
  }]);
  if (!("error" in invalidArray)) {
    throw new Error("invalid array value was accepted");
  }

  const invalidReference = validateCrossfireDebrief({
    strongestExchange: { turnIds: ["T999"], claim: "Invented reference" },
  }, [{ id: "T1" }]);
  if (!("error" in invalidReference)) {
    throw new Error("invalid transcript reference was accepted");
  }
});

Deno.test("a single-turn debrief field cannot cite a later turn as well", () => {
  const result = validateCrossfireDebrief({
    evasiveOrIncompleteAnswers: [{
      turnIds: ["T2", "T3"],
      claim: "Turn 2 dodged, judged from turn 3",
    }],
    strongestExchange: { turnIds: ["T1", "T2"], claim: "The opening exchange" },
  }, [{ id: "T1" }, { id: "T2" }, { id: "T3" }]);
  if (!("error" in result) || !result.error.includes("exactly one turn")) {
    throw new Error(`expected a one-turn rejection, got ${JSON.stringify(result)}`);
  }
});
