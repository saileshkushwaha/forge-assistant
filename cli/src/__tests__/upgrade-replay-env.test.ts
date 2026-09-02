import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resetHostDeviceIdCache } from "../lib/device-id.js";
import type { DockerStatefulSetSpec } from "../lib/statefulset.js";
import { buildReplayEnv, buildReplayState } from "../lib/upgrade-lifecycle.js";
import { snapshotEnv } from "./helpers/env.js";

const restoreEnv = snapshotEnv([
  "FORGE_PLATFORM_URL",
  "ANTHROPIC_API_KEY",
  "FORGE_DEVICE_ID",
]);

afterEach(() => {
  restoreEnv();
  resetHostDeviceIdCache();
});

describe("buildReplayEnv", () => {
  test("gateway: drops secrets, statics, and PATH; keeps flag overrides", () => {
    const captured = {
      GUARDIAN_BOOTSTRAP_SECRET: "s1",
      CES_SERVICE_TOKEN: "s2",
      ACTOR_TOKEN_SIGNING_KEY: "s3",
      PATH: "/usr/bin",
      GATEWAY_PORT: "18080",
      FORGE_DISABLE_PLATFORM: "1",
      FORGE_DEVICE_ID: "abc",
    };

    expect(buildReplayEnv(captured, "gateway")).toEqual({
      FORGE_DISABLE_PLATFORM: "1",
      FORGE_DEVICE_ID: "abc",
    });
  });

  test("gateway: captured FORGE_PLATFORM_URL dropped when set on host", () => {
    process.env.FORGE_PLATFORM_URL = "https://host.example.com";
    const replay = buildReplayEnv(
      { FORGE_PLATFORM_URL: "https://stale.example.com" },
      "gateway",
    );
    expect(replay).toEqual({});
  });

  test("gateway: captured FORGE_PLATFORM_URL kept when unset on host", () => {
    delete process.env.FORGE_PLATFORM_URL;
    const replay = buildReplayEnv(
      { FORGE_PLATFORM_URL: "https://stale.example.com" },
      "gateway",
    );
    expect(replay).toEqual({
      FORGE_PLATFORM_URL: "https://stale.example.com",
    });
  });

  test("assistant: drops builder-computed extras, secrets, and PATH; keeps custom flags", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const captured = {
      FORGE_ASSISTANT_NAME: "my-assistant",
      GATEWAY_INTERNAL_URL: "http://localhost:8080",
      GUARDIAN_BOOTSTRAP_SECRET: "s1",
      CES_SERVICE_TOKEN: "s2",
      ACTOR_TOKEN_SIGNING_KEY: "s3",
      PATH: "/usr/bin",
      MY_CUSTOM_FLAG: "yes",
      ANTHROPIC_API_KEY: "sk-captured",
    };

    expect(buildReplayEnv(captured, "assistant")).toEqual({
      MY_CUSTOM_FLAG: "yes",
      ANTHROPIC_API_KEY: "sk-captured",
    });
  });

  test("assistant: captured ANTHROPIC_API_KEY dropped when set on host", () => {
    process.env.ANTHROPIC_API_KEY = "sk-host";
    const replay = buildReplayEnv(
      { ANTHROPIC_API_KEY: "sk-captured", MY_CUSTOM_FLAG: "yes" },
      "assistant",
    );
    expect(replay).toEqual({ MY_CUSTOM_FLAG: "yes" });
  });

  test("a secret added to the spec is auto-excluded with no code change", () => {
    const spec: DockerStatefulSetSpec = {
      startOrder: ["gateway"],
      readiness: { endpoint: "/readyz", timeoutMs: 1, intervalMs: 1 },
      volumeClaimTemplates: [],
      containers: [
        {
          name: "gateway-sidecar",
          internalName: "gateway",
          network: "container",
          env: [
            { kind: "secret", name: "FUTURE_SECRET", secret: "signingKey" },
          ],
          volumeMounts: [],
        },
      ],
    };

    const replay = buildReplayEnv(
      { FUTURE_SECRET: "leaky", FORGE_DEVICE_ID: "abc" },
      "gateway",
      spec,
    );
    expect(replay).toEqual({ FORGE_DEVICE_ID: "abc" });
  });
});

describe("buildReplayState", () => {
  beforeEach(() => {
    // FORGE_DEVICE_ID env precedence keeps getOrCreateHostDeviceId off the
    // filesystem in tests.
    process.env.FORGE_DEVICE_ID = "host-device-id";
    resetHostDeviceIdCache();
  });

  test("backfills FORGE_DEVICE_ID on gateway replay env when absent", () => {
    const state = buildReplayState({}, { FORGE_DISABLE_PLATFORM: "1" });
    expect(state.extraGatewayEnv).toEqual({
      FORGE_DISABLE_PLATFORM: "1",
      FORGE_DEVICE_ID: "host-device-id",
    });
  });

  test("captured FORGE_DEVICE_ID wins over host-derived id", () => {
    const state = buildReplayState({}, { FORGE_DEVICE_ID: "existing" });
    expect(state.extraGatewayEnv.FORGE_DEVICE_ID).toBe("existing");
  });

  test("backfills FORGE_DEVICE_ID on assistant replay env when absent", () => {
    const state = buildReplayState({}, {});
    expect(state.extraAssistantEnv.FORGE_DEVICE_ID).toBe("host-device-id");
  });

  test("assistant backfill inherits captured gateway FORGE_DEVICE_ID", () => {
    const state = buildReplayState({}, { FORGE_DEVICE_ID: "gw-captured" });
    expect(state.extraGatewayEnv.FORGE_DEVICE_ID).toBe("gw-captured");
    expect(state.extraAssistantEnv.FORGE_DEVICE_ID).toBe("gw-captured");
  });

  test("captured assistant FORGE_DEVICE_ID wins over host-derived id", () => {
    const state = buildReplayState({ FORGE_DEVICE_ID: "existing" }, {});
    expect(state.extraAssistantEnv.FORGE_DEVICE_ID).toBe("existing");
  });

  test("plucks secrets from the captured envs", () => {
    const state = buildReplayState(
      { CES_SERVICE_TOKEN: "ces-token", ACTOR_TOKEN_SIGNING_KEY: "sign-key" },
      { GUARDIAN_BOOTSTRAP_SECRET: "bootstrap" },
    );
    expect(state.bootstrapSecret).toBe("bootstrap");
    expect(state.cesServiceToken).toBe("ces-token");
    expect(state.signingKey).toBe("sign-key");
  });

  test("generates fresh secrets when missing from captured env", () => {
    const state = buildReplayState({}, {});
    expect(state.bootstrapSecret).toBeUndefined();
    expect(state.cesServiceToken).toMatch(/^[0-9a-f]{64}$/);
    expect(state.signingKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
