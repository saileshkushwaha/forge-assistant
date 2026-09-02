import path from "node:path";

import { app, dialog } from "electron";

import { WINDOWS_RELEASE_INFO } from "./app-config";
import { provisionCliRuntime, resolveCliRuntimePaths } from "./cli-installer";
import {
  installCliLauncher,
  resolveCliLauncherPaths,
  type CliLauncherState,
  type RegistryRunner,
} from "./cli-path-installer";

export interface CliPathFlowOptions {
  userDataDir: string;
  resourcesDir: string;
  localAppData: string;
  releaseChannel: string;
  version: string;
  registryRunner?: RegistryRunner;
}

/** Provisioning inputs for the running packaged app. */
export function resolveCliPathFlowOptions(): CliPathFlowOptions {
  return {
    userDataDir: app.getPath("userData"),
    resourcesDir: process.resourcesPath,
    localAppData:
      process.env.LOCALAPPDATA ??
      path.join(app.getPath("home"), "AppData", "Local"),
    releaseChannel: WINDOWS_RELEASE_INFO.releaseChannel,
    version: app.getVersion(),
  };
}

export function provisionCliForCurrentUser(options: CliPathFlowOptions) {
  const {
    userDataDir,
    resourcesDir,
    localAppData,
    releaseChannel,
    version,
    registryRunner,
  } = options;
  const runtime = provisionCliRuntime(
    resolveCliRuntimePaths(userDataDir, resourcesDir, version),
  );
  const sourcePath = path.join(runtime.installDir, "forge.exe");
  const paths = resolveCliLauncherPaths(localAppData, releaseChannel);
  const launcherState = installCliLauncher(
    sourcePath,
    version,
    paths,
    registryRunner,
    { ownerId: resourcesDir },
  );
  return {
    installDir: runtime.installDir,
    launcherPath: paths.executable,
    launcherState,
    reusedRuntime: runtime.reused,
  };
}

// Menu-triggered re-runs stack dialogs, so only one flow runs at a time.
let flowInFlight = false;

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : "Unknown error";

const installResultDialog = (
  state: CliLauncherState,
  launcherPath: string,
): Electron.MessageBoxOptions => {
  switch (state) {
    case "installed":
      return {
        type: "info",
        message: "Forge CLI installed",
        detail:
          `The forge command is installed at ${launcherPath}. ` +
          'Open a new terminal and run "forge".',
      };
    case "shadowed":
      return {
        type: "warning",
        message: "Forge CLI installed",
        detail:
          `The forge command is installed at ${launcherPath}, but another ` +
          '"forge" earlier in your PATH will take precedence in your terminal.',
      };
    case "foreign":
      return {
        type: "warning",
        message: "Forge CLI not installed",
        detail:
          `A "forge" file already exists at ${launcherPath} but wasn't ` +
          "installed by Forge, so it was left in place.",
      };
    default:
      return {
        type: "warning",
        message: "Forge CLI not installed",
        detail: `The forge command at ${launcherPath} could not be set up (${state}). Try again.`,
      };
  }
};

/**
 * "Install forge Command..." from the menu. Provisioning is idempotent, so
 * this doubles as repair. Never throws; failures surface via showErrorBox.
 */
export async function runInstallCliCommandFlow(): Promise<void> {
  if (flowInFlight) return;
  flowInFlight = true;
  try {
    const { launcherState, launcherPath } = provisionCliForCurrentUser(
      resolveCliPathFlowOptions(),
    );
    await dialog.showMessageBox(
      installResultDialog(launcherState, launcherPath),
    );
  } catch (err) {
    dialog.showErrorBox("Failed to install forge command", errorMessage(err));
  } finally {
    flowInFlight = false;
  }
}
