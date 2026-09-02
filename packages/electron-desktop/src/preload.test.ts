import { expect, mock, test } from "bun:test";
import type { IpcRenderer } from "electron";

import type { DownloadDoneEvent } from "@forgeai/ipc-contract";

import { createBundleConfirmBridge, createDownloadsBridge } from "./preload";

test("creates the bundle confirmation IPC bridge", async () => {
  const invoke = mock(() => Promise.resolve(null));
  const send = mock(() => undefined);
  const ipc = {
    invoke,
    send,
    on: mock(() => undefined),
    off: mock(() => undefined),
  } as unknown as Pick<IpcRenderer, "invoke" | "off" | "on" | "send">;
  const bridge = createBundleConfirmBridge(ipc);

  await bridge.getData();
  bridge.respond(true);

  expect(invoke).toHaveBeenCalledWith("forge:bundleConfirm:getData");
  expect(send).toHaveBeenCalledWith("forge:bundleConfirm:respond", true);
});

test("creates the downloads IPC bridge", async () => {
  type DoneHandler = (event: unknown, payload: DownloadDoneEvent) => void;
  let handler: DoneHandler | null = null;
  const invoke = mock(() => Promise.resolve());
  const on = mock((_channel: string, h: DoneHandler) => {
    handler = h;
  });
  const off = mock(() => undefined);
  const ipc = {
    invoke,
    send: mock(() => undefined),
    on,
    off,
  } as unknown as Pick<IpcRenderer, "invoke" | "off" | "on" | "send">;
  const bridge = createDownloadsBridge(ipc);

  const received: DownloadDoneEvent[] = [];
  const unsubscribe = bridge.onDone((event) => received.push(event));
  await bridge.reveal("dl-1");

  expect(invoke).toHaveBeenCalledWith("forge:downloads:reveal", "dl-1");
  expect(on).toHaveBeenCalledWith(
    "forge:downloads:done",
    expect.any(Function),
  );
  handler!({}, { id: "dl-1", filename: "report.pdf", state: "completed" });
  expect(received).toEqual([
    { id: "dl-1", filename: "report.pdf", state: "completed" },
  ]);

  unsubscribe();
  expect(off).toHaveBeenCalledWith("forge:downloads:done", handler);
});
