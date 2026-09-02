import { ipcRenderer } from "electron";

import type {
  BridgeCapabilityRegistry,
  CapabilityModule,
} from "@forgeai/electron-desktop/capability-registry";
import { createHotkeysBridge } from "@forgeai/electron-desktop/preload";
import {
  MENU_POPUP,
  MENU_SET_PLATFORM_SESSION,
  MENU_TITLES,
  type ForgeBridge,
} from "@forgeai/ipc-contract";

const commandsFeature: CapabilityModule<
  BridgeCapabilityRegistry<ForgeBridge>
> = {
  id: "commands",
  install: (registry) => {
    registry.contribute("hotkeys", createHotkeysBridge(ipcRenderer));
    registry.contribute("menu", {
      setPlatformSession: (has) =>
        ipcRenderer.invoke(MENU_SET_PLATFORM_SESSION, has) as Promise<void>,
      titles: () =>
        ipcRenderer.invoke(MENU_TITLES) as Promise<
          Array<{ id: string; label: string }>
        >,
      popup: (id, x, y) =>
        ipcRenderer.invoke(MENU_POPUP, id, x, y) as Promise<void>,
    });
  },
};

export default commandsFeature;
