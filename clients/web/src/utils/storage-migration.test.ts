import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  migrateKey,
  migratePrefix,
  migrateValue,
  removeKey,
  removePersistedPairedGatewayCredential,
  runStorageMigrations,
} from "./storage-migration";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("removeKey", () => {
  test("removes an existing key", () => {
    localStorage.setItem("old:key", "value");

    removeKey("old:key");

    expect(localStorage.getItem("old:key")).toBeNull();
  });

  test("no-op when key is absent", () => {
    removeKey("missing");

    expect(localStorage.getItem("missing")).toBeNull();
  });
});

describe("migrateValue", () => {
  test("converts matching old value to new value", () => {
    localStorage.setItem("key", "1");

    migrateValue("key", "1", "true");

    expect(localStorage.getItem("key")).toBe("true");
  });

  test("no-op when current value does not match old value", () => {
    localStorage.setItem("key", "true");

    migrateValue("key", "1", "true");

    expect(localStorage.getItem("key")).toBe("true");
  });

  test("no-op when key is absent", () => {
    migrateValue("missing", "1", "true");

    expect(localStorage.getItem("missing")).toBeNull();
  });
});

describe("migrateKey", () => {
  test("renames old key to new key", () => {
    localStorage.setItem("old:key", "value");

    migrateKey("old:key", "new:key");

    expect(localStorage.getItem("new:key")).toBe("value");
    expect(localStorage.getItem("old:key")).toBeNull();
  });

  test("no-op when old key is absent", () => {
    migrateKey("missing", "new:key");

    expect(localStorage.getItem("new:key")).toBeNull();
  });

  test("preserves existing new key (idempotent)", () => {
    localStorage.setItem("old:key", "stale");
    localStorage.setItem("new:key", "fresh");

    migrateKey("old:key", "new:key");

    expect(localStorage.getItem("new:key")).toBe("fresh");
    expect(localStorage.getItem("old:key")).toBeNull();
  });

  test("idempotent when called twice", () => {
    localStorage.setItem("old:key", "value");

    migrateKey("old:key", "new:key");
    migrateKey("old:key", "new:key");

    expect(localStorage.getItem("new:key")).toBe("value");
    expect(localStorage.getItem("old:key")).toBeNull();
  });
});

describe("migratePrefix", () => {
  test("renames all keys matching the old prefix", () => {
    // eslint-disable-next-line no-restricted-syntax -- test: verifying migration of storage keys
    localStorage.setItem("voice:ttsApiKey:openai", "sk-123");
    // eslint-disable-next-line no-restricted-syntax -- test: verifying migration of storage keys
    localStorage.setItem("voice:ttsApiKey:elevenlabs", "el-456");
    localStorage.setItem("voice:sttProvider", "whisper");

    migratePrefix("voice:ttsApiKey:", "forge:voice:ttsApiKey:");

    expect(localStorage.getItem("forge:voice:ttsApiKey:openai")).toBe(
      "sk-123",
    );
    expect(localStorage.getItem("forge:voice:ttsApiKey:elevenlabs")).toBe(
      "el-456",
    );
    expect(localStorage.getItem("voice:ttsApiKey:openai")).toBeNull();
    expect(localStorage.getItem("voice:ttsApiKey:elevenlabs")).toBeNull();
    // Unrelated key untouched
    expect(localStorage.getItem("voice:sttProvider")).toBe("whisper");
  });

  test("no-op when no keys match", () => {
    localStorage.setItem("other:key", "value");

    migratePrefix("voice:", "forge:voice:");

    expect(localStorage.getItem("other:key")).toBe("value");
    expect(localStorage.length).toBe(1);
  });

  test("preserves existing new keys (idempotent)", () => {
    localStorage.setItem("ff:client:flag-a", "old");
    localStorage.setItem("forge:ff:flag-a", "already-migrated");

    migratePrefix("ff:client:", "forge:ff:");

    expect(localStorage.getItem("forge:ff:flag-a")).toBe("already-migrated");
    expect(localStorage.getItem("ff:client:flag-a")).toBeNull();
  });
});

