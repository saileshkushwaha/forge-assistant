import { describe, expect, test } from "bun:test";

import { shouldAutoStartDaemon } from "../daemon/connection-policy.js";

describe("shouldAutoStartDaemon", () => {
  test("returns true by default (no env vars set)", () => {
    expect(shouldAutoStartDaemon({})).toBe(true);
  });

  test("returns true when FORGE_DAEMON_AUTOSTART=1", () => {
    expect(shouldAutoStartDaemon({ FORGE_DAEMON_AUTOSTART: "1" })).toBe(true);
  });

  test("returns true when FORGE_DAEMON_AUTOSTART=true", () => {
    expect(shouldAutoStartDaemon({ FORGE_DAEMON_AUTOSTART: "true" })).toBe(
      true,
    );
  });

  test("returns false when FORGE_DAEMON_AUTOSTART=0", () => {
    expect(shouldAutoStartDaemon({ FORGE_DAEMON_AUTOSTART: "0" })).toBe(false);
  });

  test("returns false when FORGE_DAEMON_AUTOSTART=false", () => {
    expect(shouldAutoStartDaemon({ FORGE_DAEMON_AUTOSTART: "false" })).toBe(
      false,
    );
  });
});
