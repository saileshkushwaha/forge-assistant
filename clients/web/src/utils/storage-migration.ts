/**
 * One-time localStorage key migrations.
 *
 * All app-owned localStorage keys must start with either:
 * - `forge:` — user-scoped, cleared on logout
 * - `device:` — device-scoped, preserved across sessions
 *
 * This module renames legacy keys (unprefixed, `onboarding.`, `voice:`,
 * `ff:client:`, `gw:`, `local:`, `integrations.`, `forge_`) to the
 * canonical `forge:` namespace so that session-cleanup.ts can use a
 * single prefix check instead of a brittle allowlist.
 *
 * Migrations are idempotent — safe to re-run on every app startup.
 * Executed synchronously at import time via `run-storage-migrations.ts`,
 * which must be imported before any Zustand store that reads localStorage
 * at module level (see the import order comment in `main.tsx`).
 */

/**
 * Migrate a key's stored value from one format to another without
 * renaming the key. Idempotent — only writes when the current value
 * matches `oldValue` exactly.
 */
export function migrateValue(
  key: string,
  oldValue: string,
  newValue: string,
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (localStorage.getItem(key) === oldValue) {
      localStorage.setItem(key, newValue);
    }
  } catch {
    // Storage unavailable — retry on next load.
  }
}

/**
 * Remove a legacy key that has no successor. Idempotent.
 */
export function removeKey(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable — retry on next load.
  }
}

/**
 * Migrate a single static key. Idempotent: writes the new key only
 * when it doesn't already exist, removes the old key only after the
 * new key is confirmed persisted (guards against QuotaExceededError
 * silently losing the value).
 */
export function migrateKey(oldKey: string, newKey: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const value = localStorage.getItem(oldKey);
    if (value === null) {
      return;
    }
    if (localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value);
    }
    if (localStorage.getItem(newKey) !== null) {
      localStorage.removeItem(oldKey);
    }
  } catch {
    // Storage unavailable — migration retries on next load.
  }
}

/**
 * Migrate all keys matching `oldPrefix` to `newPrefix`, preserving
 * the suffix. Uses a snapshot of keys to avoid mutating during
 * iteration.
 */
export function migratePrefix(oldPrefix: string, newPrefix: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const pairs: [string, string][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(oldPrefix)) {
        const suffix = key.slice(oldPrefix.length);
        pairs.push([key, newPrefix + suffix]);
      }
    }
    for (const [oldKey, newKey] of pairs) {
      migrateKey(oldKey, newKey);
    }
  } catch {
    // Storage unavailable.
  }
}

/** Remove guardian credentials persisted by the legacy paired-session flow. */
export function removePersistedPairedGatewayCredential(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const source =
      localStorage.getItem("forge:gw:tokenSource") ??
      localStorage.getItem("gw:tokenSource");
    if (!source?.includes("/__gateway-paired/")) {
      return;
    }
    for (const key of [
      "forge:gw:token",
      "forge:gw:expiresAt",
      "forge:gw:tokenSource",
      "gw:token",
      "gw:expiresAt",
      "gw:tokenSource",
    ]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable. Retry on next load.
  }
}

/**
 * Remove every key matching `prefix`. Snapshots keys first to avoid mutating
 * during iteration. Caller is responsible for the try/catch.
 */
function removeAllWithPrefix(prefix: string): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

/**
 * Collapse the two legacy selection schemes — the tab-local
 * `forge:local:selectedAssistantId` and the per-org
 * `forge:currentAssistantId:<org>` map — into the single
 * `forge:selectedAssistantId` key.
 *
 * Among per-org entries, prefer the persisted active org's selection (the org
 * store records it in sessionStorage as `forge_active_organization_id`) so a
 * multi-org user keeps their current org's pick. Only when that's absent does
 * the lexicographically-smallest org suffix win — deterministic and idempotent.
 * A non-ideal pick self-heals on read: `resolveSelectedAssistantId` validates
 * the id against the active org and drops it if it doesn't belong. Idempotent
 * via the target-exists short-circuit plus unconditional legacy removal.
 */
