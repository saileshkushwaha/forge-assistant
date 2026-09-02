import { app } from "electron";

import {
  configureAboutRuntime,
  installAbout,
  openAboutWindow,
} from "@forgeai/electron-desktop/about";
import type {
  CapabilityModule,
  DesktopCapabilityRegistry,
} from "@forgeai/electron-desktop/capability-registry";
import {
  configureHotkeySettings,
  HOTKEY_SETTINGS,
} from "@forgeai/electron-desktop/commands";
import { installGlobalShortcuts } from "@forgeai/electron-desktop/global-shortcuts";
import { installHotkeysIpc } from "@forgeai/electron-desktop/hotkeys";
import { getName, onNameChange } from "@forgeai/electron-desktop/identity";
import { installImageContextMenu } from "@forgeai/electron-desktop/image-context-menu";
import { toggleQuickInput } from "@forgeai/electron-desktop/quick-input-window";
import { installTextContextMenu } from "@forgeai/electron-desktop/text-context-menu";

import { getRendererBase } from "../app-config";
import { checkForUpdates } from "../auto-update";
import { runInstallCliCommandFlow } from "../cli-path-flow";
import { handle } from "../ipc.client";
import log from "../logger";
import { current, dispatchToMain, ensureVisible } from "../main-window";
import { installWindowsMenu } from "../menu";

const commandsFeature: CapabilityModule<DesktopCapabilityRegistry> = {
  id: "commands",
  install: (capabilities) => {
    const hotkeySettings = capabilities.get(HOTKEY_SETTINGS);
    configureHotkeySettings(hotkeySettings);
    if (hotkeySettings) {
      installHotkeysIpc({ handle });
    }

    configureAboutRuntime({
      rendererBase: () => getRendererBase(app.isPackaged),
      getAssistantName: getName,
      onAssistantNameChange: onNameChange,
    });
    installAbout({ handle });

    installGlobalShortcuts({
      handlers: {
        globalHotkey: () => {
          void ensureVisible();
        },
        // Registered through installGlobalShortcuts so the Keyboard
        // Shortcuts rebinding applies and the chord is bound exactly once.
        quickInput: toggleQuickInput,
        // Talk, from wherever the user is. `registerAll` skips a command with
        // no handler, so without this the binding would be offered in both
        // Keyboard Shortcuts and Voice settings, show as bound, and do
        // nothing. Never raises the window: the point of a global binding is
        // that the user is working somewhere else.
        toggleVoice: () => {
          if (current() !== null) {
            dispatchToMain({ kind: "toggleVoice" });
            return;
          }
          // No renderer to act in. Building one necessarily shows it, which
          // is still better than a press that lands nowhere.
          void ensureVisible().then(() => {
            dispatchToMain({ kind: "toggleVoice" });
          });
        },
      },
      logger: log,
    });
    installWindowsMenu({
      handle,
      openAbout: openAboutWindow,
      checkForUpdates,
      installCli: () => {
        void runInstallCliCommandFlow();
      },
    });

    app.on("web-contents-created", (_event, contents) => {
      installImageContextMenu(contents);
      installTextContextMenu(contents);
    });
  },
};

export default commandsFeature;
