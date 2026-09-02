/**
 * Environment variables that are safe to pass through to child processes.
 * Everything else (API keys, tokens, credentials) is stripped to prevent
 * accidental leakage via agent-spawned commands.
 *
 * Shared by the sandbox bash tool and skill sandbox runner.
 */
import { readdirSync } from "node:fs";

import { pathListDelimiter } from "@forgeai/environments/shell";

import { getGatewayInternalBaseUrl } from "../../config/env.js";
import { getDataDir, getWorkspaceDir } from "../../util/platform.js";

export const SAFE_ENV_VARS = [
  "PATH",
  "HOME",
  "TERM",
  "LANG",
  "EDITOR",
  "SHELL",
  "USER",
  "TMPDIR",
  "LC_ALL",
  "LC_CTYPE",
  "XDG_RUNTIME_DIR",
  "DISPLAY",
  "COLORTERM",
  "TERM_PROGRAM",
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "GPG_TTY",
  "GNUPGHOME",
  "FORGE_DEV",
  "FORGE_DEBUG",
  "FORGE_SLOW_SYNC_THRESHOLD_MS",
  "FORGE_SLOW_QUERY_THRESHOLD_MS",
  "FORGE_DEVICE_ID",
  "FORGE_DISABLE_PLATFORM",
  "FORGE_ENVIRONMENT",
  "FORGE_TEST_LOG_LEVEL",

  "FORGE_WORKSPACE_DIR",
  "CES_BOOTSTRAP_SOCKET_DIR",
  "GATEWAY_INTERNAL_URL",
  "ASSISTANT_IPC_SOCKET_DIR",
  "GATEWAY_IPC_SOCKET_DIR",
  "GATEWAY_SECURITY_DIR",
  "FORGE_PLATFORM_URL",
  "FORGE_ASSISTANT_PLATFORM_URL",
  "FORGE_DOCS_BASE_URL",
  "FORGE_MIGRATION_EXPORT_ALLOWED_HOSTS",
  "FORGE_MIGRATION_IMPORT_ALLOWED_HOSTS",
  "CES_CREDENTIAL_URL",
  "CES_MANAGED_MODE",
  "CES_LOCAL_SOCKET",
  // Per-instance port of the assistant-managed Qdrant sidecar, so skill and
  // bash-tool subprocesses that use the vector helpers (e.g. embed/search over
  // `@forgeai/plugin-api`) resolve the same local sidecar as the daemon
  // (127.0.0.1:<port>). `QDRANT_URL` is intentionally excluded — it flips
  // QdrantManager into external mode and bypasses the local managed lifecycle.
  "QDRANT_HTTP_PORT",
  "IS_CONTAINERIZED",
  "IS_PLATFORM",
  "FORGE_CLOUD",
  "FORGE_SANDBOX_RUNTIME",
  "CES_SERVICE_TOKEN",
  "FORGE_PROFILER_RUN_ID",
  "FORGE_PROFILER_MODE",
  "FORGE_PROFILER_MAX_BYTES",
  "FORGE_PROFILER_MAX_RUNS",
  "FORGE_PROFILER_MIN_FREE_MB",
  "FORGE_MEMORY_LIMIT",
  "FORGE_CPU_LIMIT",
  "FORGE_ONNX_INTRA_OP_THREADS",
  "FORGE_MINIKUBE_STORAGE_SIZE",
  "FORGE_BACKUP_DIR",
  "FORGE_BACKUP_KEY_PATH",
] as const;

export const WINDOWS_SAFE_ENV_VARS = [
  "SystemRoot",
  "COMSPEC",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "PATHEXT",
  "SystemDrive",
] as const;

export const KATA_SAFE_ENV_VARS = [
  "FORGE_APT_DATA_ROOT",
  "FORGE_APT_DATA_SUITE",
  "FORGE_APT_DATA_MIRROR",
] as const;

export const KATA_INJECTED_ENV_VARS = [
  "LD_LIBRARY_PATH",
  "PYTHONPATH",
  "PYTHONUSERBASE",
  "BUN_INSTALL",
] as const;

const KATA_APT_DATA_ROOT = "/data/system";
const KATA_FAMILY_SANDBOX_RUNTIMES = new Set([
  "kata",
  "firecracker",
  "cloud-hypervisor",
]);

function isKataFamilyRuntime(runtime: string | undefined): boolean {
  return runtime != null && KATA_FAMILY_SANDBOX_RUNTIMES.has(runtime);
}

function kataAptPaths(dataRoot: string): string[] {
  return [
    `${dataRoot}/bin`,
    `${dataRoot}/usr/local/sbin`,
    `${dataRoot}/usr/local/bin`,
    `${dataRoot}/usr/sbin`,
    `${dataRoot}/usr/bin`,
    `${dataRoot}/sbin`,
    `${dataRoot}/usr/games`,
    `${dataRoot}/games`,
  ];
}

function kataAptLibraryPaths(dataRoot: string): string[] {
  return [
    `${dataRoot}/usr/local/lib`,
    `${dataRoot}/usr/lib`,
    `${dataRoot}/usr/lib/x86_64-linux-gnu`,
    `${dataRoot}/usr/lib/aarch64-linux-gnu`,
  ];
}