export function collapseSelectedAssistantKeys(): void {
  if (typeof window === "undefined") {
    return;
  }
  const target = "forge:selectedAssistantId";
  const tabLocalKey = "forge:local:selectedAssistantId";
  const perOrgPrefix = "forge:currentAssistantId:";
  try {
    if (localStorage.getItem(target) === null) {
      let candidate = localStorage.getItem(tabLocalKey);
      if (candidate === null) {
        candidate = activeOrgSelection(perOrgPrefix);
      }
      if (candidate === null) {
        let smallestKey: string | null = null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(perOrgPrefix)) {
            if (smallestKey === null || key < smallestKey) {
              smallestKey = key;
            }
          }
        }
        if (smallestKey !== null) {
          candidate = localStorage.getItem(smallestKey);
        }
      }
      if (candidate) {
        localStorage.setItem(target, candidate);
      }
    }
    localStorage.removeItem(tabLocalKey);
    removeAllWithPrefix(perOrgPrefix);
  } catch {
    // Storage unavailable — migration retries on next load.
  }
}

/** The per-org selection for the persisted active org, or null. */
function activeOrgSelection(perOrgPrefix: string): string | null {
  let activeOrg: string | null = null;
  try {
    activeOrg = sessionStorage.getItem("forge_active_organization_id");
  } catch {
    return null;
  }
  if (!activeOrg) {
    return null;
  }
  return localStorage.getItem(`${perOrgPrefix}${activeOrg}`);
}

/**
 * Run all pending storage key migrations. Called from
 * `run-storage-migrations.ts` (side-effect import at the top of
 * `main.tsx`).
 *
 * Each migration is a one-time rename: read old → write new → remove old.
 * The order within each group doesn't matter since there are no
 * inter-key dependencies.
 */
