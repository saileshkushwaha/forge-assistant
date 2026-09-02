/**
 * Runtime wrapper for the standalone Electron command palette window.
 *
 * New Electron shells expose `window.forge.commandPalette`; web/iOS and
 * older Electron shells do not. `openCommandPaletteWindow` returns whether
 * the host handled the request so callers can fall back to the in-page
 * palette without probing `window.forge` themselves.
 */

import { isElectron, type ForgeCommand } from "@/runtime/is-electron";

export async function openCommandPaletteWindow(): Promise<boolean> {
  if (!isElectron()) {
    return false;
  }
  const open = window.forge?.commandPalette?.open;
  if (!open) {
    return false;
  }
  await open();
  return true;
}

export async function dismissCommandPaletteWindow(): Promise<void> {
  if (!isElectron()) {
    return;
  }
  await window.forge?.commandPalette?.dismiss();
}

export async function selectCommandPaletteCommand(
  command: ForgeCommand,
): Promise<void> {
  if (!isElectron()) {
    return;
  }
  await window.forge?.commandPalette?.select(command);
}
