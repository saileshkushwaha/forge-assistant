import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  getDeviceId,
  getExistingDeviceId,
  resetDeviceIdCache,
} from "../util/device-id.js";

const originalForgeEnvironment = process.env.FORGE_ENVIRONMENT;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalIsContainerized = process.env.IS_CONTAINERIZED;
const originalForgeDeviceId = process.env.FORGE_DEVICE_ID;

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "forge-device-id-test-"));
  delete process.env.FORGE_DEVICE_ID;
  resetDeviceIdCache();
});

afterEach(() => {
  resetDeviceIdCache();

  if (originalForgeEnvironment == null) {
    delete process.env.FORGE_ENVIRONMENT;
  } else {
    process.env.FORGE_ENVIRONMENT = originalForgeEnvironment;
  }
  if (originalXdgConfigHome == null) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  if (originalIsContainerized == null) {
    delete process.env.IS_CONTAINERIZED;
  } else {
    process.env.IS_CONTAINERIZED = originalIsContainerized;
  }
  if (originalForgeDeviceId == null) {
    delete process.env.FORGE_DEVICE_ID;
  } else {
    process.env.FORGE_DEVICE_ID = originalForgeDeviceId;
  }

  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

describe("getDeviceId env-awareness", () => {
  test("non-prod (dev) writes device.json under $XDG_CONFIG_HOME/forge-dev", () => {
    // Guarantee we're not containerized — the test-preload deletes this,
    // but be defensive.
    delete process.env.IS_CONTAINERIZED;
    process.env.FORGE_ENVIRONMENT = "dev";
    process.env.XDG_CONFIG_HOME = tempDir;

    const id = getDeviceId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const expectedPath = join(tempDir, "forge-dev", "device.json");
    expect(existsSync(expectedPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(expectedPath, "utf-8"));
    expect(parsed.deviceId).toBe(id);
  });

  test("staging environment writes under $XDG_CONFIG_HOME/forge-staging", () => {
    delete process.env.IS_CONTAINERIZED;
    process.env.FORGE_ENVIRONMENT = "staging";
    process.env.XDG_CONFIG_HOME = tempDir;

    getDeviceId();

    const expectedPath = join(tempDir, "forge-staging", "device.json");
    expect(existsSync(expectedPath)).toBe(true);
  });

  test("unknown environment does NOT write under $XDG_CONFIG_HOME/forge-<unknown>", () => {
    // Unknown env names fall back to the legacy production behavior.
    // We can't assert the exact legacy path without mocking homedir(),
    // but we can assert that the XDG env-scoped dir is NOT created.
    delete process.env.IS_CONTAINERIZED;
    process.env.FORGE_ENVIRONMENT = "no-such-env";
    process.env.XDG_CONFIG_HOME = tempDir;

    getDeviceId();

    // No `forge-no-such-env` directory created under our XDG tempdir.
    const envScopedPath = join(tempDir, "forge-no-such-env", "device.json");
    expect(existsSync(envScopedPath)).toBe(false);
    // Legacy fallback would write under `${homedir()}/.forge` — not touched.
    const productionXdgPath = join(tempDir, "forge", "device.json");
    expect(existsSync(productionXdgPath)).toBe(false);
  });

  test("production does NOT write under $XDG_CONFIG_HOME/forge", () => {
    // Production path is ~/.forge/device.json, never XDG_CONFIG_HOME.
    delete process.env.IS_CONTAINERIZED;
    delete process.env.FORGE_ENVIRONMENT;
    process.env.XDG_CONFIG_HOME = tempDir;

    getDeviceId();

    const xdgPath = join(tempDir, "forge", "device.json");
    expect(existsSync(xdgPath)).toBe(false);
  });
});

describe("getDeviceId FORGE_DEVICE_ID precedence", () => {
  beforeEach(() => {
    delete process.env.IS_CONTAINERIZED;
    process.env.FORGE_ENVIRONMENT = "dev";
    process.env.XDG_CONFIG_HOME = tempDir;
  });

  test("env var set returns that value without writing device.json", () => {
    process.env.FORGE_DEVICE_ID = "abc-123";

    expect(getDeviceId()).toBe("abc-123");
    // Nothing written anywhere under the XDG tempdir.
    expect(readdirSync(tempDir)).toEqual([]);
  });

  test("env var with surrounding whitespace returns the trimmed value", () => {
    process.env.FORGE_DEVICE_ID = "  abc-123  ";

    expect(getDeviceId()).toBe("abc-123");
  });

  test("empty/whitespace-only env var falls through to file resolution", () => {
    process.env.FORGE_DEVICE_ID = "   ";

    const id = getDeviceId();
    expect(id.length).toBeGreaterThan(0);
    expect(existsSync(join(tempDir, "forge-dev", "device.json"))).toBe(true);
  });

  test("env var wins over an existing device.json without overwriting it", () => {
    const dir = join(tempDir, "forge-dev");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "device.json");
    writeFileSync(filePath, JSON.stringify({ deviceId: "file-id" }));
    process.env.FORGE_DEVICE_ID = "env-id";

    expect(getDeviceId()).toBe("env-id");
    expect(JSON.parse(readFileSync(filePath, "utf-8")).deviceId).toBe(
      "file-id",
    );
  });

  test("env-resolved value stays cached until resetDeviceIdCache", () => {
    process.env.FORGE_DEVICE_ID = "env-id";
    expect(getDeviceId()).toBe("env-id");

    delete process.env.FORGE_DEVICE_ID;
    expect(getDeviceId()).toBe("env-id");

    resetDeviceIdCache();
    expect(getDeviceId()).not.toBe("env-id");
  });
});

describe("getExistingDeviceId", () => {
  beforeEach(() => {
    delete process.env.IS_CONTAINERIZED;
    process.env.FORGE_ENVIRONMENT = "dev";
    process.env.XDG_CONFIG_HOME = tempDir;
  });

  test("returns null without creating device.json when no id exists", () => {
    const expectedPath = join(tempDir, "forge-dev", "device.json");

    expect(getExistingDeviceId()).toBeNull();
    expect(existsSync(expectedPath)).toBe(false);
  });

  test("reads an existing device.json id", () => {
    const dir = join(tempDir, "forge-dev");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "device.json"),
      JSON.stringify({ deviceId: "file-id" }),
    );

    expect(getExistingDeviceId()).toBe("file-id");
  });

  test("returns the env override without writing device.json", () => {
    process.env.FORGE_DEVICE_ID = "env-id";

    expect(getExistingDeviceId()).toBe("env-id");
    expect(readdirSync(tempDir)).toEqual([]);
  });
});
