import { ipcRenderer, webUtils } from "electron";

import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import { createFileOpenPreloadBridge } from "@forgeai/electron-desktop/file-open-preload";
import type { ForgeBridge } from "@forgeai/ipc-contract";

const module: CapabilityModule<BridgeCapabilityRegistry<ForgeBridge>> = {
  id: "paths",
  install: (registry) => {
    const bridge = createFileOpenPreloadBridge({ ipcRenderer, webUtils });
    registry.contribute("fileOpen", bridge.fileOpen);
    registry.contribute("paths", bridge.paths);
  },
};

export default module;
