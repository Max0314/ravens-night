import { describe, expect, test } from "vitest";
import { chooseInformationResult, chooseRegistration } from "./policy.js";

describe("automated storyteller", () => {
  test("healthy information is truthful", () => {
    expect(chooseInformationResult({ seed: "a", eventSeq: 4, truthful: 2, legal: [0, 1, 2], impaired: false })).toBe(2);
  });

  test("impaired information is legal and deterministic", () => {
    const context = { seed: "a", eventSeq: 4, truthful: 2, legal: [0, 1, 2], impaired: true };
    const result = chooseInformationResult(context);
    expect([0, 1, 2]).toContain(result);
    expect(chooseInformationResult(context)).toBe(result);
  });

  test("recluse and spy registrations stay inside role permissions", () => {
    expect(["GOOD", "EVIL"]).toContain(chooseRegistration("recluse", "ALIGNMENT", "seed", 1));
    expect(["GOOD", "EVIL"]).toContain(chooseRegistration("spy", "ALIGNMENT", "seed", 1));
    expect(chooseRegistration("washerwoman", "ALIGNMENT", "seed", 1)).toBe("GOOD");
  });
});
