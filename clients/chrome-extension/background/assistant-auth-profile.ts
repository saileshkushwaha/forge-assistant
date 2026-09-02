/**
 * Auth profile enum for the chrome extension's transport selection.
 *
 * - `self-hosted` — pair directly with the gateway's
 *   `/v1/pair` endpoint over HTTP, then open a
 *   WebSocket relay to the same gateway. Used for locally running
 *   assistants where the extension can reach the gateway over loopback
 *   (or a user-provided URL).
 * - `forge-cloud` — Forge-cloud-managed assistant. Auth relies on the
 *   WorkOS session token and the SSE `/events` transport.
 * - `unsupported` — the topology is not recognised by this version of
 *   the extension.
 */
export type AssistantAuthProfile = 'self-hosted' | 'forge-cloud' | 'unsupported';

/**
 * The subset of topology fields needed to derive the auth profile.
 */
export interface LockfileTopology {
  cloud: string;
  runtimeUrl?: string;
}

/** Cloud values that map to self-hosted direct pairing. */
const LOCAL_CLOUD_VALUES = new Set(['local', 'apple-container']);

/** Cloud values that map to Forge-cloud (WorkOS session auth). */
const FORGE_CLOUD_VALUES = new Set(['forge', 'platform']);

/**
 * Derive the auth profile for a given topology.
 */
export function resolveAuthProfile(topology: LockfileTopology): AssistantAuthProfile {
  if (LOCAL_CLOUD_VALUES.has(topology.cloud)) {
    return 'self-hosted';
  }
  if (FORGE_CLOUD_VALUES.has(topology.cloud)) {
    return 'forge-cloud';
  }
  return 'unsupported';
}
