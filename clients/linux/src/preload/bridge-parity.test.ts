import { expect, mock, test } from "bun:test";
import type { IpcRenderer } from "electron";
import { readdirSync } from "node:fs";
import path from "node:path";

import {
  BridgeCapabilityRegistry,
  installCapabilityModules,
  type CapabilityModuleExport,
} from "@forgeai/electron-desktop/capability-registry";
import { FORGE_BRIDGE_KEYS, type ForgeBridge } from "@forgeai/ipc-contract";

const exposed = new Map<string, unknown>();
const ipcRenderer = {
  invoke: mock(() => Promise.resolve()),
  off: mock(() => undefined),
  on: mock(() => undefined),
  send: mock(() => undefined),
  sendSync: mock(() => null),
};
mock.module("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      exposed.set(key, value);
    },
  },
  ipcRenderer,
  webUtils: { getPathForFile: mock(() => "") },
}));

const { createLinuxCoreBridge, LINUX_NOT_APPLICABLE_CAPABILITIES } =
  await import("./core-capabilities");

const featuresDir = path.join(import.meta.dir, "features");
const featureModules: Record<
  string,
  CapabilityModuleExport<BridgeCapabilityRegistry<ForgeBridge>>
> = {};
for (const file of readdirSync(featuresDir)) {
  if (!file.endsWith(".ts") || file.endsWith(".test.ts")) {
    continue;
  }
  featureModules[`./features/${file}`] = (await import(
    path.join(featuresDir, file)
  )) as CapabilityModuleExport<BridgeCapabilityRegistry<ForgeBridge>>;
}

const composeLinuxBridge = (): Partial<ForgeBridge> => {
  const registry = new BridgeCapabilityRegistry<ForgeBridge>(
    createLinuxCoreBridge(ipcRenderer as unknown as IpcRenderer),
  );
  installCapabilityModules(registry, featureModules);
  return registry.build();
};

await import("../../../macos/src/preload/index");
const macBridge = exposed.get("forge") as ForgeBridge;

const surface = (value: unknown, prefix = ""): string[] => {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value)
    .flatMap(([key, child]) =>
      surface(child, prefix ? `${prefix}.${key}` : key),
    )
    .sort();
};

const NOT_APPLICABLE: readonly string[] = LINUX_NOT_APPLICABLE_CAPABILITIES;
const required = FORGE_BRIDGE_KEYS.filter(
  (key) => !NOT_APPLICABLE.includes(key),
);

const LINUX_ONLY_SURFACE = [
  "helper.hotkey.onRegistrationChange",
  "helper.hotkey.setVoiceModeChord",
  "menu.popup",
  "menu.titles",
];
// The macOS helper watches the raw keyboard, which is where the Fn tap and
// the bare-modifier hold come from. The Linux sidecar has no such tap, so
// its hotkey surface is the shortcut chord alone.
const MACOS_ONLY_SURFACE = [
  "helper.hotkey.fnPushToTalk",
  "helper.hotkey.setModifierHold",
];

test("the composed Linux bridge satisfies every applicable ForgeBridge key", () => {
  const bridge = composeLinuxBridge();

  for (const key of required) {
    expect(bridge[key], key).toBeDefined();
  }
  expect(Object.keys(bridge).sort()).toEqual([...required].sort());
  expect(bridge.hostOS).toBe("linux");
});

test("the Linux bridge matches the macOS bridge surface up to the documented deltas", () => {
  expect(macBridge).toBeDefined();
  expect(macBridge.hostOS).toBe("macos");
  expect(Object.keys(macBridge).sort()).toEqual([...FORGE_BRIDGE_KEYS].sort());

  const bridge = composeLinuxBridge();
  const shared = required.filter((key) => key !== "hostOS");
  const linuxSurface = shared.flatMap((key) => surface(bridge[key], key));
  const macSurface = shared.flatMap((key) => surface(macBridge[key], key));

  const linuxOnly = linuxSurface.filter((p) => !macSurface.includes(p));
  const macOnly = macSurface.filter((p) => !linuxSurface.includes(p));
  expect(linuxOnly.sort()).toEqual(LINUX_ONLY_SURFACE);
  expect(macOnly.sort()).toEqual(MACOS_ONLY_SURFACE);
});
