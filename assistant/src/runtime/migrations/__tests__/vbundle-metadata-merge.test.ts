/**
 * Unit tests for the credential metadata merge helper used by the bundle
 * importers. Covers the behaviour the two importers rely on:
 *
 * - Bundle without forge + target with forge → target's forge entries
 *   survive and the bundle's non-forge entries are kept.
 * - Bundle with mixed user services → non-forge entries import, any
 *   rogue forge entries in the bundle are dropped.
 * - Live metadata empty / missing → bundle lands as-is.
 * - Malformed inputs → no corruption (bundle returned verbatim).
 */

import { describe, expect, test } from "bun:test";

import { mergeMetadataPreservingForge } from "../vbundle-metadata-merge.js";

interface Record {
  credentialId: string;
  service: string;
  field: string;
  allowedTools: string[];
  allowedDomains: string[];
  createdAt: number;
  updatedAt: number;
}

function record(
  overrides: Partial<Record> & Pick<Record, "service" | "field">,
): Record {
  const now = Date.now();
  return {
    credentialId: `id-${overrides.service}-${overrides.field}`,
    allowedTools: [],
    allowedDomains: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function file(records: Record[], version = 5): string {
  return JSON.stringify({ version, credentials: records });
}

function parse(json: string): { version?: number; credentials: Record[] } {
  const parsed = JSON.parse(json);
  return {
    version: parsed.version,
    credentials: (parsed.credentials ?? []) as Record[],
  };
}

function asKey(r: Record): string {
  return `${r.service}:${r.field}`;
}

function keys(records: Record[]): Set<string> {
  return new Set(records.map(asKey));
}

const FORGE_FIELDS = [
  "platform_base_url",
  "assistant_api_key",
  "platform_assistant_id",
  "webhook_secret",
] as const;

function forgeRecords(): Record[] {
  return FORGE_FIELDS.map((field) =>
    record({ service: "forge", field, credentialId: `target-${field}` }),
  );
}

describe("mergeMetadataPreservingForge", () => {
  test("preserves all four target forge:* entries when bundle has none", () => {
    const target = forgeRecords();
    const bundle = [
      record({ service: "telegram", field: "bot_token" }),
      record({ service: "slack_channel", field: "app_token" }),
    ];

    const merged = parse(
      mergeMetadataPreservingForge(file(bundle), file(target)),
    );

    const mergedKeys = keys(merged.credentials);
    for (const field of FORGE_FIELDS) {
      expect(mergedKeys.has(`forge:${field}`)).toBe(true);
    }
    expect(mergedKeys.has("telegram:bot_token")).toBe(true);
    expect(mergedKeys.has("slack_channel:app_token")).toBe(true);
  });

  test("bundle non-forge entries still import alongside preserved forge entries", () => {
    const target = forgeRecords();
    const bundle = [
      record({ service: "telegram", field: "bot_token" }),
      record({ service: "telegram", field: "webhook_secret" }),
      record({ service: "google", field: "access_token" }),
    ];

    const merged = parse(
      mergeMetadataPreservingForge(file(bundle), file(target)),
    );

    // 4 forge + 3 user = 7 total.
    expect(merged.credentials.length).toBe(7);
    expect(keys(merged.credentials).size).toBe(7);

    // Target's credentialIds for forge are preserved (not the bundle's).
    for (const r of merged.credentials) {
      if (r.service === "forge") {
        expect(r.credentialId.startsWith("target-")).toBe(true);
      }
    }
  });

  test("drops bundle forge:* entries and preserves target's identity", () => {
    const target = forgeRecords();
    // Bundle carries conflicting forge entries — should be dropped even
    // though the source would normally be filtered before this helper is
    // called.
    const bundle = [
      record({
        service: "forge",
        field: "assistant_api_key",
        credentialId: "source-rogue",
      }),
      record({
        service: "forge",
        field: "platform_base_url",
        credentialId: "source-rogue-url",
      }),
      record({ service: "telegram", field: "bot_token" }),
    ];

    const merged = parse(
      mergeMetadataPreservingForge(file(bundle), file(target)),
    );

    const forgeRecordsOut = merged.credentials.filter(
      (r) => r.service === "forge",
    );
    expect(forgeRecordsOut.length).toBe(4);
    for (const r of forgeRecordsOut) {
      expect(r.credentialId.startsWith("target-")).toBe(true);
    }
    // Telegram entry still imports.
    expect(
      merged.credentials.some(
        (r) => r.service === "telegram" && r.field === "bot_token",
      ),
    ).toBe(true);
  });

  test("no live metadata → bundle passes through unchanged (no forge in bundle)", () => {
    const bundle = [
      record({ service: "telegram", field: "bot_token" }),
      record({ service: "slack_channel", field: "app_token" }),
    ];
    const merged = parse(mergeMetadataPreservingForge(file(bundle), null));
    expect(keys(merged.credentials)).toEqual(
      new Set(["telegram:bot_token", "slack_channel:app_token"]),
    );
  });

  test("no live metadata still strips bundle forge:* entries", () => {
    const bundle = [
      record({ service: "forge", field: "assistant_api_key" }),
      record({ service: "telegram", field: "bot_token" }),
    ];
    const merged = parse(mergeMetadataPreservingForge(file(bundle), null));
    // Bundle's forge entry is always filtered.
    expect(merged.credentials.length).toBe(1);
    expect(merged.credentials[0]?.service).toBe("telegram");
  });

  test("preserves bundle version field verbatim", () => {
    const bundle = file([record({ service: "telegram", field: "bot_token" })]);
    const merged = JSON.parse(
      mergeMetadataPreservingForge(bundle, file(forgeRecords())),
    );
    expect(merged.version).toBe(5);
  });

  test("malformed bundle JSON → returned unchanged (never corrupt the file)", () => {
    const bad = "{not valid json";
    const live = file(forgeRecords());
    const result = mergeMetadataPreservingForge(bad, live);
    expect(result).toBe(bad);
  });

  test("malformed live JSON → bundle returned as merged output without preservation", () => {
    const bundle = file([record({ service: "telegram", field: "bot_token" })]);
    const merged = parse(mergeMetadataPreservingForge(bundle, "{bad"));
    expect(keys(merged.credentials)).toEqual(new Set(["telegram:bot_token"]));
  });

  test("live metadata with extra non-forge entries does NOT smuggle them in", () => {
    const live = file([
      ...forgeRecords(),
      record({ service: "telegram", field: "bot_token" }),
      record({ service: "notion", field: "api_key" }),
    ]);
    const bundle = file([
      record({ service: "slack_channel", field: "app_token" }),
    ]);

    const merged = parse(mergeMetadataPreservingForge(bundle, live));

    // Only bundle's non-forge + target's forge. Target's user entries
    // must NOT carry over (they belong to source-style flows, handled by
    // the bundle).
    expect(keys(merged.credentials).has("slack_channel:app_token")).toBe(true);
    expect(keys(merged.credentials).has("telegram:bot_token")).toBe(false);
    expect(keys(merged.credentials).has("notion:api_key")).toBe(false);
    for (const field of FORGE_FIELDS) {
      expect(keys(merged.credentials).has(`forge:${field}`)).toBe(true);
    }
  });
});
