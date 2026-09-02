import { ipcRenderer } from "electron";

import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import {
  DIAGNOSTICS_SET_SHARE,
  FEEDBACK_DIAGNOSTICS,
  FEEDBACK_LOGS,
  type ForgeBridge,
} from "@forgeai/ipc-contract";

const diagnosticsFeature: CapabilityModule<
  BridgeCapabilityRegistry<ForgeBridge>
> = {
  id: "diagnostics",
  install: (registry) => {
    // `featureFlags` is contributed by the presence feature module.
    registry.contribute("diagnostics", {
      setShareDiagnostics: (enabled) => {
        ipcRenderer.send(DIAGNOSTICS_SET_SHARE, enabled);
      },
    });
    registry.contribute("feedback", {
      diagnostics: () =>
        ipcRenderer.invoke(FEEDBACK_DIAGNOSTICS) as Promise<
          Record<string, unknown>
        >,
      logs: () =>
        ipcRenderer.invoke(FEEDBACK_LOGS) as Promise<string>,
    });
  },
};

export default diagnosticsFeature;
