import {
  configureFileOpen,
  handleFileOpenArgv,
  hasPendingFiles,
  installFileOpen,
  onFileOpen,
} from "@forgeai/electron-desktop/file-open";

import { handle, on } from "./ipc";
import { ensureVisible } from "./main-window";

configureFileOpen({ ensureMainWindowVisible: ensureVisible, handle, on });

export { handleFileOpenArgv, hasPendingFiles, installFileOpen, onFileOpen };