// Python packages installed into the chroot: apt packages land in the
// unversioned dist-packages dir, chroot pip installs in versioned
// /usr/local/lib/python3.X dirs. Versions come from the image's /usr/lib
// (present before any install, so the path works within the same tool call
// that first runs pip) plus the chroot's /usr/local/lib as a fallback for
// any version drift between image and chroot.
function kataPythonPaths(dataRoot: string): string[] {
  const versions = new Set<string>();
  for (const libDir of ["/usr/lib", `${dataRoot}/usr/local/lib`]) {
    try {
      for (const entry of readdirSync(libDir)) {
        if (/^python3\.\d+$/.test(entry)) {
          versions.add(entry);
        }
      }
    } catch {
      // Directory missing (e.g. chroot not bootstrapped yet) — skip.
    }
  }
  // pip's /usr/local dirs must precede the apt dir, mirroring Debian's
  // sys.path order, so a pip-upgraded package wins over an older apt one.
  return [
    ...[...versions].map(
      (version) => `${dataRoot}/usr/local/lib/${version}/dist-packages`,
    ),
    `${dataRoot}/usr/lib/python3/dist-packages`,
  ];
}

/**
 * Keys that buildSanitizedEnv always injects into the returned env,
 * independent of what is present in process.env.
 */
export const ALWAYS_INJECTED_ENV_VARS = [
  "INTERNAL_GATEWAY_BASE_URL",
  "SPECIES",
  "FORGE_DATA_DIR",
  "FORGE_WORKSPACE_DIR",
] as const;

function appendUniquePathEntries(
  value: string | undefined,
  entries: readonly string[],
  separator = pathListDelimiter(),
): string {
  const parts = value ? value.split(separator).filter(Boolean) : [];
  for (const entry of entries) {
    if (!parts.includes(entry)) {
      parts.push(entry);
    }
  }
  return parts.join(separator);
}

export function buildSanitizedEnv(
  hostPlatform: NodeJS.Platform = process.platform,
  sourceEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  const isKataRuntime = isKataFamilyRuntime(sourceEnv.FORGE_SANDBOX_RUNTIME);
  const platformVars =
    hostPlatform === "win32" ? WINDOWS_SAFE_ENV_VARS : ([] as const);
  const safeEnvVars = isKataRuntime
    ? [...SAFE_ENV_VARS, ...platformVars, ...KATA_SAFE_ENV_VARS]
    : [...SAFE_ENV_VARS, ...platformVars];

  const windowsEnv =
    hostPlatform === "win32"
      ? new Map(
          Object.entries(sourceEnv).map(([key, value]) => [
            key.toLowerCase(),
            value,
          ]),
        )
      : null;
  for (const key of safeEnvVars) {
    const value = windowsEnv?.get(key.toLowerCase()) ?? sourceEnv[key];
    if (value != null) {
      env[key] = value;
    }
  }
  if (isKataRuntime) {
    const kataAptDataRoot = env.FORGE_APT_DATA_ROOT ?? KATA_APT_DATA_ROOT;
    env.FORGE_APT_DATA_ROOT = kataAptDataRoot;
    env.PATH = appendUniquePathEntries(env.PATH, kataAptPaths(kataAptDataRoot));
    env.LD_LIBRARY_PATH = appendUniquePathEntries(
      undefined,
      kataAptLibraryPaths(kataAptDataRoot),
    );
    env.PYTHONPATH = appendUniquePathEntries(
      undefined,
      kataPythonPaths(kataAptDataRoot),
    );
    // The image bakes these under ephemeral /home/assistant; $HOME is the
    // persistent data volume on kata pods, so user-level installs survive
    // machine saves.
    if (env.HOME) {
      env.PYTHONUSERBASE = `${env.HOME}/.python`;
      env.BUN_INSTALL = `${env.HOME}/.bun`;
      env.PATH = appendUniquePathEntries(
        `${env.PYTHONUSERBASE}/bin:${env.BUN_INSTALL}/bin`,
        env.PATH.split(pathListDelimiter()).filter(Boolean),
      );
    }
  }
  // Always inject an internal gateway base for local control-plane/API calls.
  const internalGatewayBase = getGatewayInternalBaseUrl();
  env.INTERNAL_GATEWAY_BASE_URL = internalGatewayBase;
  // @deprecated — FORGE_DATA_DIR is equivalent to $FORGE_WORKSPACE_DIR/data.
  // Removing this requires an LLM-based migration or declarative migration
  // file to update existing user-authored skills to use FORGE_WORKSPACE_DIR.
  env.FORGE_DATA_DIR = getDataDir();
  // Expose the workspace directory so skills and child processes can read/write
  // workspace-scoped files (e.g. avatar traits, user data).
  env.FORGE_WORKSPACE_DIR = getWorkspaceDir();
  // Identify the assistant species so skill scripts can gate on species-specific
  // logic. Hardcoded to "forge" — this is the Forge assistant codebase.
  env.SPECIES = "forge";
  // Ensure UTF-8 locale so multi-byte characters (em dashes, curly quotes,
  // arrows, etc.) survive piping through tools like pbcopy without corruption.
  // macOS (Darwin) does not provide C.UTF-8, so use en_US.UTF-8 there.
  const utf8Locale = process.platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8";
  if (!env.LANG) {
    env.LANG = utf8Locale;
  }
  if (!env.LC_ALL) {
    env.LC_ALL = utf8Locale;
  }
  return env;
}
