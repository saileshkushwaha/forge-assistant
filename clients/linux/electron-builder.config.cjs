// @ts-check

const env = process.env.FORGE_ENVIRONMENT || "local";
const bucketEnv = env === "production" ? "prod" : env;
const targetArch =
  process.env.ELECTRON_TARGET_ARCH ||
  (process.arch === "arm64" ? "arm64" : "x64");

const productName =
  env === "production"
    ? "Forge"
    : `Forge ${env.charAt(0).toUpperCase() + env.slice(1)}`;

const appId =
  env === "production"
    ? "com.forge.forge-assistant-electron"
    : `com.forge.forge-assistant-electron-${env}`;

const schemes =
  env === "production"
    ? ["forge", "forge-assistant"]
    : [`forge-assistant-${env}`];

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId,
  productName,
  publish: {
    provider: "generic",
    url: `https://storage.googleapis.com/forge-ai-${bucketEnv}-releases/linux-electron/${targetArch}/`,
  },
  directories: {
    output: "dist",
  },
  extraResources: [
    { from: "resources/bun", to: "bun" },
    { from: "resources/web-dist", to: "web-dist" },
    { from: "resources/cli-lockfile", to: "cli-lockfile" },
    { from: "build/icon.png", to: "icon.png" },
  ],
  afterPack: "./scripts/afterPack.cjs",
  linux: {
    icon: "build/icon.png",
    category: "Utility",
    target: [
      {
        target: "AppImage",
        arch: [targetArch],
      },
    ],
    maintainer: "Forge AI",
    vendor: "Forge AI",
    executableName: "forge-linux",
  },
  protocols: [
    {
      name: "Forge Deep Links",
      schemes,
    },
  ],
  fileAssociations: [
    {
      ext: "forge",
      name: "Forge Bundle",
    },
  ],
};
