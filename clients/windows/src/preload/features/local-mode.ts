import { ipcRenderer } from "electron";

import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import { createLocalModeBridge } from "@forgeai/electron-desktop/local-mode-bridge";
import type { ForgeBridge } from "@forgeai/ipc-contract";

const localModeFeature: CapabilityModule<
  BridgeCapabilityRegistry<ForgeBridge>
> = {
  id: "local-mode",
  install: (registry) => {
    registry.contribute("localMode", createLocalModeBridge(ipcRenderer));
  },
};

export default localModeFeature;
