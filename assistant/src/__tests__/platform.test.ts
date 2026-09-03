import { existsSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";

import {
  ensureDataDir,
  forgeRoot,
  formatHomeRelativePath,
  getDataDir,
  getDbPath,
  getHistoryPath,
  getLogsDir,
  getPidPath,
  getSandboxRootDir,
  getSandboxWorkingDir,
  getWorkspaceConfigPath,
  getWorkspaceDir,
  getWorkspaceHooksDir,
  getWorkspacePluginsDir,
  getWorkspacePromptPath,
  getWorkspaceSkillsDir,
  getXdgForgeConfigDirName,
} from "../util/platform.js";

const originalWorkspaceDir = process.env.FORGE_WORKSPACE_DIR;

// This file characterizes path resolution itself (including the ~/.forge
// fallback and literal override paths) without reading or writing those
// locations, so the live-workspace guard is deliberately bypassed.
const originalAllowRealWorkspace =
  process.env.FORGE_ALLOW_REAL_WORKSPACE_IN_TESTS;
process.env.FORGE_ALLOW_REAL_WORKSPACE_IN_TESTS = "1";
afterAll(() => {
  if (originalAllowRealWorkspace === undefined) {
    delete process.env.FORGE_ALLOW_REAL_WORKSPACE_IN_TESTS;
  } else {
    process.env.FORGE_ALLOW_REAL_WORKSPACE_IN_TESTS =
      originalAllowRealWorkspace;
  }
});
const originalForgeEnvironment = process.env.FORGE_ENVIRONMENT;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalWorkspaceDir == null) {
    delete process.env.FORGE_WORKSPACE_DIR;
  } else {
    process.env.FORGE_WORKSPACE_DIR = originalWorkspaceDir;
  }
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
});

// Path characterization: documents the current path layout.
// Root-level helpers always resolve under ~/.forge (from homedir()).
// Workspace helpers resolve under FORGE_WORKSPACE_DIR when set,
// otherwise under ~/.forge/workspace.
describe("path characterization", () => {
  test("formats Windows workspace paths relative to the home directory", () => {
    expect(
      formatHomeRelativePath(
        "C:\\Users\\Alice\\.forge\\workspace",
        "C:\\Users\\Alice",
        win32,
      ),
    ).toBe("~\\.forge\\workspace");
    expect(
      formatHomeRelativePath(
        "D:\\Forge\\workspace",
        "C:\\Users\\Alice",
        win32,
      ),
    ).toBe("D:\\Forge\\workspace");
  });

  test("all path helpers resolve to expected locations", () => {
    // Without FORGE_WORKSPACE_DIR override, workspace is under ~/.forge
    delete process.env.FORGE_WORKSPACE_DIR;
    const root = join(homedir(), ".forge");
    const ws = getWorkspaceDir();
    const data = getDataDir();

    // Workspace is under root
    expect(ws).toBe(join(root, "workspace"));

    // Data dir is under workspace
    expect(data).toBe(join(ws, "data"));

    // Sub-paths under workspace/data
    expect(getDbPath()).toBe(join(data, "db", "assistant.db"));
    expect(getLogsDir()).toBe(join(data, "logs"));
    expect(getHistoryPath()).toBe(join(data, "history"));
    expect(getSandboxRootDir()).toBe(join(data, "sandbox"));
    expect(getSandboxWorkingDir()).toBe(ws);

    // Hooks live under workspace
    expect(getWorkspaceHooksDir()).toBe(join(ws, "hooks"));

    // PID file lives in the workspace directory
    expect(getPidPath()).toBe(join(ws, "forge.pid"));
  });

  test("FORGE_WORKSPACE_DIR overrides workspace location", () => {
    process.env.FORGE_WORKSPACE_DIR = "/tmp/custom-workspace";
    expect(getWorkspaceDir()).toBe("/tmp/custom-workspace");
    expect(getDataDir()).toBe("/tmp/custom-workspace/data");
    // PID path follows workspace override
    expect(getPidPath()).toBe("/tmp/custom-workspace/forge.pid");
  });

  test("hooks directory is inside the workspace boundary", () => {
    delete process.env.FORGE_WORKSPACE_DIR;
    expect(getWorkspaceHooksDir().startsWith(getWorkspaceDir())).toBe(true);
  });

  test("ensureDataDir creates all expected directories", () => {
    // Use a temp FORGE_WORKSPACE_DIR so ensureDataDir writes to a temp dir
    // rather than the real ~/.forge. Root-level dirs still go to ~/.forge
    // but we only verify workspace dirs here to avoid side effects.
    const wsDir = join(tmpdir(), `platform-test-ws-${Date.now()}`);
    process.env.FORGE_WORKSPACE_DIR = wsDir;

    ensureDataDir();

    // Root-level dirs (ensureDataDir always creates these)
    const root = forgeRoot();
    expect(existsSync(root)).toBe(true);

    // Workspace dirs (in our temp location)
    expect(existsSync(wsDir)).toBe(true);
    expect(existsSync(join(wsDir, "skills"))).toBe(true);

    // Data sub-dirs under workspace
    const data = join(wsDir, "data");
    expect(existsSync(data)).toBe(true);
    expect(existsSync(join(data, "db"))).toBe(true);
    expect(existsSync(join(data, "qdrant"))).toBe(true);
    expect(existsSync(join(data, "logs"))).toBe(true);
    expect(existsSync(join(data, "memory"))).toBe(true);
    expect(existsSync(join(data, "memory", "knowledge"))).toBe(true);
    expect(existsSync(join(data, "apps"))).toBe(true);

    rmSync(wsDir, { recursive: true, force: true });
  });
});

describe("XDG config dir name env-awareness", () => {
  test("production returns forge", () => {
    delete process.env.FORGE_ENVIRONMENT;
    delete process.env.XDG_CONFIG_HOME;
    expect(getXdgForgeConfigDirName()).toBe("forge");
  });

  test("production (explicit) returns forge", () => {
    process.env.FORGE_ENVIRONMENT = "production";
    expect(getXdgForgeConfigDirName()).toBe("forge");
  });

  test("dev environment returns forge-dev", () => {
    process.env.FORGE_ENVIRONMENT = "dev";
    expect(getXdgForgeConfigDirName()).toBe("forge-dev");
  });

  test.each(["staging", "test", "local"])(
    "%s environment returns forge-%s",
    (env) => {
      process.env.FORGE_ENVIRONMENT = env;
      expect(getXdgForgeConfigDirName()).toBe(`forge-${env}`);
    },
  );

  test("unknown environment falls back to production", () => {
    process.env.FORGE_ENVIRONMENT = "no-such-env";
    expect(getXdgForgeConfigDirName()).toBe("forge");
  });
});

describe("workspace path primitives", () => {
  test("workspace helpers resolve under workspace dir", () => {
    delete process.env.FORGE_WORKSPACE_DIR;
    const ws = getWorkspaceDir();

    expect(getWorkspaceConfigPath()).toBe(join(ws, "config.json"));
    expect(getWorkspaceSkillsDir()).toBe(join(ws, "skills"));
    expect(getWorkspaceHooksDir()).toBe(join(ws, "hooks"));
    expect(getWorkspacePluginsDir()).toBe(join(ws, "plugins"));
    expect(getWorkspacePromptPath("IDENTITY.md")).toBe(join(ws, "IDENTITY.md"));
    expect(getWorkspacePromptPath("SOUL.md")).toBe(join(ws, "SOUL.md"));
  });
});
