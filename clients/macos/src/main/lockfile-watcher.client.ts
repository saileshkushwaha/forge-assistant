import { configureLockfileWatcher } from "@forgeai/electron-desktop/lockfile-watcher";
import { resolveLockfilePaths } from "@forgeai/local-mode";

configureLockfileWatcher(() => resolveLockfilePaths(process.env));

export * from "@forgeai/electron-desktop/lockfile-watcher";
