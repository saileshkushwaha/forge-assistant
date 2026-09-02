import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  defaultEnvironmentFilePath,
  defaultEnvironmentFilePaths,
  readDefaultEnvironment,
  resolveEnvironmentName,
} from "../environment";
import {
  guardianTokenPath,
  resolveConfigDir,
  resolveInstanceDir,
  resolveLockfilePaths,
  resolveLogDir,
  resolveRuntimeDir,
} from "../config";

let configHome: string;

/** Write the persisted default-environment file under the temp config home. */
function persistDefault(name: string): void {
  const file = path.join(configHome, "forge", "environment");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, name + "\n", "utf-8");
}

beforeEach(() => {
  configHome = mkdtempSync(path.join(os.tmpdir(), "forge-env-"));
});

afterEach(() => {
  rmSync(configHome, { recursive: true, force: true });
});

describe("defaultEnvironmentFilePath", () => {
  test("honors XDG_CONFIG_HOME", () => {
    expect(defaultEnvironmentFilePath({ XDG_CONFIG_HOME: configHome })).toBe(
      path.join(configHome, "forge", "environment"),
    );
  });

  test("falls back to ~/.config", () => {
    expect(defaultEnvironmentFilePath({})).toBe(
      path.join(os.homedir(), ".config", "forge", "environment"),
    );
  });
});

describe("readDefaultEnvironment", () => {
  test("returns undefined when no file exists", () => {
    expect(
      readDefaultEnvironment({ XDG_CONFIG_HOME: configHome }),
    ).toBeUndefined();
  });

  test("returns the trimmed persisted name", () => {
    persistDefault("dev");
    expect(readDefaultEnvironment({ XDG_CONFIG_HOME: configHome })).toBe("dev");
  });

  test("treats an empty file as no default", () => {
    const file = path.join(configHome, "forge", "environment");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "  \n", "utf-8");
    expect(
      readDefaultEnvironment({ XDG_CONFIG_HOME: configHome }),
    ).toBeUndefined();
  });
});

describe("resolveEnvironmentName", () => {
  test("prefers FORGE_ENVIRONMENT over the persisted default", () => {
    persistDefault("dev");
    expect(
      resolveEnvironmentName({
        XDG_CONFIG_HOME: configHome,
        FORGE_ENVIRONMENT: "staging",
      }),
    ).toBe("staging");
  });

  test("falls back to the persisted default when the env var is unset", () => {
    persistDefault("dev");
    expect(resolveEnvironmentName({ XDG_CONFIG_HOME: configHome })).toBe("dev");
  });

  test("falls back to production when neither is set", () => {
    expect(resolveEnvironmentName({ XDG_CONFIG_HOME: configHome })).toBe(
      "production",
    );
  });
});

describe("path resolvers honor the persisted default", () => {
  test("resolveLockfilePaths points at the persisted environment", () => {
    persistDefault("dev");
    const env = { XDG_CONFIG_HOME: configHome };
    expect(resolveLockfilePaths(env)).toEqual([
      path.join(configHome, "forge-dev", "lockfile.json"),
    ]);
  });

  test("resolveConfigDir points at the persisted environment", () => {
    persistDefault("dev");
    expect(resolveConfigDir({ XDG_CONFIG_HOME: configHome })).toBe(
      path.join(configHome, "forge-dev"),
    );
  });

  test("FORGE_ENVIRONMENT still wins for path resolution", () => {
    persistDefault("dev");
    const env = {
      XDG_CONFIG_HOME: configHome,
      FORGE_ENVIRONMENT: "production",
    };
    expect(resolveLockfilePaths(env)).toEqual([
      path.join(os.homedir(), ".forge.lock.json"),
      path.join(os.homedir(), ".forge.lockfile.json"),
    ]);
  });
});

describe("Windows path resolution", () => {
  const options = {
    platform: "win32" as const,
    homeDir: "C:\\Users\\Example",
  };
  const env = {
    APPDATA: "C:\\Users\\Example\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\Example\\AppData\\Local",
    XDG_CONFIG_HOME: "D:\\LegacyConfig",
    FORGE_ENVIRONMENT: "dev",
  };

  test("uses AppData with XDG read compatibility", () => {
    const paths = [
      [defaultEnvironmentFilePath(env, options), "AppData\\Roaming\\forge\\environment"],
      [resolveConfigDir(env, options), "AppData\\Roaming\\forge-dev"],
      [resolveRuntimeDir(env, options), "AppData\\Local\\forge-dev"],
      [resolveLogDir(env, options), "AppData\\Local\\forge-dev\\logs"],
      [resolveInstanceDir(env, "assistant-123", options), "AppData\\Local\\forge-dev\\assistants\\assistant-123"],
    ];
    for (const [actual, suffix] of paths) {
      expect(actual).toBe(`C:\\Users\\Example\\${suffix}`);
    }
    expect(resolveLockfilePaths(env, options)).toEqual([
      "C:\\Users\\Example\\AppData\\Roaming\\forge-dev\\lockfile.json",
      "D:\\LegacyConfig\\forge-dev\\lockfile.json",
    ]);
  });

  test("falls back to conventional AppData directories", () => {
    const productionEnv = { FORGE_ENVIRONMENT: "production" };
    expect(resolveLockfilePaths(productionEnv, options)).toEqual([
      "C:\\Users\\Example\\AppData\\Roaming\\forge\\lockfile.json",
      "C:\\Users\\Example\\.forge.lock.json",
      "C:\\Users\\Example\\.forge.lockfile.json",
    ]);
    expect(defaultEnvironmentFilePaths(env, options)).toEqual([
      "C:\\Users\\Example\\AppData\\Roaming\\forge\\environment",
      "D:\\LegacyConfig\\forge\\environment",
    ]);
  });

  test("rejects unsafe path segments", () => {
    for (const assistantId of ["../other", "nested/other", "CON", "bad\\id"]) {
      expect(() => resolveInstanceDir(env, assistantId, options)).toThrow(
        "Invalid assistant ID",
      );
      expect(() =>
        guardianTokenPath("C:\\Forge", assistantId, options),
      ).toThrow("Invalid assistant ID");
    }
  });
});
