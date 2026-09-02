/**
 * Device ID resolver.
 *
 * Reads or creates a stable per-device UUID stored in device.json under the
 * Forge config directory. The file is a JSON object (`{ "deviceId": "<uuid>" }`)
 * extensible for future per-device metadata.
 *
 * Path resolution:
 *   - All modes: the `FORGE_DEVICE_ID` env var takes precedence when set
 *     and is never written to device.json (see getDeviceIdOverride in
 *     config/env-registry.ts).
 *   - Containerized (IS_CONTAINERIZED=true): `/home/assistant/.forge/device.json`
 *     — the assistant user's persistent home dir, kept off the shared data
 *     volume. Not affected by FORGE_ENVIRONMENT because the container fs
 *     has no cross-process contract with the Swift client.
 *   - Non-containerized production: `~/.forge/device.json` (legacy, shared
 *     across all local instances on the same machine).
 *   - Non-containerized non-production: `$XDG_CONFIG_HOME/forge-<env>/device.json`,
 *     matching Swift's `ForgePaths.deviceIdFile`.
 *
 * The value is cached in memory after the first successful read/write.
 * Falls back to a generated UUID if the file cannot be read or written.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  getDeviceIdOverride,
  getIsContainerized,
} from "../config/env-registry.js";
import { getLogger } from "./logger.js";
import { getXdgForgeConfigDirName } from "./platform.js";

const log = getLogger("device-id");

let cached: string | undefined;

/**
 * Resolve the directory and file path for `device.json` based on the
 * runtime environment. See the module docblock for the resolution table.
 *
 * Production and containerized modes preserve the legacy `~/.forge` /
 * `/home/assistant/.forge` paths. Non-production, non-containerized
 * deployments route through `$XDG_CONFIG_HOME/forge-<env>` to match
 * the Swift client's `ForgePaths.deviceIdFile`.
 */
function resolveDeviceIdPaths(): { dir: string; file: string } {
  if (getIsContainerized()) {
    const dir = join("/home/assistant", ".forge");
    return { dir, file: join(dir, "device.json") };
  }

  const configDirName = getXdgForgeConfigDirName();
  if (configDirName === "forge") {
    // Production: device.json lives at ~/.forge/device.json, shared
    // across all local instances on the same machine.
    const dir = join(homedir(), ".forge");
    return { dir, file: join(dir, "device.json") };
  }

  const configHome =
    process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  const dir = join(configHome, configDirName);
  return { dir, file: join(dir, "device.json") };
}

function readDeviceIdFromFile(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  if (
    raw &&
    typeof raw === "object" &&
    typeof raw.deviceId === "string" &&
    raw.deviceId.length > 0
  ) {
    return raw.deviceId as string;
  }
  return null;
}

/**
 * Read the current stable device ID without creating or writing device.json.
 */
export function getExistingDeviceId(): string | null {
  if (cached !== undefined) {
    return cached;
  }

  const fromEnv = getDeviceIdOverride();
  if (fromEnv) {
    cached = fromEnv;
    log.info({ deviceId: cached }, "Resolved device ID from FORGE_DEVICE_ID");
    return cached;
  }

  const { file: filePath } = resolveDeviceIdPaths();
  try {
    const existing = readDeviceIdFromFile(filePath);
    if (existing) {
      cached = existing;
      log.info({ deviceId: cached }, "Resolved device ID from device.json");
      return cached;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Get the stable device ID for this machine.
 *
 * Resolution order:
 *   1. Cached in-memory value (populated on first call)
 *   2. `FORGE_DEVICE_ID` env var (CLI-injected; see env-registry)
 *   3. `deviceId` field from device.json
 *   4. Generate a new UUID, persist it to device.json, and return it
 *
 * On any read/write error the generated UUID is still cached so the
 * process uses a consistent ID for the remainder of its lifetime.
 */
export function getDeviceId(): string {
  if (cached !== undefined) {
    return cached;
  }

  const fromEnv = getDeviceIdOverride();
  if (fromEnv) {
    cached = fromEnv;
    log.info({ deviceId: cached }, "Resolved device ID from FORGE_DEVICE_ID");
    return cached;
  }

  const { dir: forgeDir, file: filePath } = resolveDeviceIdPaths();
  const generated = randomUUID();

  try {
    const existing = readDeviceIdFromFile(filePath);
    if (existing) {
      cached = existing;
      log.info({ deviceId: cached }, "Resolved device ID from device.json");
      return cached;
    }
  } catch (err) {
    log.warn({ err }, "Failed to read device.json — generating new device ID");
  }

  // Either the file doesn't exist or deviceId was missing/empty.
  // Generate a new UUID and persist it.
  try {
    mkdirSync(forgeDir, { recursive: true });

    // Read existing content to preserve other fields
    let existing: Record<string, unknown> = {};
    try {
      if (existsSync(filePath)) {
        const raw = JSON.parse(readFileSync(filePath, "utf-8"));
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          existing = raw as Record<string, unknown>;
        }
      }
    } catch {
      // Malformed JSON — start fresh
    }

    existing.deviceId = generated;
    writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", {
      mode: 0o644,
    });
    log.info({ deviceId: generated }, "Created new device ID in device.json");
  } catch (err) {
    log.warn(
      { err },
      "Failed to write device.json — using generated device ID in-memory only",
    );
  }

  cached = generated;
  return cached;
}

/**
 * Reset the cached device ID. Used by tests to force
 * re-resolution on the next call.
 */
export function resetDeviceIdCache(): void {
  cached = undefined;
}
