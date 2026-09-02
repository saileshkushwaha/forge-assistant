import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import path from "node:path";

type Listener = (...args: unknown[]) => void;

const makeSender = (): {
  sender: { once: (event: string, handler: () => void) => void };
  fireDestroyed: () => void;
} => {
  let destroyedHandler: (() => void) | null = null;
  return {
    sender: {
      once: (event, handler) => {
        if (event === "destroyed") {
          destroyedHandler = handler;
        }
      },
    },
    fireDestroyed: () => destroyedHandler?.(),
  };
};

const subscribeWith = (s: ReturnType<typeof makeSender>) =>
  ipcOnListeners.get("forge:fileOpen:subscribe")?.({
    sender: s.sender,
    senderFrame: allowedSenderFrame,
  });
const unsubscribeWith = (s: ReturnType<typeof makeSender>) =>
  ipcOnListeners.get("forge:fileOpen:unsubscribe")?.({
    sender: s.sender,
    senderFrame: allowedSenderFrame,
  });

const appListeners = new Map<string, Listener>();
const appOnMock = mock((event: string, listener: Listener) => {
  appListeners.set(event, listener);
});
const ipcHandleMock = mock(
  (_channel: string, _handler: (...args: unknown[]) => unknown) => undefined,
);
const ipcOnListeners = new Map<string, Listener>();
const ipcOnMock = mock((event: string, listener: Listener) => {
  ipcOnListeners.set(event, listener);
});
let windows: Array<{
  isDestroyed: () => boolean;
  webContents: { send: ReturnType<typeof mock> };
}> = [];

let appIsReady = true;
mock.module("electron", () => ({
  app: {
    on: appOnMock,
    isReady: () => appIsReady,
  },
  ipcMain: { handle: ipcHandleMock, on: ipcOnMock },
  BrowserWindow: { getAllWindows: () => windows },
}));

const ensureMainWindowVisibleMock = mock(async () => undefined);

const { createIpcRegistrar } = await import("./ipc");
const { isAllowedOrigin } = await import("./app-origin");
const {
  __resetForTesting,
  configureFileOpen,
  extractForgeFilePathsFromArgv,
  handleFileOpen,
  installFileOpen,
  onFileOpen,
} = await import("./file-open");

const resolveAllowedOrigin = () => ({ protocol: "app:", host: "forge.ai" });
const { handle, on } = createIpcRegistrar(
  resolveAllowedOrigin,
  isAllowedOrigin,
);
configureFileOpen({
  ensureMainWindowVisible: ensureMainWindowVisibleMock,
  handle,
  on,
});

const { protocol: allowedProtocol, host: allowedHost } = resolveAllowedOrigin();
const allowedSenderFrame = { origin: `${allowedProtocol}//${allowedHost}` };
const makeAllowedEvent = () => {
  const { sender, fireDestroyed } = makeSender();
  return {
    event: { senderFrame: allowedSenderFrame, sender },
    fireDestroyed,
  };
};
const allowedEvent = makeAllowedEvent().event;

const makeWindow = (destroyed = false) => ({
  isDestroyed: () => destroyed,
  webContents: { send: mock(() => undefined) },
});

beforeEach(() => {
  __resetForTesting();
  appListeners.clear();
  ipcOnListeners.clear();
  appOnMock.mockClear();
  ipcHandleMock.mockClear();
  ipcOnMock.mockClear();
  ensureMainWindowVisibleMock.mockClear();
  windows = [];
  appIsReady = true;
});

afterEach(() => {
  windows = [];
});

describe("extractForgeFilePathsFromArgv", () => {
  test("canonicalizes Unicode paths and removes duplicate argv entries", () => {
    const relativePath = "exports/例.forge";

    expect(
      extractForgeFilePathsFromArgv([
        "Forge.exe",
        relativePath,
        path.resolve(relativePath),
      ]),
    ).toEqual([path.resolve(relativePath)]);
  });

  test("ignores missing paths and invalid extensions", () => {
    expect(
      extractForgeFilePathsFromArgv([
        "",
        "--open",
        "notes.txt",
        "archive.forge.bak",
      ]),
    ).toEqual([]);
  });

  test("resolves relative paths from the launching working directory", () => {
    expect(
      extractForgeFilePathsFromArgv(
        ["Forge.exe", "exports/example.forge"],
        "/launching-directory",
      ),
    ).toEqual(["/launching-directory/exports/example.forge"]);
  });
});

describe("handleFileOpen", () => {
  test(".forge files are buffered when no subscribers exist", () => {
    installFileOpen();

    handleFileOpen("/tmp/example.forge");

    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];
    expect(drainHandler(allowedEvent)).toEqual(["/tmp/example.forge"]);
  });

  test("non-.forge files are silently ignored", () => {
    installFileOpen();

    handleFileOpen("/tmp/example.txt");
    handleFileOpen("/tmp/example.forge.bak");
    handleFileOpen("/tmp/readme.md");

    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];
    expect(drainHandler(allowedEvent)).toEqual([]);
  });

  test(".FORGE extension is accepted (case-insensitive)", () => {
    installFileOpen();

    handleFileOpen("/tmp/example.FORGE");

    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];
    expect(drainHandler(allowedEvent)).toEqual(["/tmp/example.FORGE"]);
  });

  test("calls ensureMainWindowVisible when app is ready", () => {
    handleFileOpen("/tmp/example.forge");
    expect(ensureMainWindowVisibleMock).toHaveBeenCalledTimes(1);
  });

  test("defers activation when app is not yet ready", () => {
    appIsReady = false;
    handleFileOpen("/tmp/example.forge");
    expect(ensureMainWindowVisibleMock).not.toHaveBeenCalled();
  });
});

