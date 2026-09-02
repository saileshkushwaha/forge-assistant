import { beforeEach, expect, mock, test } from "bun:test";

import type { ForgeBridge } from "@forgeai/ipc-contract";

const invoke = mock(() => Promise.resolve());
const on = mock(() => undefined);
const off = mock(() => undefined);
const send = mock(() => undefined);

mock.module("electron", () => ({
  ipcRenderer: { invoke, off, on, send },
}));

const { BridgeCapabilityRegistry } =
  await import("@forgeai/electron-desktop/capability-registry");
const { default: deepLinksFeature } = await import("./features/deep-links");

beforeEach(() => {
  invoke.mockClear();
  on.mockClear();
  off.mockClear();
  send.mockClear();
});

test("contributes deep-link delivery and launch-at-login IPC", async () => {
  const registry = new BridgeCapabilityRegistry<ForgeBridge>({});
  deepLinksFeature.install(registry);
  const bridge = registry.build();
  const callback = mock(() => undefined);

  await bridge.deepLinks?.drain();
  const unsubscribe = bridge.deepLinks?.onLink(callback);
  await bridge.launchAtLogin?.get();
  await bridge.launchAtLogin?.set(true);

  expect(invoke).toHaveBeenCalledWith("forge:deepLinks:drain");
  expect(send).toHaveBeenCalledWith("forge:deepLinks:subscribe");
  expect(invoke).toHaveBeenCalledWith("forge:launchAtLogin:get");
  expect(invoke).toHaveBeenCalledWith("forge:launchAtLogin:set", true);

  const calls = on.mock.calls as unknown as Array<
    [string, (event: unknown, link: { kind: "send"; message: string }) => void]
  >;
  const handler = calls[0]?.[1];
  if (!handler) {
    throw new Error("Deep-link event handler was not registered");
  }
  handler({}, { kind: "send", message: "hello" });
  expect(callback).toHaveBeenCalledWith({ kind: "send", message: "hello" });

  unsubscribe?.();
  expect(off).toHaveBeenCalledWith(
    "forge:deepLinks:event",
    expect.any(Function),
  );
  expect(send).toHaveBeenCalledWith("forge:deepLinks:unsubscribe");
});
