import type { IpcRenderer } from "electron";

import type { ForgeBridge } from "@forgeai/ipc-contract";

type RendererIpc = Pick<IpcRenderer, "invoke">;

export const createLocalModeBridge = (
  ipc: RendererIpc,
): ForgeBridge["localMode"] => ({
  guardianToken: (assistantId) =>
    ipc.invoke("forge:localMode:guardianToken", assistantId),
  hatch: (species, remote) =>
    ipc.invoke("forge:localMode:hatch", species, remote),
  listDevices: (assistantId) =>
    ipc.invoke("forge:localMode:listDevices", assistantId),
  pairingCancel: (handle) =>
    ipc.invoke("forge:localMode:pairingCancel", handle),
  pairingPoll: (handle, name) =>
    ipc.invoke("forge:localMode:pairingPoll", handle, name),
  pairingStart: (address) =>
    ipc.invoke("forge:localMode:pairingStart", address),
  readAssistantAvatar: (assistantId) =>
    ipc.invoke("forge:localMode:readAssistantAvatar", assistantId),
  readLockfile: () => ipc.invoke("forge:localMode:readLockfile"),
  renameLockfileAssistant: (assistantId, name) =>
    ipc.invoke("forge:localMode:renameLockfileAssistant", assistantId, name),
  stampLockfileAssistantOnboarded: (assistantId, onboardedAt) =>
    ipc.invoke(
      "forge:localMode:stampLockfileAssistantOnboarded",
      assistantId,
      onboardedAt,
    ),
  replacePlatformAssistants: (assistants, organizationId) =>
    ipc.invoke(
      "forge:localMode:replacePlatformAssistants",
      assistants,
      organizationId,
    ),
  retire: (assistantId) => ipc.invoke("forge:localMode:retire", assistantId),
  revokeDevice: (assistantId, hashedDeviceId) =>
    ipc.invoke("forge:localMode:revokeDevice", assistantId, hashedDeviceId),
  saveLockfileAssistant: (assistant, activeAssistant) =>
    ipc.invoke(
      "forge:localMode:saveLockfileAssistant",
      assistant,
      activeAssistant,
    ),
  sleep: (assistantId) => ipc.invoke("forge:localMode:sleep", assistantId),
  status: (assistantId) => ipc.invoke("forge:localMode:status", assistantId),
  unpair: (assistantId) => ipc.invoke("forge:localMode:unpair", assistantId),
  upgrade: (assistantId, options) =>
    ipc.invoke("forge:localMode:upgrade", assistantId, options),
  wake: (assistantId, options) =>
    ipc.invoke("forge:localMode:wake", assistantId, options),
});
