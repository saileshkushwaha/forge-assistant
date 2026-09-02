import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from "electron";

import { createLocalModeBridge } from "@forgeai/electron-desktop/local-mode-bridge";
import { createFileOpenPreloadBridge } from "@forgeai/electron-desktop/file-open-preload";

import type { Lockfile, LockfileWriteResult } from "@forgeai/local-mode";
import type {
  AppVersionInfo,
  AssistantStatus,
  BundleScanData,
  CompanionContext,
  CompanionIntroAction,
  CompanionSurfaceState,
  ConnectivityState,
  DeepLink,
  DictationOverlayHitRegion,
  DictationOverlayMessage,
  DictationOverlayState,
  DictationPartialEvent,
  DictationPartialsResult,
  DictationTranscribeResult,
  FnPushToTalkResult,
  HelperRestartResult,
  HelperState,
  HotkeyEvent,
  ModifierHold,
  ModifierHoldRegistrationResult,
  LocalAssistantStatusResult,
  NotificationActionEvent,
  PowerEvent,
  ResolvedHotkey,
  ShowNotificationPayload,
  SystemPermissionKind,
  SystemPermissionStateItem,
  SystemPermissionsState,
  TextInsertionResult,
  UpdateState,
  ForgeBridge,
  ForgeCommand,
  VoiceActivityContent,
  VoiceActivityControl,
  VoiceActivityStart,
} from "@forgeai/ipc-contract";
import {
  DIAGNOSTICS_SET_SHARE,
  FEATURE_FLAGS_SET,
  FEEDBACK_DIAGNOSTICS,
  FEEDBACK_LOGS,
  HELPER_DICTATION_FINALIZED_EVENT,
  HELPER_DICTATION_PARTIAL_EVENT,
  HELPER_DICTATION_SET_PARTIALS,
  HELPER_DICTATION_TRANSCRIBE,
  HELPER_DICTATION_TRANSCRIBED_EVENT,
  HELPER_HOTKEY_SET_MODIFIER_HOLD,
} from "@forgeai/ipc-contract";
import {
  createBundleConfirmBridge,
  createDeepLinksBridge,
  createDownloadsBridge,
  createHotkeysBridge,
  createLaunchAtLoginBridge,
  createUpdateBridge,
} from "@forgeai/electron-desktop/preload";

export type {
  AppVersionInfo,
  AssistantStatus,
  BundleScanData,
  ConnectivityState,
  DeepLink,
  DictationOverlayMessage,
  DictationOverlayState,
  DictationPartialEvent,
  DictationPartialsResult,
  FnPushToTalkResult,
  HelperRestartResult,
  HelperState,
  HotkeyEvent,
  LocalAssistantStatusResult,
  NotificationActionEvent,
  PowerEvent,
  ResolvedHotkey,
  ShowNotificationPayload,
  SystemPermissionKind,
  SystemPermissionStateItem,
  SystemPermissionsState,
  TextInsertionResult,
  UpdateState,
  ForgeBridge,
  ForgeCommand,
};

const notImplemented = (name: string) => (): Promise<never> =>
  Promise.reject(new Error(`window.forge.${name} is not implemented yet`));

const subscribeDictationEvent =
  (channel: string) =>
  (callback: (event: DictationPartialEvent) => void): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      payload: DictationPartialEvent,
    ) => {
      callback(payload);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.off(channel, handler);
    };
  };

const fileOpenBridge = createFileOpenPreloadBridge({ ipcRenderer, webUtils });

