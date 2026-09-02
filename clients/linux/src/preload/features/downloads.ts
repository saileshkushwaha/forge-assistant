import { ipcRenderer } from "electron";

import type { ForgeBridge } from "@forgeai/ipc-contract";
import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import { createDownloadsBridge } from "@forgeai/electron-desktop/preload";

// Renderer bridge for download outcome reports and the file-manager reveal,
// the same shared factory the macOS preload uses.
const downloads: CapabilityModule<BridgeCapabilityRegistry<ForgeBridge>> = {
  id: "downloads",
  install: (bridge) => {
    bridge.contribute("downloads", createDownloadsBridge(ipcRenderer));
  },
};

export default downloads;
