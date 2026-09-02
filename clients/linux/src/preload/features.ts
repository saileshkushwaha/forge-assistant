import {
  BridgeCapabilityRegistry,
  installCapabilityModules,
  type CapabilityModuleExport,
} from "@forgeai/electron-desktop/capability-registry";
import type { ForgeBridge } from "@forgeai/ipc-contract";

const modules = import.meta.glob<
  CapabilityModuleExport<BridgeCapabilityRegistry<ForgeBridge>>
>("./features/*.ts", { eager: true });

export const composePreloadFeatures = (
  base: Partial<ForgeBridge>,
): Partial<ForgeBridge> => {
  const registry = new BridgeCapabilityRegistry<ForgeBridge>(base);
  installCapabilityModules(registry, modules);
  return registry.build();
};
