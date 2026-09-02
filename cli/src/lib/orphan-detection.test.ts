import { afterAll, describe, expect, mock, test } from "bun:test";

import {
  classifyProcess,
  detectOrphanedProcesses,
  isInteractiveCliSession,
} from "./orphan-detection.js";

// `mock.restore()` does not undo `mock.module()`; keep the real module so it
// can be restored in afterAll for later test files in the same run.
const realStepRunner = { ...(await import("./step-runner")) };

describe("isInteractiveCliSession", () => {
  test("matches a live tunnel session launched via a script path", () => {
    expect(
      isInteractiveCliSession(
        "bun /Users/x/.nvm/versions/node/v22.14.0/bin/forge tunnel --provider ngrok",
      ),
    ).toBe(true);
  });

  test("matches interactive subcommands like logs and terminal", () => {
    expect(isInteractiveCliSession("forge logs foo")).toBe(true);
    expect(isInteractiveCliSession("forge terminal")).toBe(true);
  });

  test("matches the other long-running interactive subcommands", () => {
    expect(isInteractiveCliSession("forge events")).toBe(true);
    expect(isInteractiveCliSession("forge client")).toBe(true);
    expect(isInteractiveCliSession("forge ssh quiet-finch")).toBe(true);
    expect(isInteractiveCliSession("forge message quiet-finch hi")).toBe(true);
    expect(isInteractiveCliSession("forge workflows")).toBe(true);
    expect(isInteractiveCliSession("forge-cli tunnel --provider ngrok")).toBe(
      true,
    );
  });

  test("allows the known global flags before the subcommand", () => {
    expect(isInteractiveCliSession("forge --plain tunnel")).toBe(true);
    expect(isInteractiveCliSession("forge --no-color logs foo")).toBe(true);
    expect(isInteractiveCliSession("forge --no-color --plain events")).toBe(
      true,
    );
  });

  test("matches exec sessions even when argv mentions a service name", () => {
    expect(
      isInteractiveCliSession(
        "forge exec -it --service forge-gateway -- /bin/sh",
      ),
    ).toBe(true);
  });

  test("does not match non-interactive CLI wrappers", () => {
    expect(isInteractiveCliSession("forge hatch")).toBe(false);
    expect(isInteractiveCliSession("/usr/bin/forge sleep")).toBe(false);
    expect(isInteractiveCliSession("forge wake")).toBe(false);
    expect(isInteractiveCliSession("forge wake --watch")).toBe(false);
  });

  test("matches the implicit TUI client (bare forge)", () => {
    expect(isInteractiveCliSession("forge")).toBe(true);
    expect(isInteractiveCliSession("bun /Users/x/.nvm/bin/forge")).toBe(true);
    expect(isInteractiveCliSession("forge --plain")).toBe(true);
  });

  test("matches a foreground wake session", () => {
    expect(isInteractiveCliSession("forge wake --foreground")).toBe(true);
    expect(isInteractiveCliSession("forge wake --watch --foreground")).toBe(
      true,
    );
    expect(
      isInteractiveCliSession("bun /Users/x/bin/forge wake --foreground"),
    ).toBe(true);
  });

  test("interactive names in later argv tokens do not match", () => {
    expect(isInteractiveCliSession("forge hatch --name logs")).toBe(false);
    expect(isInteractiveCliSession("forge sleep logs")).toBe(false);
  });

  test("unknown flags before the subcommand do not match", () => {
    expect(isInteractiveCliSession("forge --verbose tunnel")).toBe(false);
  });

  test("repo paths containing forge do not match", () => {
    expect(
      isInteractiveCliSession(
        "node /Users/runner/work/forge-assistant/forge-assistant/scripts/build.js",
      ),
    ).toBe(false);
  });
});

describe("classifyProcess", () => {
  test("labels interactive CLI sessions as forge like any other wrapper", () => {
    expect(classifyProcess("forge tunnel --provider ngrok")).toBe("forge");
    expect(classifyProcess("forge logs foo")).toBe("forge");
    expect(classifyProcess("forge-cli tunnel --provider ngrok")).toBe(
      "forge",
    );
  });

  test("classifies non-interactive CLI wrappers as forge", () => {
    expect(classifyProcess("forge hatch")).toBe("forge");
    expect(classifyProcess("forge")).toBe("forge");
    expect(classifyProcess("/usr/bin/forge sleep")).toBe("forge");
    expect(classifyProcess("forge hatch --name logs")).toBe("forge");
    expect(classifyProcess("forge sleep logs")).toBe("forge");
  });

  test("service process classifications are unchanged", () => {
    expect(classifyProcess("/opt/homebrew/bin/qdrant --config foo")).toBe(
      "qdrant",
    );
    expect(classifyProcess("bun /x/bin/forge-gateway --port 7830")).toBe(
      "gateway",
    );
    expect(classifyProcess("bun /x/bin/forge-daemon start")).toBe("assistant");
    expect(classifyProcess("node daemon start")).toBe("assistant");
    expect(
      classifyProcess("bun /x/bin/forge-openclaw-adapter --port 9000"),
    ).toBe("openclaw-adapter");
  });

  test("macOS desktop app processes stay excluded", () => {
    expect(
      classifyProcess("/Applications/Forge.app/Contents/MacOS/Forge"),
    ).toBe("unknown");
  });

  test("repo paths containing forge do not match", () => {
    expect(
      classifyProcess(
        "node /Users/runner/work/forge-assistant/forge-assistant/scripts/build.js",
      ),
    ).toBe("unknown");
  });
});

describe("detectOrphanedProcesses", () => {
  afterAll(() => {
    mock.module("./step-runner", () => realStepRunner);
  });

  test("skips live interactive sessions but still reports orphaned services", async () => {
    const psOutput = [
      "101 1 bun /Users/x/bin/forge tunnel --provider ngrok",
      "102 1 forge exec -it --service forge-gateway -- /bin/sh",
      "103 1 forge --plain logs foo",
      "104 1 bun /x/bin/forge-gateway --port 7830",
      "105 1 forge hatch",
      "106 1 node /opt/unrelated-service/daemon/main.ts",
      "107 1 node ./tools daemon start",
      "108 1 node /opt/FORGE/daemon/main.ts",
    ].join("\n");
    mock.module("./step-runner", () => ({
      ...realStepRunner,
      execOutput: async () => psOutput,
    }));

    const orphans = await detectOrphanedProcesses({
      excludePids: new Set<string>(),
    });

    expect(orphans.map((o) => o.pid).sort()).toEqual(["104", "105"]);
    expect(orphans.find((o) => o.pid === "104")?.name).toBe("gateway");
    expect(orphans.find((o) => o.pid === "105")?.name).toBe("forge");
  });
});