export function runStorageMigrations(): void {
  if (typeof window === "undefined") {
    return;
  }

  // -- Static key renames ------------------------------------------------

  // Unprefixed → forge: (these escaped cleanup entirely before)
  migrateKey("assistantSidebarCollapsed", "forge:sidebar:collapsed");
  migrateKey("assistantSidebarWidth", "forge:sidebar:width");

  // voice: → forge:voice:
  migrateKey("voice:permissionPrimerSeen", "forge:voice:permissionPrimerSeen");
  // `voice:conversationTimeoutSeconds` is intentionally not migrated: the
  // setting was a leftover of the Swift macOS app, and nothing on web has read
  // it since that client was removed.
  migrateKey("voice:ttsProvider", "forge:voice:ttsProvider");
  migrateKey("voice:sttProvider", "forge:voice:sttProvider");
  migrateKey("voice:activationKey", "forge:voice:activationKey");

  // integrations. → forge:integrations:
  migrateKey(
    "integrations.bannerDismissed",
    "forge:integrations:bannerDismissed",
  );

  // onboarding. → forge:onboarding:
  migrateKey("onboarding.tosAccepted", "forge:onboarding:tosAccepted");
  migrateKey("onboarding.aiDataConsent", "forge:onboarding:aiDataConsent");
  removeKey("onboarding.completed");
  removeKey("forge:onboarding:completed");
  migrateKey("onboarding.selectedVersion", "forge:onboarding:selectedVersion");

  // forge:skillsTabTipDismissed → forge:skills:tipDismissed (consistent naming)
  migrateKey("forge:skillsTabTipDismissed", "forge:skills:tipDismissed");

  // forge_ → forge:ai: (AI settings page)
  migrateKey("forge_image_gen_mode", "forge:ai:imageGenMode");
  migrateKey("forge_image_gen_model", "forge:ai:imageGenModel");
  // Image generation is configured by provider alone; convert a stored
  // legacy mode into the equivalent provider so a previously-managed
  // browser does not fall back to the BYOK default before the daemon
  // config loads.
  try {
    if (localStorage.getItem("forge:ai:imageGenProvider") === null) {
      const legacyImageGenMode = localStorage.getItem("forge:ai:imageGenMode");
      if (legacyImageGenMode === "managed") {
        localStorage.setItem("forge:ai:imageGenProvider", "forge");
      } else if (legacyImageGenMode === "your-own") {
        localStorage.setItem("forge:ai:imageGenProvider", "gemini");
      }
    }
  } catch {
    // Storage unavailable. Retry on next load.
  }
  migrateKey("forge_web_search_mode", "forge:ai:webSearchMode");
  migrateKey("forge_web_search_provider", "forge:ai:webSearchProvider");
  migrateKey("forge_email_mode", "forge:ai:emailMode");
  migrateKey("forge_email_byo_provider", "forge:ai:emailByoProvider");
  migrateKey("forge_gemini_key", "forge:ai:geminiKey");
  migrateKey("forge_perplexity_key", "forge:ai:perplexityKey");
  migrateKey("forge_brave_key", "forge:ai:braveKey");
  migrateKey("forge_tavily_key", "forge:ai:tavilyKey");

  // forgeDebug. → forge:debug:
  migrateKey(
    "forgeDebug.flags.impersonateAssistantVersion",
    "forge:debug:impersonateAssistantVersion",
  );

  // gw: → forge:gw:
  migrateKey("gw:token", "forge:gw:token");
  migrateKey("gw:expiresAt", "forge:gw:expiresAt");
  migrateKey("gw:tokenSource", "forge:gw:tokenSource");
  removePersistedPairedGatewayCredential();

  // local: → forge:local:
  migrateKey("local:lockfile", "forge:local:lockfile");
  migrateKey("local:selectedAssistantId", "forge:local:selectedAssistantId");

  // Flag key renames. A developer's local override is stored under the flag
  // key, so renaming a key orphans the override and the flag silently falls
  // back to its registry default.
  migrateKey("forge:ff:watch", "forge:ff:teach");

  // -- Prefix renames (dynamic/per-entity keys) --------------------------

  // voice: per-provider keys → forge:voice:
  migratePrefix("voice:ttsApiKey:", "forge:voice:ttsApiKey:");
  migratePrefix("voice:ttsVoiceId:", "forge:voice:ttsVoiceId:");
  migratePrefix("voice:sttApiKey:", "forge:voice:sttApiKey:");

  // ff:client: → forge:ff:
  migratePrefix("ff:client:", "forge:ff:");

  // Unprefixed per-entity → forge:
  migratePrefix(
    "disk-pressure-warning-dismissed-",
    "forge:diskPressureDismissed:",
  );

  // forge_ per-org → forge:
  migratePrefix("forge_current_assistant_id__", "forge:currentAssistantId:");

  // Collapse the canonicalized legacy selection keys (tab-local + per-org map)
  // into the single `forge:selectedAssistantId`. Must run AFTER the renames
  // above so it sees the canonical key names.
  collapseSelectedAssistantKeys();

  // -- Value format migrations ---------------------------------------------
  // Skills tip was stored as "1"; getLocalBool expects "true".
  migrateValue("forge:skills:tipDismissed", "1", "true");

  // -- Dead key removals --------------------------------------------------
  // Legacy nudge keys superseded by the `forge:nudge-prefs` Zustand
  // persist store. Also remove the one-time cleanup flag itself.
  removeKey("app.githubNudge.starred");
  removeKey("app.githubNudge.bannerDismissed");
  removeKey("app.githubNudge.bannerDismissedAt");
  removeKey("app.discordNudge.joined");
  removeKey("app.discordNudge.bannerDismissed");
  removeKey("app.discordNudge.firstSeenAt");
  removeKey("app.nudgeLegacy.cleaned");
}
