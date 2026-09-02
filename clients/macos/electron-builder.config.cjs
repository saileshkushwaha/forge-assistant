// @ts-check

const env = process.env.FORGE_ENVIRONMENT || "local";
const bucketEnv = env === "production" ? "prod" : env;
const targetArch = process.env.ELECTRON_TARGET_ARCH || "arm64";

const productName =
  env === "production"
    ? "Forge"
    : `Forge ${env.charAt(0).toUpperCase() + env.slice(1)}`;

const appId =
  env === "production"
    ? "com.forge.forge-assistant-electron"
    : `com.forge.forge-assistant-electron-${env}`;

// Mirror build-mac-helper.sh's env→helper-bundle-name mapping so the packaged
// app's `bin/` directory has the same folder name as the helper the build
// script wrote to `resources/`. The runtime sidecar
// `.forge-mac-helper.bundle-name` carries the same string, so the runtime
// resolves the .app folder from the sidecar rather than this mapping — but the
// sidecar only reaches the packaged app if electron-builder copies it into
// `bin/` alongside the bundle.
const helperBundleName =
  env === "production"
    ? "Forge Helper"
    : `Forge Helper ${env.charAt(0).toUpperCase() + env.slice(1)}`;

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
    url: `https://storage.googleapis.com/forge-ai-${bucketEnv}-releases/mac-electron/${targetArch}/`,
  },
  directories: {
    output: "dist",
  },
  // Only the electron-vite output belongs in app.asar. Without this allowlist
  // electron-builder packs the whole project dir: the Swift helper build tree,
  // a second copy of web-dist, src/, scripts/, and whatever else sits in
  // clients/macos at pack time (a local pack once shipped a 12GB asar this
  // way). Production node_modules are collected from the dependency tree
  // regardless of these patterns.
  files: ["out/main/**", "out/preload/**", "package.json"],
  extraResources: [
    { from: "resources/bun", to: "bun" },
    {
      from: `resources/${helperBundleName}.app`,
      to: `bin/${helperBundleName}.app`,
    },
    // Sidecar written by build-mac-helper.sh. The runtime reads this to
    // discover the .app folder name without duplicating the env→name
    // mapping in TS. Must stay alongside the bundle in `bin/` so a
    // packaged app can resolve it via process.resourcesPath.
    {
      from: "resources/.forge-mac-helper.bundle-name",
      to: "bin/.forge-mac-helper.bundle-name",
    },
    { from: "resources/web-dist", to: "web-dist" },
    { from: "resources/cli-lockfile", to: "cli-lockfile" },
    { from: "build/icon.icns", to: "icon.icns" },
  ],
  afterPack: "./scripts/afterPack.js",
  afterSign: "./scripts/afterSign.js",
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
      role: "Viewer",
    },
  ],
  dmg: {
    // Installer-style DMG: a single app icon sits under "Install Forge /
    // Double click the icon below". The app moves itself to /Applications on
    // first launch (see src/main/move-to-applications.ts), so the DMG needs no
    // Applications alias and no drag step. The background (+ @2x) is rendered
    // by scripts/generate-dmg-background.sh during pack — keep its 540x420
    // canvas in sync with `window` below.
    title: "Install ${productName}",
    background: "build/dmg-background.png",
    contents: [{ x: 270, y: 232, type: "file" }],
    window: { width: 540, height: 420 },
    iconSize: 128,
    iconTextSize: 13,
    // lzfse compression (macOS 10.11+) for smaller output than default zlib.
    format: "ULFO",
  },
  mac: {
    icon: "build/icon.icns",
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    entitlements: "./scripts/entitlements/app.plist",
    entitlementsInherit: "./scripts/entitlements/inherit.plist",
    extendInfo: {
      CFBundleIconName: "AppIcon",
      NSMicrophoneUsageDescription:
        "Forge uses the microphone to record voice input for chat.",
      NSCameraUsageDescription:
        "Forge uses the camera to capture photos when you ask your assistant to use the camera.",
      NSSpeechRecognitionUsageDescription:
        "Forge uses speech recognition to transcribe dictated voice input.",
      NSAppleEventsUsageDescription:
        "Forge uses Automation to paste dictated voice input into the app you are using.",
      NSUserNotificationAlertStyle: "alert",
      // Register the .forge UTI so Quick Look extensions can provide
      // thumbnails and previews for .forge bundle files in Finder.
      UTExportedTypeDeclarations: [
        {
          UTTypeIdentifier: "com.forge.app-bundle",
          UTTypeConformsTo: ["public.data", "public.content"],
          UTTypeDescription: "Forge App Bundle",
          UTTypeTagSpecification: {
            "public.filename-extension": ["forge"],
            "public.mime-type": "application/x-forge",
          },
        },
      ],
    },
    target: [
      {
        target: "dmg",
        arch: [targetArch],
      },
      {
        target: "zip",
        arch: [targetArch],
      },
    ],
  },
};
