import { expect, mock, test } from "bun:test";

import { BridgeCapabilityRegistry } from "@forgeai/electron-desktop/capability-registry";
import {
  FILE_OPEN_DRAIN,
  FILE_OPEN_EVENT,
  FILE_OPEN_SUBSCRIBE,
  FILE_OPEN_UNSUBSCRIBE,
  type ForgeBridge,
} from "@forgeai/ipc-contract";

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Listener>();
const invoke = mock(() => Promise.resolve(["C:\\例.forge"]));
const send = mock(() => undefined);
const off = mock(() => undefined);
const getPathForFile = mock(() => "C:\\Projects\\例.forge");

mock.module("electron", () => ({
  ipcRenderer: {
    invoke,
    send,
    on: (channel: string, listener: Listener) => {
      listeners.set(channel, listener);
    },
    off,
  },
  webUtils: { getPathForFile },
}));

const { default: pathsModule } = await import("./features/paths");
const registry = new BridgeCapabilityRegistry<ForgeBridge>({});
pathsModule.install(registry);
const bridge = registry.build();

test("resolves only native File paths and returns null when unavailable", () => {
  const file = new File(["bundle"], "例.forge");

  expect(bridge.paths?.getPathForFile(file)).toBe("C:\\Projects\\例.forge");
  getPathForFile.mockImplementationOnce(() => "");
  expect(bridge.paths?.getPathForFile(file)).toBeNull();
  getPathForFile.mockImplementationOnce(() => {
    throw new Error("not a native File");
  });
  expect(bridge.paths?.getPathForFile(file)).toBeNull();
});

test("drains and subscribes through the committed file-open bridge", async () => {
  expect(await bridge.fileOpen?.drain()).toEqual(["C:\\例.forge"]);
  expect(invoke).toHaveBeenCalledWith(FILE_OPEN_DRAIN);

  const received: string[] = [];
  const unsubscribe = bridge.fileOpen?.onFile((filePath) => {
    received.push(filePath);
  });
  listeners.get(FILE_OPEN_EVENT)?.({}, "C:\\live.forge");
  expect(received).toEqual(["C:\\live.forge"]);
  expect(send).toHaveBeenCalledWith(FILE_OPEN_SUBSCRIBE);

  unsubscribe?.();
  expect(send).toHaveBeenCalledWith(FILE_OPEN_UNSUBSCRIBE);
  expect(off).toHaveBeenCalledWith(
    FILE_OPEN_EVENT,
    listeners.get(FILE_OPEN_EVENT),
  );
});
