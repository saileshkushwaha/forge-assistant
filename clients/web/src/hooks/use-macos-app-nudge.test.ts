import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { openMacOsDownload } from "@/hooks/use-macos-app-nudge";
import { FORGE_DOWNLOADS_URL } from "@/utils/external-urls";

const originalWindowOpen = window.open;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  window.open = originalWindowOpen;
});

describe("macOS download link", () => {
  test("opens the canonical downloads page", () => {
    const open = mock(() => null);
    window.open = open as typeof window.open;

    openMacOsDownload();

    expect(open).toHaveBeenCalledWith(
      "https://www.forge.ai/downloads",
      "_blank",
      "noopener,noreferrer",
    );
    expect(FORGE_DOWNLOADS_URL).toBe("https://www.forge.ai/downloads");
  });
});
