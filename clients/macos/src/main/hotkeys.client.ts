import { installHotkeysIpc as installSharedHotkeysIpc } from "@forgeai/electron-desktop/hotkeys";

import "./commands.client";
import { handle } from "./ipc";

export const installHotkeysIpc = (): void => {
  installSharedHotkeysIpc({ handle });
};
