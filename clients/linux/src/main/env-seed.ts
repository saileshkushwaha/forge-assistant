// Must be the first import in index.ts so that process.env.FORGE_ENVIRONMENT
// is seeded before any other module reads it at module scope.
declare const __FORGE_ENVIRONMENT__: string;

process.env.FORGE_DESKTOP_APP = "1";

if (
  typeof __FORGE_ENVIRONMENT__ === "string" &&
  !process.env.FORGE_ENVIRONMENT
) {
  process.env.FORGE_ENVIRONMENT = __FORGE_ENVIRONMENT__;
}
