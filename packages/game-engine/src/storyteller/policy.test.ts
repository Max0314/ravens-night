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


test("drunk or poisoned boolean information can be either true or false", () => {
  const outputs = Array.from({ length: 100 }, (_, index) => chooseInformationResult({ seed: `varied-${index}`, eventSeq: index, truthful: true, legal: [true, false], impaired: true, history: ["false"], livingCount: 3 }));
  expect(new Set(outputs)).toEqual(new Set([true, false]));
});

test("Spy and Recluse registration cover each permitted role type", () => {
  const spy = new Set(Array.from({ length: 100 }, (_, index) => chooseRegistration("spy", "ROLE_TYPE", `seed-${index}`, index)));
  const recluse = new Set(Array.from({ length: 100 }, (_, index) => chooseRegistration("recluse", "ROLE_TYPE", `seed-${index}`, index)));
  expect(spy).toEqual(new Set(["MINION", "TOWNSFOLK", "OUTSIDER"]));
  expect(recluse).toEqual(new Set(["OUTSIDER", "MINION", "DEMON"]));
});
