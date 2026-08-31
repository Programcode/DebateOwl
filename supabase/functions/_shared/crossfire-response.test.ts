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
