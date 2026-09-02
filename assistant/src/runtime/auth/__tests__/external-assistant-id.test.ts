/**
 * Tests for getExternalAssistantId.
 */
import { afterEach, describe, expect, test } from "bun:test";

import {
  getExternalAssistantId,
  resetExternalAssistantIdCache,
} from "../external-assistant-id.js";

afterEach(() => {
  resetExternalAssistantIdCache();
  delete process.env.FORGE_ASSISTANT_NAME;
});

describe("getExternalAssistantId", () => {
  test("resolves from FORGE_ASSISTANT_NAME env var", () => {
    process.env.FORGE_ASSISTANT_NAME = "forge-cool-eel";
    expect(getExternalAssistantId()).toBe("forge-cool-eel");
  });

  test("caches the resolved value", () => {
    process.env.FORGE_ASSISTANT_NAME = "forge-cool-eel";
    expect(getExternalAssistantId()).toBe("forge-cool-eel");
    // Change env var — cached value should still be returned
    process.env.FORGE_ASSISTANT_NAME = "forge-other-fox";
    expect(getExternalAssistantId()).toBe("forge-cool-eel");
  });

  test("returns undefined when env var is not set", () => {
    expect(getExternalAssistantId()).toBe(undefined);
  });
});