describe("removePersistedPairedGatewayCredential", () => {
  test("removes a paired guardian bearer and its metadata", () => {
    // eslint-disable-next-line no-restricted-syntax -- test: seeding a legacy paired credential to verify removal
    localStorage.setItem("forge:gw:token", "guardian-token");
    localStorage.setItem("forge:gw:expiresAt", "2000000000");
    // eslint-disable-next-line no-restricted-syntax -- test: seeding legacy paired credential metadata to verify removal
    localStorage.setItem(
      "forge:gw:tokenSource",
      "/assistant/__gateway-paired/paired-a/auth/token",
    );

    removePersistedPairedGatewayCredential();

    expect(localStorage.getItem("forge:gw:token")).toBeNull();
    expect(localStorage.getItem("forge:gw:expiresAt")).toBeNull();
    expect(localStorage.getItem("forge:gw:tokenSource")).toBeNull();
  });

  test("preserves a locally minted gateway actor token", () => {
    // eslint-disable-next-line no-restricted-syntax -- test: seeding a legacy local actor token to verify preservation
    localStorage.setItem("forge:gw:token", "local-actor-token");
    localStorage.setItem("forge:gw:expiresAt", "2000000000");
    // eslint-disable-next-line no-restricted-syntax -- test: seeding legacy local actor metadata to verify preservation
    localStorage.setItem(
      "forge:gw:tokenSource",
      "/assistant/__gateway/20100/auth/token",
    );

    removePersistedPairedGatewayCredential();

    expect(localStorage.getItem("forge:gw:token")).toBe("local-actor-token");
  });
});

