// electron.vite.config.ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
var __electron_vite_injected_dirname = "/Users/alex/forge/workspace/forge-assistant/clients/macos";
var DEPS_TO_INLINE = [
  "electron-log",
  "electron-store",
  "electron-updater",
  "conf",
  "@forgeai/electron-utils",
  "@forgeai/ipc-contract",
  "@forgeai/local-mode",
  "@forgeai/environments"
];
var resolveBuildSha = () => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};
var resolveBunVersion = () => {
  try {
    const toolVersions = readFileSync(
      path.resolve(__electron_vite_injected_dirname, "../../.tool-versions"),
      "utf8"
    );
    return toolVersions.match(/^bun\s+(\S+)/m)?.[1] ?? "";
  } catch {
    return "";
  }
};
var LOCAL_CLI_ENTRY = (process.env.FORGE_ENVIRONMENT || "local") === "local" ? path.resolve(__electron_vite_injected_dirname, "../../cli/src/index.ts") : "";
var BUILD_DEFINES = {
  __FORGE_BUILD_SHA__: JSON.stringify(resolveBuildSha()),
  __FORGE_ENVIRONMENT__: JSON.stringify(
    process.env.FORGE_ENVIRONMENT || "local"
  ),
  __FORGE_LOCAL_CLI_ENTRY__: JSON.stringify(LOCAL_CLI_ENTRY),
  __FORGE_BUN_VERSION__: JSON.stringify(resolveBunVersion()),
  __FORGE_ENABLE_CHROME_DEVTOOLS__: JSON.stringify(
    process.env.FORGE_ENABLE_CHROME_DEVTOOLS === "true" || process.env.FORGE_ENABLE_CHROME_DEVTOOLS === "1"
  ),
  __SENTRY_DSN_MACOS__: JSON.stringify(process.env.SENTRY_DSN_MACOS || ""),
  // Root hostname (leading dot) shared with the web bundle's
  // VITE_ROOT_HOSTNAME; baked into the CSP source lists (see src/main/csp.ts).
  __FORGE_ROOT_HOSTNAME__: JSON.stringify(
    process.env.VITE_ROOT_HOSTNAME || ".forge.ai"
  )
};
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: DEPS_TO_INLINE })],
    define: BUILD_DEFINES,
    build: {
      outDir: "out/main",
      lib: {
        entry: "src/main/index.ts"
      },
      rollupOptions: {
        external: ["electron"]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      lib: {
        entry: "src/preload/index.ts"
      },
      rollupOptions: {
        external: ["electron"]
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
