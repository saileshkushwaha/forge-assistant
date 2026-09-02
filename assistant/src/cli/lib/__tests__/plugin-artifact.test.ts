/**
 * Tests for {@link parsePluginArtifact} — the `forge.artifact` descriptor
 * reader. A descriptor is surfaced only when both fields are well-formed
 * (https URL + 64-hex sha256); every malformed or partial shape is "no
 * artifact yet" (`null`) so callers never offer an unverifiable download.
 */

import { describe, expect, test } from "bun:test";

import { parsePluginArtifact, parsePluginIcon } from "../plugin-artifact.js";

const VALID_SHA = "a".repeat(64);

describe("parsePluginArtifact", () => {
  test("returns the descriptor when url + sha256 are well-formed", () => {
    // GIVEN a package.json with a complete forge.artifact block
    const pkg = {
      forge: {
        artifact: {
          url: "https://example.com/releases/v1.0.0/App.dmg",
          sha256: VALID_SHA,
        },
      },
    };

    // WHEN we parse it
    const artifact = parsePluginArtifact(pkg);

    // THEN both fields come through unchanged
    expect(artifact).toEqual({
      url: "https://example.com/releases/v1.0.0/App.dmg",
      sha256: VALID_SHA,
    });
  });

  test("surfaces an optional label when the plugin names the download", () => {
    // GIVEN a block that labels its artifact (e.g. for multi-artifact plugins)
    const pkg = {
      forge: {
        artifact: {
          url: "https://example.com/App.dmg",
          sha256: VALID_SHA,
          label: "Download for macOS",
        },
      },
    };

    // WHEN we parse it
    const artifact = parsePluginArtifact(pkg);

    // THEN the label comes through alongside url + sha256
    expect(artifact).toEqual({
      url: "https://example.com/App.dmg",
      sha256: VALID_SHA,
      label: "Download for macOS",
    });
  });

  test("trims a label and drops it when blank, keeping the descriptor", () => {
    // GIVEN a descriptor whose label is whitespace-only
    const pkg = {
      forge: {
        artifact: {
          url: "https://example.com/App.dmg",
          sha256: VALID_SHA,
          label: "   ",
        },
      },
    };

    // WHEN we parse it
    const artifact = parsePluginArtifact(pkg);

    // THEN the blank label is dropped but the artifact still surfaces
    expect(artifact).toEqual({
      url: "https://example.com/App.dmg",
      sha256: VALID_SHA,
    });
  });

  test("ignores a non-string label without dropping the descriptor", () => {
    // GIVEN a label of the wrong type
    const pkg = {
      forge: {
        artifact: {
          url: "https://example.com/App.dmg",
          sha256: VALID_SHA,
          label: 42,
        },
      },
    };

    // WHEN we parse it
    const artifact = parsePluginArtifact(pkg);

    // THEN the bad label is ignored but url + sha256 still come through
    expect(artifact).toEqual({
      url: "https://example.com/App.dmg",
      sha256: VALID_SHA,
    });
  });

  test("ignores extra fields inside the artifact block", () => {
    // GIVEN a block carrying fields beyond url + sha256
    const pkg = {
      forge: {
        artifact: {
          url: "https://example.com/App.dmg",
          sha256: VALID_SHA,
          platform: "macos",
          minOS: "13.0",
        },
      },
    };

    // WHEN we parse it
    const artifact = parsePluginArtifact(pkg);

    // THEN only the two recognised fields are surfaced
    expect(artifact).toEqual({
      url: "https://example.com/App.dmg",
      sha256: VALID_SHA,
    });
  });

  test.each([
    ["no forge block", { name: "x" }],
    ["no artifact block", { forge: {} }],
    [
      "empty sha256 (bootstrap placeholder)",
      {
        forge: {
          artifact: { url: "https://example.com/App.dmg", sha256: "" },
        },
      },
    ],
    [
      "sha256 too short",
      {
        forge: {
          artifact: { url: "https://example.com/App.dmg", sha256: "abc" },
        },
      },
    ],
    [
      "sha256 with uppercase hex",
      {
        forge: {
          artifact: {
            url: "https://example.com/App.dmg",
            sha256: "A".repeat(64),
          },
        },
      },
    ],
    [
      "non-https url",
      {
        forge: {
          artifact: { url: "http://example.com/App.dmg", sha256: VALID_SHA },
        },
      },
    ],
    ["missing url", { forge: { artifact: { sha256: VALID_SHA } } }],
    ["artifact is not an object", { forge: { artifact: "App.dmg" } }],
    ["forge is an array", { forge: [] }],
  ])("returns null for %s", (_label, pkg) => {
    // WHEN we parse a malformed / partial descriptor
    // THEN nothing is surfaced
    expect(parsePluginArtifact(pkg)).toBeNull();
  });

  test.each([
    ["null", null],
    ["a string", "not-a-package"],
    ["an array", []],
    ["a number", 42],
  ])("returns null when package.json is %s", (_label, value) => {
    // WHEN we parse a non-object package.json value
    // THEN nothing is surfaced
    expect(parsePluginArtifact(value)).toBeNull();
  });
});

describe("parsePluginIcon", () => {
  test("returns the emoji when forge.icon is a short glyph", () => {
    expect(parsePluginIcon({ forge: { icon: "🚀" } })).toBe("🚀");
  });

  test("trims surrounding whitespace", () => {
    expect(parsePluginIcon({ forge: { icon: "  🎯 " } })).toBe("🎯");
  });

  test("accepts a multi-code-point glyph within the bound", () => {
    // A ZWJ family emoji is several code points but well under the cap.
    const family = "👩‍👩‍👧‍👦";
    expect(parsePluginIcon({ forge: { icon: family } })).toBe(family);
  });

  test("accepts a value at exactly the 16-code-point bound", () => {
    const sixteen = "a".repeat(16);
    expect(parsePluginIcon({ forge: { icon: sixteen } })).toBe(sixteen);
  });

  test.each([
    ["no forge block", { name: "x" }],
    ["no icon field", { forge: {} }],
    ["icon is empty", { forge: { icon: "" } }],
    ["icon is whitespace-only", { forge: { icon: "   " } }],
    [
      "icon is too long (>16 code points)",
      { forge: { icon: "x".repeat(17) } },
    ],
    ["icon is a number", { forge: { icon: 42 } }],
    ["icon is an object", { forge: { icon: {} } }],
    ["forge is an array", { forge: [] }],
  ])("returns undefined for %s", (_label, pkg) => {
    expect(parsePluginIcon(pkg)).toBeUndefined();
  });

  test.each([
    ["null", null],
    ["a string", "not-a-package"],
    ["an array", []],
    ["a number", 42],
  ])("returns undefined when package.json is %s", (_label, value) => {
    expect(parsePluginIcon(value)).toBeUndefined();
  });

  test("does not count a >16-code-point emoji sequence as valid", () => {
    // 17 rocket emoji: 17 code points, over the cap.
    expect(
      parsePluginIcon({ forge: { icon: "🚀".repeat(17) } }),
    ).toBeUndefined();
  });
});
