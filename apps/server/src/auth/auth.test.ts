import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password storage", () => {
  test("a stored password hash verifies the original but does not contain it", async () => {
    const hash = await hashPassword("night-secret");
    expect(hash).not.toContain("night-secret");
    await expect(verifyPassword("night-secret", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-secret", hash)).resolves.toBe(false);
  });
});