describe("drain", () => {
  test("returns buffered paths and clears buffer", () => {
    installFileOpen();

    handleFileOpen("/tmp/a.forge");
    handleFileOpen("/tmp/b.forge");

    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];

    expect(drainHandler(allowedEvent)).toEqual([
      "/tmp/a.forge",
      "/tmp/b.forge",
    ]);
    // Second drain returns empty.
    expect(drainHandler(allowedEvent)).toEqual([]);
  });

  test("drain adds the sender to subscribers", () => {
    installFileOpen();

    handleFileOpen("/tmp/backlog.forge");

    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];
    drainHandler(allowedEvent);

    // With a subscriber, the next file should NOT enter the buffer.
    handleFileOpen("/tmp/live.forge");
    expect(drainHandler(allowedEvent)).toEqual([]);
  });
});

describe("broadcast", () => {
  test("fires event to all non-destroyed windows", () => {
    const w1 = makeWindow();
    const w2 = makeWindow();
    windows = [w1, w2];

    handleFileOpen("/tmp/example.forge");

    expect(w1.webContents.send).toHaveBeenCalledWith(
      "forge:fileOpen:event",
      "/tmp/example.forge",
    );
    expect(w2.webContents.send).toHaveBeenCalledWith(
      "forge:fileOpen:event",
      "/tmp/example.forge",
    );
  });

  test("skips destroyed windows", () => {
    const alive = makeWindow();
    const dead = makeWindow(true);
    windows = [alive, dead];

    handleFileOpen("/tmp/example.forge");

    expect(alive.webContents.send).toHaveBeenCalled();
    expect(dead.webContents.send).not.toHaveBeenCalled();
  });
});

describe("subscriber lifecycle", () => {
  test("with a subscriber present, live files broadcast but do NOT enter the buffer", () => {
    installFileOpen();
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];

    handleFileOpen("/tmp/backlog.forge");

    const s1 = makeSender();
    subscribeWith(s1);
    expect(drainHandler(allowedEvent)).toEqual(["/tmp/backlog.forge"]);

    handleFileOpen("/tmp/live.forge");

    unsubscribeWith(s1);
    const s2 = makeSender();
    subscribeWith(s2);
    expect(drainHandler(allowedEvent)).toEqual([]);
  });

  test("file arriving while unsubscribed lands in the buffer for the next subscriber", () => {
    installFileOpen();
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];

    // Drain with a fresh event (also subscribes the drain sender).
    const d1 = makeAllowedEvent();
    expect(drainHandler(d1.event)).toEqual([]);

    // Simulate the drain sender going away so subscribers empties.
    d1.fireDestroyed();
    handleFileOpen("/tmp/post-logout.forge");

    // New drain picks up the buffered path.
    expect(drainHandler(makeAllowedEvent().event)).toEqual([
      "/tmp/post-logout.forge",
    ]);
  });

  test("destroyed webContents auto-clears its subscription", () => {
    installFileOpen();
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];

    // Drain subscribes its sender; verify the buffer is empty.
    const d = makeAllowedEvent();
    expect(drainHandler(d.event)).toEqual([]);

    // Simulate the drain sender being destroyed (auto-clears).
    d.fireDestroyed();

    handleFileOpen("/tmp/after-crash.forge");
    expect(drainHandler(makeAllowedEvent().event)).toEqual([
      "/tmp/after-crash.forge",
    ]);
  });
});

describe("installFileOpen", () => {
  test("is idempotent", () => {
    installFileOpen();
    installFileOpen();
    installFileOpen();

    // will-finish-launching registered only once.
    const wflCalls = appOnMock.mock.calls.filter(
      (c) => c[0] === "will-finish-launching",
    );
    expect(wflCalls.length).toBe(1);
  });

  test("subscribes to will-finish-launching and registers an open-file listener under it", () => {
    installFileOpen();
    const wfl = appListeners.get("will-finish-launching");
    expect(wfl).toBeDefined();

    wfl?.();
    expect(appListeners.has("open-file")).toBe(true);
  });

  test("open-file calls preventDefault on the event and routes through handleFileOpen", () => {
    installFileOpen();
    appListeners.get("will-finish-launching")?.();
    const openFile = appListeners.get("open-file");
    expect(openFile).toBeDefined();

    const preventDefault = mock(() => undefined);
    openFile?.({ preventDefault } as unknown, "/tmp/example.forge");

    expect(preventDefault).toHaveBeenCalled();
  });
});

describe("onFileOpen", () => {
  test("replays buffered paths to a newly registered callback", () => {
    handleFileOpen("/tmp/cold-launch.forge");
    handleFileOpen("/tmp/cold-launch-2.forge");

    const received: string[] = [];
    onFileOpen((p) => received.push(p));

    expect(received).toEqual([
      "/tmp/cold-launch.forge",
      "/tmp/cold-launch-2.forge",
    ]);
  });

  test("does not replay paths that were already drained", () => {
    installFileOpen();

    handleFileOpen("/tmp/early.forge");

    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:fileOpen:drain",
    )![1] as (event: unknown) => unknown[];
    drainHandler(allowedEvent);

    const received: string[] = [];
    onFileOpen((p) => received.push(p));

    expect(received).toEqual([]);
  });

  test("receives live file-open events after registration", () => {
    const received: string[] = [];
    onFileOpen((p) => received.push(p));

    handleFileOpen("/tmp/live.forge");

    expect(received).toEqual(["/tmp/live.forge"]);
  });

  test("unsubscribe stops receiving events", () => {
    const received: string[] = [];
    const unsub = onFileOpen((p) => received.push(p));

    unsub();
    handleFileOpen("/tmp/after-unsub.forge");

    expect(received).toEqual([]);
  });
});
