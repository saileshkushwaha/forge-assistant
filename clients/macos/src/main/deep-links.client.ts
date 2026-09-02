import { configureDeepLinks } from "@forgeai/electron-desktop/deep-links";

import { handle, on } from "./ipc";
import { ensureVisible } from "./main-window";

configureDeepLinks({
  ensureVisible,
  handle,
  initialArgv: [],
  on,
});

export * from "@forgeai/electron-desktop/deep-links";