describe("runStorageMigrations", () => {
  test("migrates sidebar keys", () => {
    localStorage.setItem("assistantSidebarCollapsed", "true");
    localStorage.setItem("assistantSidebarWidth", "300");

    runStorageMigrations();

    expect(localStorage.getItem("forge:sidebar:collapsed")).toBe("true");
    expect(localStorage.getItem("forge:sidebar:width")).toBe("300");
    expect(localStorage.getItem("assistantSidebarCollapsed")).toBeNull();
    expect(localStorage.getItem("assistantSidebarWidth")).toBeNull();
  });

  test("migrates voice: keys", () => {
    localStorage.setItem("voice:permissionPrimerSeen", "true");
    localStorage.setItem("voice:ttsProvider", "openai");
    localStorage.setItem("voice:sttProvider", "whisper");
    localStorage.setItem("voice:activationKey", "Space");
    // eslint-disable-next-line no-restricted-syntax -- test: verifying migration of API key storage keys
    localStorage.setItem("voice:ttsApiKey:openai", "sk-123");
    localStorage.setItem("voice:ttsVoiceId:openai", "alloy");
    // eslint-disable-next-line no-restricted-syntax -- test: verifying migration of API key storage keys
    localStorage.setItem("voice:sttApiKey:deepgram", "dg-456");

    runStorageMigrations();

    expect(localStorage.getItem("forge:voice:permissionPrimerSeen")).toBe(
      "true",
    );
    expect(localStorage.getItem("forge:voice:ttsProvider")).toBe("openai");
    expect(localStorage.getItem("forge:voice:sttProvider")).toBe("whisper");
    expect(localStorage.getItem("forge:voice:activationKey")).toBe("Space");
    expect(localStorage.getItem("forge:voice:ttsApiKey:openai")).toBe(
      "sk-123",
    );
    expect(localStorage.getItem("forge:voice:ttsVoiceId:openai")).toBe(
      "alloy",
    );
    expect(localStorage.getItem("forge:voice:sttApiKey:deepgram")).toBe(
      "dg-456",
    );
    // Old keys removed
    expect(localStorage.getItem("voice:permissionPrimerSeen")).toBeNull();
    expect(localStorage.getItem("voice:ttsApiKey:openai")).toBeNull();
  });

  test("migrates onboarding. keys", () => {
    localStorage.setItem("onboarding.tosAccepted", "true");
    localStorage.setItem("onboarding.aiDataConsent", "true");
    localStorage.setItem("onboarding.completed", "true");
    localStorage.setItem("onboarding.selectedVersion", "v1.0");

    runStorageMigrations();

    expect(localStorage.getItem("forge:onboarding:tosAccepted")).toBe("true");
    expect(localStorage.getItem("forge:onboarding:aiDataConsent")).toBe(
      "true",
    );
    // completed key is removed (no longer used), not migrated
    expect(localStorage.getItem("onboarding.completed")).toBeNull();
    expect(localStorage.getItem("forge:onboarding:completed")).toBeNull();
    expect(localStorage.getItem("forge:onboarding:selectedVersion")).toBe(
      "v1.0",
    );
    expect(localStorage.getItem("onboarding.tosAccepted")).toBeNull();
  });

  test("migrates forge_ AI settings keys", () => {
    localStorage.setItem("forge_image_gen_mode", "enabled");
    localStorage.setItem("forge_web_search_provider", "perplexity");
    localStorage.setItem("forge_gemini_key", "gk-789");
    localStorage.setItem("forge_perplexity_key", "pplx-abc");
    localStorage.setItem("forge_brave_key", "BSA-def");
    localStorage.setItem("forge_tavily_key", "tvly-ghi");

    runStorageMigrations();

    expect(localStorage.getItem("forge:ai:imageGenMode")).toBe("enabled");
    expect(localStorage.getItem("forge:ai:webSearchProvider")).toBe(
      "perplexity",
    );
    expect(localStorage.getItem("forge:ai:geminiKey")).toBe("gk-789");
    expect(localStorage.getItem("forge:ai:perplexityKey")).toBe("pplx-abc");
    expect(localStorage.getItem("forge:ai:braveKey")).toBe("BSA-def");
    expect(localStorage.getItem("forge:ai:tavilyKey")).toBe("tvly-ghi");
    expect(localStorage.getItem("forge_image_gen_mode")).toBeNull();
  });

  test("migrates ff:client: prefix", () => {
    localStorage.setItem("ff:client:my-flag", "true");
    localStorage.setItem("ff:client:another-flag", "false");

    runStorageMigrations();

    expect(localStorage.getItem("forge:ff:my-flag")).toBe("true");
    expect(localStorage.getItem("forge:ff:another-flag")).toBe("false");
    expect(localStorage.getItem("ff:client:my-flag")).toBeNull();
  });

  test("carries the watch flag override onto the teach key", () => {
    localStorage.setItem("forge:ff:watch", "true");

    runStorageMigrations();

    expect(localStorage.getItem("forge:ff:teach")).toBe("true");
    expect(localStorage.getItem("forge:ff:watch")).toBeNull();
  });

  test("carries an off override too, rather than dropping it", () => {
    localStorage.setItem("forge:ff:watch", "false");

    runStorageMigrations();

    expect(localStorage.getItem("forge:ff:teach")).toBe("false");
  });

  test("leaves an existing teach override alone", () => {
    localStorage.setItem("forge:ff:watch", "false");
    localStorage.setItem("forge:ff:teach", "true");

    runStorageMigrations();

    expect(localStorage.getItem("forge:ff:teach")).toBe("true");
    expect(localStorage.getItem("forge:ff:watch")).toBeNull();
  });

  test("migrates gw: and local: keys", () => {
    // eslint-disable-next-line no-restricted-syntax -- test: verifying migration of gateway token keys
    localStorage.setItem("gw:token", "jwt-abc");
    // generic-examples:ignore-next-line — reason: epoch timestamp, not a phone number
    localStorage.setItem("gw:expiresAt", "1700000000");
    // eslint-disable-next-line no-restricted-syntax -- test: verifying migration of gateway token keys
    localStorage.setItem("gw:tokenSource", "/auth/token");
    localStorage.setItem("local:lockfile", "{}");
    localStorage.setItem("local:selectedAssistantId", "asst-1");

    runStorageMigrations();

    expect(localStorage.getItem("forge:gw:token")).toBe("jwt-abc");
    // generic-examples:ignore-next-line — reason: epoch timestamp, not a phone number
    expect(localStorage.getItem("forge:gw:expiresAt")).toBe("1700000000");
    expect(localStorage.getItem("forge:gw:tokenSource")).toBe("/auth/token");
    expect(localStorage.getItem("forge:local:lockfile")).toBe("{}");
    // local:selectedAssistantId is canonicalized then collapsed into the single
    // forge:selectedAssistantId, so the intermediate key no longer survives.
    expect(localStorage.getItem("forge:selectedAssistantId")).toBe("asst-1");
    expect(localStorage.getItem("forge:local:selectedAssistantId")).toBeNull();
    expect(localStorage.getItem("gw:token")).toBeNull();
    expect(localStorage.getItem("local:lockfile")).toBeNull();
  });

  test("migrates disk-pressure-warning prefix", () => {
    localStorage.setItem("disk-pressure-warning-dismissed-asst-1", "true");
    localStorage.setItem("disk-pressure-warning-dismissed-asst-2", "true");

    runStorageMigrations();

    expect(localStorage.getItem("forge:diskPressureDismissed:asst-1")).toBe(
      "true",
    );
    expect(localStorage.getItem("forge:diskPressureDismissed:asst-2")).toBe(
      "true",
    );
    expect(
      localStorage.getItem("disk-pressure-warning-dismissed-asst-1"),
    ).toBeNull();
  });

  test("collapses the legacy per-org assistant map into one key", () => {
    // Canonicalized first (forge_current_assistant_id__ → forge:currentAssistantId:),
    // then collapsed into the single forge:selectedAssistantId. With no current
    // org at migration time, the lexicographically-smallest org suffix wins.
    localStorage.setItem("forge_current_assistant_id__org-2", "asst-b");
    localStorage.setItem("forge_current_assistant_id__org-1", "asst-a");

    runStorageMigrations();

    expect(localStorage.getItem("forge:selectedAssistantId")).toBe("asst-a");
    expect(localStorage.getItem("forge:currentAssistantId:org-1")).toBeNull();
    expect(localStorage.getItem("forge:currentAssistantId:org-2")).toBeNull();
    expect(
      localStorage.getItem("forge_current_assistant_id__org-1"),
    ).toBeNull();
  });

  test("collapse prefers the persisted active org's per-org selection", () => {
    // Active org is org-2 even though org-1 sorts first; the active org's pick
    // must win so a multi-org user keeps their current selection on upgrade.
    sessionStorage.setItem("forge_active_organization_id", "org-2");
    localStorage.setItem("forge:currentAssistantId:org-1", "asst-1");
    localStorage.setItem("forge:currentAssistantId:org-2", "asst-2");

    runStorageMigrations();

    expect(localStorage.getItem("forge:selectedAssistantId")).toBe("asst-2");
    expect(localStorage.getItem("forge:currentAssistantId:org-1")).toBeNull();
    expect(localStorage.getItem("forge:currentAssistantId:org-2")).toBeNull();
  });

  test("collapse prefers the tab-local key and is idempotent", () => {
    localStorage.setItem("forge:local:selectedAssistantId", "tab-local");
    localStorage.setItem("forge:currentAssistantId:org-1", "per-org");

    runStorageMigrations();
    expect(localStorage.getItem("forge:selectedAssistantId")).toBe(
      "tab-local",
    );
    expect(localStorage.getItem("forge:local:selectedAssistantId")).toBeNull();
    expect(localStorage.getItem("forge:currentAssistantId:org-1")).toBeNull();

    // Re-running leaves the collapsed value untouched and removes nothing new.
    runStorageMigrations();
    expect(localStorage.getItem("forge:selectedAssistantId")).toBe(
      "tab-local",
    );
  });

  test("migrates forgeDebug key", () => {
    localStorage.setItem(
      "forgeDebug.flags.impersonateAssistantVersion",
      "0.8.6",
    );

    runStorageMigrations();

    expect(
      localStorage.getItem("forge:debug:impersonateAssistantVersion"),
    ).toBe("0.8.6");
    expect(
      localStorage.getItem("forgeDebug.flags.impersonateAssistantVersion"),
    ).toBeNull();
  });

  test("migrates skillsTabTipDismissed to new name", () => {
    localStorage.setItem("forge:skillsTabTipDismissed", "true");

    runStorageMigrations();

    expect(localStorage.getItem("forge:skills:tipDismissed")).toBe("true");
    expect(localStorage.getItem("forge:skillsTabTipDismissed")).toBeNull();
  });

  test("converts skills tip value from '1' to 'true'", () => {
    localStorage.setItem("forge:skills:tipDismissed", "1");

    runStorageMigrations();

    expect(localStorage.getItem("forge:skills:tipDismissed")).toBe("true");
  });

  test("does not touch device: keys", () => {
    localStorage.setItem("device:theme", "dark");
    localStorage.setItem("device:timezone", "UTC");

    runStorageMigrations();

    expect(localStorage.getItem("device:theme")).toBe("dark");
    expect(localStorage.getItem("device:timezone")).toBe("UTC");
  });

  test("does not touch third-party keys", () => {
    localStorage.setItem("_ga", "GA1.2.123456");
    localStorage.setItem("intercom-session", "abc");

    runStorageMigrations();

    expect(localStorage.getItem("_ga")).toBe("GA1.2.123456");
    expect(localStorage.getItem("intercom-session")).toBe("abc");
  });

  test("removes legacy nudge keys and their cleanup flag", () => {
    localStorage.setItem("app.githubNudge.starred", "true");
    localStorage.setItem("app.discordNudge.joined", "true");
    localStorage.setItem("app.nudgeLegacy.cleaned", "true");

    runStorageMigrations();

    expect(localStorage.getItem("app.githubNudge.starred")).toBeNull();
    expect(localStorage.getItem("app.discordNudge.joined")).toBeNull();
    expect(localStorage.getItem("app.nudgeLegacy.cleaned")).toBeNull();
  });

  test("full migration is idempotent", () => {
    localStorage.setItem("assistantSidebarCollapsed", "true");
    localStorage.setItem("voice:ttsProvider", "openai");
    localStorage.setItem("onboarding.tosAccepted", "true");
    localStorage.setItem("ff:client:flag", "true");

    runStorageMigrations();
    const snapshot1 = { ...localStorage };

    runStorageMigrations();
    const snapshot2 = { ...localStorage };

    expect(snapshot1).toEqual(snapshot2);
  });
  test("converts a legacy imageGenMode into the equivalent provider", () => {
    localStorage.setItem("forge:ai:imageGenMode", "managed");
    runStorageMigrations();
    expect(localStorage.getItem("forge:ai:imageGenProvider")).toBe("forge");

    localStorage.clear();
    localStorage.setItem("forge:ai:imageGenMode", "your-own");
    runStorageMigrations();
    expect(localStorage.getItem("forge:ai:imageGenProvider")).toBe("gemini");
  });

  test("a stored imageGenProvider wins over the legacy mode", () => {
    localStorage.setItem("forge:ai:imageGenMode", "managed");
    localStorage.setItem("forge:ai:imageGenProvider", "gemini");
    runStorageMigrations();
    expect(localStorage.getItem("forge:ai:imageGenProvider")).toBe("gemini");
  });

  test("continues when image provider storage is unavailable", () => {
    const originalGetItem = localStorage.getItem;
    Object.defineProperty(localStorage, "getItem", {
      value(key: string) {
        if (key === "forge:ai:imageGenProvider") {
          throw new DOMException("Storage unavailable", "SecurityError");
        }
        return originalGetItem.call(localStorage, key);
      },
      configurable: true,
    });

    try {
      expect(() => runStorageMigrations()).not.toThrow();
    } finally {
      Object.defineProperty(localStorage, "getItem", {
        value: originalGetItem,
        configurable: true,
      });
    }
  });
});
