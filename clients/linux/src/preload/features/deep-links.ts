import { ipcRenderer } from "electron";

import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import {
  createDeepLinksBridge,
  createLaunchAtLoginBridge,
} from "@forgeai/electron-desktop/preload";
import type { ForgeBridge } from "@forgeai/ipc-contract";

const deepLinksFeature: CapabilityModule<
  BridgeCapabilityRegistry<ForgeBridge>
> = {
  id: "deep-links",
  install: (registry) => {
    registry.contribute("deepLinks", createDeepLinksBridge(ipcRenderer));
    registry.contribute(
      "launchAtLogin",
      createLaunchAtLoginBridge(ipcRenderer),
    );
  },
};

export default deepLinksFeature;
