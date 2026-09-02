import { ipcRenderer } from "electron";

import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import { createUpdateBridge } from "@forgeai/electron-desktop/preload";
import type { ForgeBridge } from "@forgeai/ipc-contract";

const autoUpdateFeature: CapabilityModule<
  BridgeCapabilityRegistry<ForgeBridge>
> = {
  id: "auto-update",
  install: (registry) => {
    registry.contribute("update", createUpdateBridge(ipcRenderer));
  },
};

export default autoUpdateFeature;
