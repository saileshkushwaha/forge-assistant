import type { IpcRenderer, IpcRendererEvent } from "electron";

import type {
  BundleScanData,
  DeepLink,
  DownloadDoneEvent,
  ResolvedHotkey,
  UpdateState,
  ForgeBridge,
} from "@forgeai/ipc-contract";
import { DOWNLOADS_DONE_EVENT, DOWNLOADS_REVEAL } from "@forgeai/ipc-contract";

type RendererIpc = Pick<IpcRenderer, "invoke" | "off" | "on" | "send">;

const subscribe =
  <Payload>(ipc: RendererIpc, channel: string) =>
  (callback: (payload: Payload) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: Payload): void => {
      callback(payload);
    };
    ipc.on(channel, handler);
    return () => {
      ipc.off(channel, handler);
    };
  };

export const createDeepLinksBridge = (
  ipc: RendererIpc,
): ForgeBridge["deepLinks"] => ({
  drain: () => ipc.invoke("forge:deepLinks:drain") as Promise<DeepLink[]>,
  onLink: (callback) => {
    const handler = (_event: IpcRendererEvent, link: DeepLink): void => {
      callback(link);
    };
    ipc.on("forge:deepLinks:event", handler);
    ipc.send("forge:deepLinks:subscribe");
    return () => {
      ipc.off("forge:deepLinks:event", handler);
      ipc.send("forge:deepLinks:unsubscribe");
    };
  },
});

export const createLaunchAtLoginBridge = (
  ipc: RendererIpc,
): ForgeBridge["launchAtLogin"] => ({
  get: () => ipc.invoke("forge:launchAtLogin:get") as Promise<boolean>,
  set: (enabled) =>
    ipc.invoke("forge:launchAtLogin:set", enabled) as Promise<void>,
});

/** Renderer side of `installHotkeysIpc`. */
export const createHotkeysBridge = (
  ipc: RendererIpc,
): ForgeBridge["hotkeys"] => ({
  get: () => ipc.invoke("forge:hotkeys:get") as Promise<ResolvedHotkey[]>,
  set: (key, accelerator) =>
    ipc.invoke("forge:hotkeys:set", key, accelerator) as Promise<void>,
  onChange: subscribe<ResolvedHotkey[]>(ipc, "forge:hotkeys:changed"),
});

/** Renderer side of `installBundleConfirmation`. */
export const createBundleConfirmBridge = (
  ipc: RendererIpc,
): ForgeBridge["bundleConfirm"] => ({
  getData: () =>
    ipc.invoke(
      "forge:bundleConfirm:getData",
    ) as Promise<BundleScanData | null>,
  respond: (accepted) => {
    ipc.send("forge:bundleConfirm:respond", accepted);
  },
});

/** Renderer side of `installDownloads`. */
export const createDownloadsBridge = (
  ipc: RendererIpc,
): ForgeBridge["downloads"] => ({
  onDone: subscribe<DownloadDoneEvent>(ipc, DOWNLOADS_DONE_EVENT),
  reveal: (id) => ipc.invoke(DOWNLOADS_REVEAL, id),
});

/** Renderer side of `installAutoUpdate`. */
export const createUpdateBridge = (
  ipc: RendererIpc,
): ForgeBridge["update"] => ({
  getState: () => ipc.invoke("forge:update:getState") as Promise<UpdateState>,
  check: () => ipc.invoke("forge:update:check") as Promise<void>,
  install: () => ipc.invoke("forge:update:install") as Promise<void>,
  onState: subscribe<UpdateState>(ipc, "forge:update:state"),
});
