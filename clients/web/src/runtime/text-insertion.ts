import type { TextInsertionResult as BridgeTextInsertionResult } from "@forgeai/ipc-contract";

import { isElectron } from "@/runtime/is-electron";
import { openSystemPermissionSettings } from "@/runtime/system-permissions";

export type TextInsertionResult =
  BridgeTextInsertionResult | { status: "unavailable" };

export async function insertTextIntoFrontApp(
  text: string,
): Promise<TextInsertionResult> {
  if (!isElectron() || !window.forge?.text?.insertIntoFrontApp) {
    return { status: "unavailable" };
  }

  try {
    return await window.forge.text.insertIntoFrontApp(text);
  } catch (err) {
    console.warn("insertTextIntoFrontApp failed", err);
    return { status: "blocked" };
  }
}

export async function openTextInsertionSettings(): Promise<void> {
  try {
    if (await openSystemPermissionSettings("automation")) {
      return;
    }
  } catch {
    // Fall through to the legacy bridge below.
  }
  if (!isElectron() || !window.forge?.text?.openAutomationSettings) {
    return;
  }
  try {
    await window.forge.text.openAutomationSettings();
  } catch (err) {
    console.warn("openTextInsertionSettings failed", err);
  }
}
