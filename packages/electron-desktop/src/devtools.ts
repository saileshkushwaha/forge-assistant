import { app } from "electron";

declare const __FORGE_ENABLE_CHROME_DEVTOOLS__: boolean | undefined;

const isChromeDevToolsBuild = (): boolean =>
  typeof __FORGE_ENABLE_CHROME_DEVTOOLS__ === "boolean" &&
  __FORGE_ENABLE_CHROME_DEVTOOLS__;

export const areChromeDevToolsEnabled = (): boolean =>
  !app.isPackaged || isChromeDevToolsBuild();
