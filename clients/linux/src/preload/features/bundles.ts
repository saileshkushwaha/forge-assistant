import { ipcRenderer } from "electron";

import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import { createBundleConfirmBridge } from "@forgeai/electron-desktop/preload";
import type { ForgeBridge } from "@forgeai/ipc-contract";

const bundlesFeature: CapabilityModule<BridgeCapabilityRegistry<ForgeBridge>> =
  {
    id: "bundles",
    install: (registry) => {
      registry.contribute(
        "bundleConfirm",
        createBundleConfirmBridge(ipcRenderer),
      );
    },
  };

export default bundlesFeature;
