import { describe, expect, test } from "bun:test";

import { isForgeStaff } from "@/lib/auth/staff";
import type { AuthUser } from "@/stores/auth-store";

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    kind: "platform",
    id: "user-123",
    username: null,
    email: "user@example.com",
    isStaff: false,
    firstName: "",
    lastName: "",
    ...overrides,
  };
}

describe("isForgeStaff", () => {
  test("accepts the platform staff bit", () => {
    expect(isForgeStaff(user({ isStaff: true }))).toBe(true);
  });

  test("accepts a Forge address case-insensitively", () => {
    expect(isForgeStaff(user({ email: "alice@" + "FORGE.AI" }))).toBe(true);
  });

  test("rejects a lookalike domain", () => {
    // Suffix matching includes the "@", so a domain that merely ends in
    // "forge.ai" does not qualify.
    expect(isForgeStaff(user({ email: "eve@notforge.ai" }))).toBe(false);
  });

  test("rejects regular users", () => {
    expect(isForgeStaff(user({ email: "user@example.com" }))).toBe(false);
  });

  test("rejects sessions carrying neither signal", () => {
    // Local gateway sessions have no email and no staff bit.
    expect(isForgeStaff(null)).toBe(false);
    expect(isForgeStaff(user({ email: null }))).toBe(false);
  });
});