const bridge: ForgeBridge = {
  platform: "electron",
  hostOS: "macos",
  app: {
    versionInfo: (): Promise<AppVersionInfo> =>
      ipcRenderer.invoke("forge:app:versionInfo") as Promise<AppVersionInfo>,
    openWebsite: (): Promise<void> =>
      ipcRenderer.invoke("forge:app:openWebsite") as Promise<void>,
  },
  text: {
    insertIntoFrontApp: (text: string): Promise<TextInsertionResult> =>
      ipcRenderer.invoke(
        "forge:text:insertIntoFrontApp",
        text,
      ) as Promise<TextInsertionResult>,
    openAutomationSettings: (): Promise<void> =>
      ipcRenderer.invoke("forge:text:openAutomationSettings") as Promise<void>,
  },
  auth: {
    startOAuth: (options: {
      loginHint?: string;
      intent?: string;
    }): Promise<{ sessionToken: string }> =>
      ipcRenderer.invoke("forge:auth:startOAuth", options) as Promise<{
        sessionToken: string;
      }>,
    cancelOAuth: (): Promise<void> =>
      ipcRenderer.invoke("forge:auth:cancelOAuth") as Promise<void>,
    getSessionToken: (): string | null =>
      ipcRenderer.sendSync("forge:auth:getSessionToken") as string | null,
    signOut: (): Promise<void> =>
      ipcRenderer.invoke("forge:auth:signOut") as Promise<void>,
  },
  hotkeys: createHotkeysBridge(ipcRenderer),
  launchAtLogin: createLaunchAtLoginBridge(ipcRenderer),
  featureFlags: {
    set: (flags: Record<string, boolean>): void => {
      ipcRenderer.send(FEATURE_FLAGS_SET, flags);
    },
  },
  diagnostics: {
    setShareDiagnostics: (enabled: boolean): void => {
      ipcRenderer.send(DIAGNOSTICS_SET_SHARE, enabled);
    },
  },
  helper: {
    ping: () => ipcRenderer.invoke("forge:helper:ping") as Promise<"pong">,
    getState: () =>
      ipcRenderer.invoke("forge:helper:state:get") as Promise<HelperState>,
    restart: () =>
      ipcRenderer.invoke(
        "forge:helper:restart",
      ) as Promise<HelperRestartResult>,
    onState: (callback) => {
      const handler = (_event: IpcRendererEvent, payload: HelperState) => {
        callback(payload);
      };
      ipcRenderer.on("forge:helper:state", handler);
      return () => {
        ipcRenderer.off("forge:helper:state", handler);
      };
    },
    hotkey: {
      fnPushToTalk: (enable: boolean): Promise<FnPushToTalkResult> =>
        ipcRenderer.invoke(
          "forge:helper:hotkey:fnPushToTalk",
          enable,
        ) as Promise<FnPushToTalkResult>,
      setModifierHold: (
        hold: ModifierHold,
      ): Promise<ModifierHoldRegistrationResult> =>
        ipcRenderer.invoke(
          HELPER_HOTKEY_SET_MODIFIER_HOLD,
          hold,
        ) as Promise<ModifierHoldRegistrationResult>,
      onEvent: (callback) => {
        const handler = (_event: IpcRendererEvent, payload: HotkeyEvent) => {
          callback(payload);
        };
        ipcRenderer.on("forge:helper:hotkey:event", handler);
        return () => {
          ipcRenderer.off("forge:helper:hotkey:event", handler);
        };
      },
    },
    dictation: {
      setPartials: (
        enable: boolean,
        deviceName?: string,
        pushAudio?: boolean,
      ): Promise<DictationPartialsResult> =>
        ipcRenderer.invoke(
          HELPER_DICTATION_SET_PARTIALS,
          enable,
          deviceName,
          pushAudio,
        ) as Promise<DictationPartialsResult>,
      pushAudioChunk: (chunk: ArrayBuffer): void => {
        ipcRenderer.send("forge:helper:dictation:audio", chunk);
      },
      onPartial: subscribeDictationEvent(HELPER_DICTATION_PARTIAL_EVENT),
      onFinalized: subscribeDictationEvent(HELPER_DICTATION_FINALIZED_EVENT),
      transcribe: (audio: ArrayBuffer): Promise<DictationTranscribeResult> =>
        ipcRenderer.invoke(
          HELPER_DICTATION_TRANSCRIBE,
          audio,
        ) as Promise<DictationTranscribeResult>,
      onTranscribed: subscribeDictationEvent(
        HELPER_DICTATION_TRANSCRIBED_EVENT,
      ),
    },
  },
  permissions: {
    getState: (): Promise<SystemPermissionsState> =>
      ipcRenderer.invoke(
        "forge:permissions:getState",
      ) as Promise<SystemPermissionsState>,
    request: (kind: SystemPermissionKind): Promise<SystemPermissionStateItem> =>
      ipcRenderer.invoke(
        "forge:permissions:request",
        kind,
      ) as Promise<SystemPermissionStateItem>,
    openSettings: (
      kind: SystemPermissionKind,
    ): Promise<SystemPermissionStateItem> =>
      ipcRenderer.invoke(
        "forge:permissions:openSettings",
        kind,
      ) as Promise<SystemPermissionStateItem>,
    quitAndReopen: (): Promise<void> =>
      ipcRenderer.invoke("forge:permissions:quitAndReopen") as Promise<void>,
    onState: (callback) => {
      const handler = (
        _event: IpcRendererEvent,
        state: SystemPermissionsState,
      ) => {
        callback(state);
      };
      ipcRenderer.on("forge:permissions:state", handler);
      return () => {
        ipcRenderer.off("forge:permissions:state", handler);
      };
    },
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
  status: {
    setConnection: (status: AssistantStatus): void => {
      ipcRenderer.send("forge:status:connection", status);
    },
  },
  identity: {
    setName: (name: string): void => {
      ipcRenderer.send("forge:identity:name", name);
    },
  },
  icon: {
    setAvatar: (png: Uint8Array | null): void => {
      ipcRenderer.send("forge:icon:setAvatar", png);
    },
    setCharacter: (character): void => {
      ipcRenderer.send("forge:icon:setCharacter", character);
    },
  },
  dock: {
    setBadge: (count: number): void => {
      ipcRenderer.send("forge:dock:setBadge", count);
    },
  },
  share: {
    shareFile: (bytes: Uint8Array, filename: string): Promise<void> =>
      ipcRenderer.invoke("forge:share:file", bytes, filename),
  },
  downloads: createDownloadsBridge(ipcRenderer),
  localMode: createLocalModeBridge(ipcRenderer),
  menu: {
    setPlatformSession: (has: boolean): Promise<void> =>
      ipcRenderer.invoke(
        "forge:menu:setPlatformSession",
        has,
      ) as Promise<void>,
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
  power: {
    onEvent: (callback) => {
      const handler = (_event: IpcRendererEvent, payload: PowerEvent) => {
        callback(payload);
      };
      ipcRenderer.on("forge:power:event", handler);
      return () => {
        ipcRenderer.off("forge:power:event", handler);
      };
    },
  },
  deepLinks: createDeepLinksBridge(ipcRenderer),
  fileOpen: fileOpenBridge.fileOpen,
  paths: fileOpenBridge.paths,
  feedback: {
    diagnostics: () =>
      ipcRenderer.invoke(FEEDBACK_DIAGNOSTICS) as Promise<
        Record<string, unknown>
      >,
    logs: () => ipcRenderer.invoke(FEEDBACK_LOGS) as Promise<string>,
  },
  connectivity: {
    onState: (callback) => {
      const handler = (_event: IpcRendererEvent, state: ConnectivityState) => {
        callback(state);
      };
      ipcRenderer.on("forge:connectivity:state", handler);
      // Emit the current state so late subscribers (window loaded after
      // the first probe) don't wait for the next state transition.
      void (
        ipcRenderer.invoke(
          "forge:connectivity:get",
        ) as Promise<ConnectivityState>
      ).then(callback);
      return () => {
        ipcRenderer.off("forge:connectivity:state", handler);
      };
    },
    get: () =>
      ipcRenderer.invoke(
        "forge:connectivity:get",
      ) as Promise<ConnectivityState>,
    setDevice: (online: boolean): void => {
      ipcRenderer.send("forge:connectivity:device", online);
    },
    retry: () =>
      ipcRenderer.invoke(
        "forge:connectivity:retry",
      ) as Promise<ConnectivityState>,
  },
  notifications: {
    show: (
      payload: ShowNotificationPayload,
    ): Promise<{ success: boolean; errorMessage?: string }> =>
      ipcRenderer.invoke("forge:notifications:show", payload) as Promise<{
        success: boolean;
        errorMessage?: string;
      }>,
    onAction: (callback) => {
      const handler = (
        _event: IpcRendererEvent,
        event: NotificationActionEvent,
      ) => {
        callback(event);
      };
      ipcRenderer.on("forge:notifications:action", handler);
      return () => {
        ipcRenderer.off("forge:notifications:action", handler);
      };
    },
  },
  bundleConfirm: createBundleConfirmBridge(ipcRenderer),
  quickInput: {
    submit: (message: string): Promise<void> =>
      ipcRenderer.invoke("forge:quickInput:submit", message) as Promise<void>,
    dismiss: (): Promise<void> =>
      ipcRenderer.invoke("forge:quickInput:dismiss") as Promise<void>,
  },
  commandPalette: {
    open: (): Promise<void> =>
      ipcRenderer.invoke("forge:commandPalette:open") as Promise<void>,
    dismiss: (): Promise<void> =>
      ipcRenderer.invoke("forge:commandPalette:dismiss") as Promise<void>,
    select: (command: ForgeCommand): Promise<void> =>
      ipcRenderer.invoke(
        "forge:commandPalette:select",
        command,
      ) as Promise<void>,
  },
  dictationOverlay: {
    setState: (state: DictationOverlayMessage): void => {
      ipcRenderer.send("forge:dictationOverlay:setState", state);
    },
    onState: (callback) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: DictationOverlayState,
      ) => {
        callback(payload);
      };
      ipcRenderer.on("forge:dictationOverlay:state", handler);
      return () => {
        ipcRenderer.off("forge:dictationOverlay:state", handler);
      };
    },
    getState: (): Promise<DictationOverlayState | null> =>
      ipcRenderer.invoke(
        "forge:dictationOverlay:getState",
      ) as Promise<DictationOverlayState | null>,
    requestStop: (): void => {
      ipcRenderer.send("forge:dictationOverlay:requestStop");
    },
    onStopRequested: (callback) => {
      const handler = () => {
        callback();
      };
      ipcRenderer.on("forge:dictationOverlay:stopRequested", handler);
      return () => {
        ipcRenderer.off("forge:dictationOverlay:stopRequested", handler);
      };
    },
    setInteractive: (interactive: boolean): void => {
      ipcRenderer.send("forge:dictationOverlay:setInteractive", interactive);
    },
    setHitRegion: (region: DictationOverlayHitRegion | null): void => {
      ipcRenderer.send("forge:dictationOverlay:setHitRegion", region);
    },
  },
  voiceActivity: {
    start: (state: VoiceActivityStart): void => {
      ipcRenderer.send("forge:voiceActivity:start", state);
    },
    update: (content: VoiceActivityContent): void => {
      ipcRenderer.send("forge:voiceActivity:update", content);
    },
    end: (): void => {
      ipcRenderer.send("forge:voiceActivity:end");
    },
    control: (control: VoiceActivityControl): void => {
      ipcRenderer.send("forge:voiceActivity:control", control);
    },
    onControl: (callback) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: VoiceActivityControl,
      ) => {
        callback(payload);
      };
      ipcRenderer.on("forge:voiceActivity:controlEvent", handler);
      return () => {
        ipcRenderer.off("forge:voiceActivity:controlEvent", handler);
      };
    },
  },
  companion: {
    getState: (): Promise<CompanionSurfaceState | null> =>
      ipcRenderer.invoke(
        "forge:companion:getState",
      ) as Promise<CompanionSurfaceState | null>,
    onState: (callback) => {
      const handler = (
        _event: IpcRendererEvent,
        state: CompanionSurfaceState,
      ) => {
        callback(state);
      };
      ipcRenderer.on("forge:companion:state", handler);
      return () => {
        ipcRenderer.off("forge:companion:state", handler);
      };
    },
    setInteractive: (interactive: boolean): void => {
      ipcRenderer.send("forge:companion:setInteractive", interactive);
    },
    moveBy: (dx: number, dy: number): void => {
      ipcRenderer.send("forge:companion:moveBy", dx, dy);
    },
    startVoice: (): void => {
      ipcRenderer.send("forge:companion:startVoice");
    },
    toggleWatch: (): void => {
      ipcRenderer.send("forge:companion:toggleWatch");
    },
    answerWatchRetro: (open: boolean): void => {
      ipcRenderer.send("forge:companion:answerWatchRetro", open);
    },
    activate: (): void => {
      ipcRenderer.send("forge:companion:activate");
    },
    setContext: (context: CompanionContext): void => {
      ipcRenderer.send("forge:companion:setContext", context);
    },
    advanceIntro: (action: CompanionIntroAction): void => {
      ipcRenderer.send("forge:companion:advanceIntro", action);
    },
    showContextMenu: (): void => {
      ipcRenderer.send("forge:companion:contextMenu");
    },
  },
  popout: {
    open: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke("forge:popout:open", conversationId) as Promise<void>,
  },
  update: createUpdateBridge(ipcRenderer),
};

contextBridge.exposeInMainWorld("forge", bridge);

const forgeConfig = ipcRenderer.sendSync("forge:config:get") as {
  webUrl: string;
  platformUrl: string;
  disablePlatform?: boolean;
  deviceId: string | null;
} | null;
if (forgeConfig) {
  contextBridge.exposeInMainWorld("__FORGE_CONFIG__", forgeConfig);
}

const flagOverrides: Record<string, boolean | string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("FORGE_FLAG_") || value === undefined) continue;
  const flagKey = key
    .slice("FORGE_FLAG_".length)
    .toLowerCase()
    .replace(/_/g, "-");
  const lower = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(lower)) flagOverrides[flagKey] = true;
  else if (["false", "0", "no", "off"].includes(lower))
    flagOverrides[flagKey] = false;
  else flagOverrides[flagKey] = value.trim();
}
if (Object.keys(flagOverrides).length > 0) {
  contextBridge.exposeInMainWorld("__FORGE_FLAG_OVERRIDES__", flagOverrides);
}

declare global {
  interface Window {
    forge: ForgeBridge;
    __FORGE_FLAG_OVERRIDES__?: Record<string, boolean | string>;
  }
}
