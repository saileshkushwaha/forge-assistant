import type { IpcRenderer, IpcRendererEvent } from "electron";

import type {
  AppVersionInfo,
  ForgeBridge,
  ForgeCommand,
} from "@forgeai/ipc-contract";

export const LINUX_CORE_CAPABILITIES = [
  "platform",
  "hostOS",
  "app",
  "commands",
  "mainWindow",
] as const satisfies readonly (keyof ForgeBridge)[];

export type LinuxCoreBridge = Pick<
  ForgeBridge,
  (typeof LINUX_CORE_CAPABILITIES)[number]
>;

/**
 * macOS-only companion surfaces with no Linux counterpart. The renderer
 * feature-detects them and falls back to web behavior.
 */
export const LINUX_NOT_APPLICABLE_CAPABILITIES = [
  "companion",
  "voiceActivity",
] as const satisfies readonly (keyof ForgeBridge)[];

/** The always-present core every `./features/` module builds on. */
export const createLinuxCoreBridge = (
  ipcRenderer: Pick<IpcRenderer, "invoke" | "on" | "off">,
): LinuxCoreBridge => ({
  platform: "electron",
  hostOS: "linux",
  app: {
    versionInfo: (): Promise<AppVersionInfo> =>
      ipcRenderer.invoke("forge:app:versionInfo") as Promise<AppVersionInfo>,
    openWebsite: (): Promise<void> =>
      ipcRenderer.invoke("forge:app:openWebsite") as Promise<void>,
  },
  commands: {
    on: (callback) => {
      const handler = (_event: IpcRendererEvent, command: ForgeCommand) => {
        callback(command);
      };
      ipcRenderer.on("forge:command", handler);
      return () => {
        ipcRenderer.off("forge:command", handler);
      };
    },
  },
  mainWindow: {
    ensureVisible: (): Promise<void> =>
      ipcRenderer.invoke("forge:mainWindow:ensureVisible") as Promise<void>,
    setOnboarding: (active: boolean): Promise<void> =>
      ipcRenderer.invoke(
        "forge:mainWindow:setOnboarding",
        active,
      ) as Promise<void>,
  },
});
