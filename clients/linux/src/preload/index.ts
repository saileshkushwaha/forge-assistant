import { contextBridge, ipcRenderer } from "electron";

import type {
  AppVersionInfo,
  ForgeBridge,
  ForgeCommand,
} from "@forgeai/ipc-contract";

import { createLinuxCoreBridge } from "./core-capabilities";
import { composePreloadFeatures } from "./features";

export type { AppVersionInfo, ForgeBridge, ForgeCommand };

// The always-present core plus every `./features/` module;
// `bridge-parity.test.ts` holds the composed bridge to the full contract.
const bridge = composePreloadFeatures(createLinuxCoreBridge(ipcRenderer));
contextBridge.exposeInMainWorld("forge", bridge);

const forgeConfig = ipcRenderer.sendSync("forge:config:get") as {
  webUrl: string;
  platformUrl: string;
  disablePlatform?: boolean;
  deviceId: string | null;
} | null;
if (forgeConfig) {
  contextBridge.exposeInMainWorld("__FORGE_CONFIG__", forgeConfig);
}

const flagOverrides: Record<string, boolean | string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("FORGE_FLAG_") || value === undefined) {
    continue;
  }
  const flagKey = key
    .slice("FORGE_FLAG_".length)
    .toLowerCase()
    .replace(/_/g, "-");
  const lower = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(lower)) {
    flagOverrides[flagKey] = true;
  } else if (["false", "0", "no", "off"].includes(lower)) {
    flagOverrides[flagKey] = false;
  } else {
    flagOverrides[flagKey] = value.trim();
  }
}
if (Object.keys(flagOverrides).length > 0) {
  contextBridge.exposeInMainWorld("__FORGE_FLAG_OVERRIDES__", flagOverrides);
}
