import { resolve } from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

// Capture the `will-finish-launching` and `open-url` subscriptions
// from `app.on` so tests can fire them. `setAsDefaultProtocolClient`
// is also captured to verify scheme registration.
type Listener = (...args: unknown[]) => void;

// Synthetic WebContents stub for the subscriber-tracking tests.
// `once("destroyed", …)` captures the cleanup handler so tests can
// fire it to simulate a renderer crash / window close.
const makeSender = (): {
  sender: { once: (event: string, handler: () => void) => void };
  fireDestroyed: () => void;
} => {
  let destroyedHandler: (() => void) | null = null;
  return {
    sender: {
      once: (event, handler) => {
        if (event === "destroyed") destroyedHandler = handler;
      },
    },
    fireDestroyed: () => destroyedHandler?.(),
  };
};
const subscribeWith = (s: ReturnType<typeof makeSender>) =>
  ipcOnListeners.get("forge:deepLinks:subscribe")?.({ sender: s.sender });
const unsubscribeWith = (s: ReturnType<typeof makeSender>) =>
  ipcOnListeners.get("forge:deepLinks:unsubscribe")?.({ sender: s.sender });
const appListeners = new Map<string, Listener>();
const appOnMock = mock((event: string, listener: Listener) => {
  appListeners.set(event, listener);
});
const setAsDefaultProtocolClientMock = mock(
  (_scheme: string, _path?: string, _args?: string[]) => true,
);
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
let appIsPackaged = false;
mock.module("electron", () => ({
  app: {
    on: appOnMock,
    setAsDefaultProtocolClient: setAsDefaultProtocolClientMock,
    isReady: () => appIsReady,
    get isPackaged() {
      return appIsPackaged;
    },
  },
  ipcMain: { handle: ipcHandleMock, on: ipcOnMock },
  BrowserWindow: { getAllWindows: () => windows },
}));

const ensureMainWindowVisibleMock = mock(async () => undefined);

const {
  __resetForTesting,
  configureDeepLinks,
  extractDeepLinkFromArgv,
  handleDeepLink,
  installDeepLinks,
  parseForgeUrl,
  resolveAcceptedSchemes,
  resolveAuthCallbackScheme,
  resolveRegisteredSchemes,
} = await import("./deep-links");
const { resolveEnvironmentName } = await import("@forgeai/local-mode");

const allowedEvent = {};

const makeWindow = (destroyed = false) => ({
  isDestroyed: () => destroyed,
  webContents: { send: mock(() => undefined) },
});

const configureTestRuntime = (initialArgv: readonly string[] = []): void => {
  configureDeepLinks({
    ensureVisible: ensureMainWindowVisibleMock,
    handle: (channel, schema, fn) => {
      ipcHandleMock(channel, (event, ...args) =>
        fn(schema.parse(args), event as never),
      );
    },
    initialArgv,
    on: (channel, schema, fn) => {
      ipcOnListeners.set(channel, (event, ...args) => {
        const parsed = schema.safeParse(args);
        if (parsed.success) {
          fn(parsed.data, event as never);
        }
      });
    },
  });
};

beforeEach(() => {
  __resetForTesting();
  appListeners.clear();
  ipcOnListeners.clear();
  appOnMock.mockClear();
  setAsDefaultProtocolClientMock.mockClear();
  ipcHandleMock.mockClear();
  ipcOnMock.mockClear();
  ensureMainWindowVisibleMock.mockClear();
  windows = [];
  appIsReady = true;
  appIsPackaged = false;
  configureTestRuntime();
});

afterEach(() => {
  windows = [];
});

describe("parseForgeUrl", () => {
  test("forge://send?message=hi → send with the message", () => {
    expect(parseForgeUrl("forge://send?message=hi")).toEqual({
      kind: "send",
      message: "hi",
    });
  });

  test("forge-assistant://send?message=hi → same shape under the alternate scheme", () => {
    expect(parseForgeUrl("forge-assistant://send?message=hi")).toEqual({
      kind: "send",
      message: "hi",
    });
  });

  test("forge://send → empty message (preserved, renderer decides)", () => {
    expect(parseForgeUrl("forge://send")).toEqual({
      kind: "send",
      message: "",
    });
  });

  test("forge://send decodes percent-encoded query parameters", () => {
    expect(parseForgeUrl("forge://send?message=hello%20world")).toEqual({
      kind: "send",
      message: "hello world",
    });
  });

  test("forge://thread/abc-123 → openThread with the id", () => {
    expect(parseForgeUrl("forge://thread/abc-123")).toEqual({
      kind: "openThread",
      threadId: "abc-123",
    });
  });

  test("forge://thread/abc-123/extra → openThread on first segment, extras ignored", () => {
    expect(parseForgeUrl("forge://thread/abc-123/extra")).toEqual({
      kind: "openThread",
      threadId: "abc-123",
    });
  });

  test("forge://thread → unknown (no id)", () => {
    expect(parseForgeUrl("forge://thread")).toEqual({
      kind: "unknown",
      url: "forge://thread",
    });
  });

  test("forge://billing/checkout-complete?status=success&session_id=… → billingCheckoutComplete", () => {
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?status=success&session_id=cs_test_a1B2",
      ),
    ).toEqual({
      kind: "billingCheckoutComplete",
      status: "success",
      sessionId: "cs_test_a1B2",
      flow: "subscription",
    });
  });

  test("checkout-complete under the alternate scheme parses the same", () => {
    expect(
      parseForgeUrl(
        "forge-assistant://billing/checkout-complete?status=success&session_id=cs_live_XYZ",
      ),
    ).toEqual({
      kind: "billingCheckoutComplete",
      status: "success",
      sessionId: "cs_live_XYZ",
      flow: "subscription",
    });
  });

  test("status=cancel → cancel with no session id", () => {
    expect(
      parseForgeUrl("forge://billing/checkout-complete?status=cancel"),
    ).toEqual({
      kind: "billingCheckoutComplete",
      status: "cancel",
      sessionId: null,
      flow: "subscription",
    });
  });

  test("status=cancel ignores any session id that rides along", () => {
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?status=cancel&session_id=cs_test_a1B2",
      ),
    ).toEqual({
      kind: "billingCheckoutComplete",
      status: "cancel",
      sessionId: null,
      flow: "subscription",
    });
  });

  test("flow=top_up is carried through on both statuses", () => {
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?status=success&session_id=cs_test_a1B2&flow=top_up",
      ),
    ).toEqual({
      kind: "billingCheckoutComplete",
      status: "success",
      sessionId: "cs_test_a1B2",
      flow: "top_up",
    });
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?status=cancel&flow=top_up",
      ),
    ).toEqual({
      kind: "billingCheckoutComplete",
      status: "cancel",
      sessionId: null,
      flow: "top_up",
    });
  });

  test("an unrecognized flow value degrades to the subscription flow", () => {
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?status=cancel&flow=bogus",
      ),
    ).toEqual({
      kind: "billingCheckoutComplete",
      status: "cancel",
      sessionId: null,
      flow: "subscription",
    });
  });

  test("success without a session id → unknown (never a success state with nothing to open)", () => {
    expect(
      parseForgeUrl("forge://billing/checkout-complete?status=success"),
    ).toEqual({
      kind: "unknown",
      url: "forge://billing/checkout-complete",
    });
  });

  test("success with a malformed session id → unknown, query stripped", () => {
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?status=success&session_id=../../etc/passwd",
      ),
    ).toEqual({
      kind: "unknown",
      url: "forge://billing/checkout-complete",
    });
  });

  test("missing / unrecognized status → unknown, query stripped (no session-id leak)", () => {
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?session_id=cs_test_a1B2",
      ),
    ).toEqual({ kind: "unknown", url: "forge://billing/checkout-complete" });
    expect(
      parseForgeUrl(
        "forge://billing/checkout-complete?status=bogus&session_id=cs_test_a1B2",
      ),
    ).toEqual({ kind: "unknown", url: "forge://billing/checkout-complete" });
  });

  test("unrecognized billing path → unknown, query stripped", () => {
    expect(
      parseForgeUrl("forge://billing/other?session_id=cs_test_a1B2"),
    ).toEqual({ kind: "unknown", url: "forge://billing/other" });
    expect(parseForgeUrl("forge://billing")).toEqual({
      kind: "unknown",
      url: "forge://billing",
    });
  });

  test("rejects foreign schemes — javascript: returns unknown", () => {
    expect(parseForgeUrl("javascript:alert(1)")).toEqual({
      kind: "unknown",
      url: "javascript:alert(1)",
    });
  });

  test("rejects file: scheme", () => {
    expect(parseForgeUrl("file:///etc/passwd")).toEqual({
      kind: "unknown",
      url: "file:///etc/passwd",
    });
  });

  test("rejects http: scheme", () => {
    expect(parseForgeUrl("http://forge.ai/send")).toEqual({
      kind: "unknown",
      url: "http://forge.ai/send",
    });
  });

  test("malformed input → unknown (catches URL constructor throws)", () => {
    expect(parseForgeUrl("not a url at all")).toEqual({
      kind: "unknown",
      url: "not a url at all",
    });
  });

  test("unrecognized forge://… host → unknown", () => {
    expect(parseForgeUrl("forge://garbage")).toEqual({
      kind: "unknown",
      url: "forge://garbage",
    });
  });

  test("legacy auth/callback → unknown with query stripped (no code leak)", () => {
    // The legacy code must not survive into the URL the renderer logs as
    // a `deeplink.unknown` Sentry breadcrumb.
    expect(
      parseForgeUrl("forge://auth/callback?code=secret&state=xyz"),
    ).toEqual({ kind: "unknown", url: "forge://auth/callback" });
    expect(
      parseForgeUrl("forge-assistant://auth/callback?code=secret"),
    ).toEqual({ kind: "unknown", url: "forge-assistant://auth/callback" });
  });

  test("forge-assistant://connect?url=…&code=… → connect carrying the base and the device code", () => {
    expect(
      parseForgeUrl(
        "forge-assistant://connect?url=https%3A%2F%2Fassistant.example.com%2Fassistant-1&code=ABCD-1234",
      ),
    ).toEqual({
      kind: "connect",
      url: "https://assistant.example.com/assistant-1",
      code: "ABCD-1234",
    });
  });

  test("connect carries an opaque code, not just base64url", () => {
    // `buildAppConnectUrl` emits whatever the gateway minted, and its own test
    // pins `a+b/c=` surviving the encoding. Refusing it here would silently
    // drop an approved code and drop the user into a fresh approval flow.
    expect(
      parseForgeUrl(
        "forge://connect?url=https%3A%2F%2Fh.example&code=a%2Bb%2Fc%3D",
      ),
    ).toEqual({ kind: "connect", url: "https://h.example", code: "a+b/c=" });
  });

  test("connect drops a code that cannot have come from a gateway", () => {
    expect(
      parseForgeUrl(
        "forge://connect?url=https%3A%2F%2Fh.example&code=has%20a%20space",
      ),
    ).toEqual({ kind: "connect", url: "https://h.example" });
    expect(
      parseForgeUrl(
        "forge://connect?url=https%3A%2F%2Fh.example&code=%00control",
      ),
    ).toEqual({ kind: "connect", url: "https://h.example" });
    expect(
      parseForgeUrl(
        `forge://connect?url=https%3A%2F%2Fh.example&code=${"a".repeat(257)}`,
      ),
    ).toEqual({ kind: "connect", url: "https://h.example" });
  });

  test("connect drops a code with no base to exchange it against", () => {
    // Nothing can be done with a device code alone, so it is not carried
    // across the bridge just to be discarded there.
    expect(parseForgeUrl("forge://connect?code=ABCD-1234")).toEqual({
      kind: "connect",
    });
    expect(
      parseForgeUrl("forge://connect?url=http%3A%2F%2Fevil.example&code=SEC"),
    ).toEqual({ kind: "connect" });
  });

  test("forge://connect?bundle=… → the legacy signal, never the payload", () => {
    const link = parseForgeUrl("forge://connect?bundle=eyJnYXRld2F5");
    expect(link).toEqual({ kind: "connect", legacy: true });
    expect(JSON.stringify(link)).not.toContain("eyJnYXRld2F5");
  });

  test("a bundle rides alongside a usable base without displacing it", () => {
    expect(
      parseForgeUrl(
        "forge://connect?url=https%3A%2F%2Fh.example&code=ABCD&bundle=eyJnYXRld2F5",
      ),
    ).toEqual({
      kind: "connect",
      url: "https://h.example",
      code: "ABCD",
      legacy: true,
    });
  });

  test("connect drops a non-https url param but keeps the rest of the link", () => {
    expect(
      parseForgeUrl(
        "forge://connect?url=http%3A%2F%2Fevil.example&bundle=eyJnYXRld2F5",
      ),
    ).toEqual({ kind: "connect", legacy: true });
  });

  test("connect drops an unparseable url param", () => {
    expect(
      parseForgeUrl("forge://connect?url=not%20a%20url&bundle=eyJnYXRld2F5"),
    ).toEqual({ kind: "connect", legacy: true });
  });

  test("a bare connect link still parses as connect, never unknown", () => {
    // The user clicked a connect link; even with every field missing or
    // malformed the renderer routes them to the connect flow with guidance
    // instead of Sentry-breadcrumbing an unknown URL.
    expect(parseForgeUrl("forge://connect")).toEqual({ kind: "connect" });
    expect(parseForgeUrl("forge://connect?url=&code=&bundle=")).toEqual({
      kind: "connect",
    });
  });

  test("connect secrets never surface in console output from the module", () => {
    // The parser carries `code` on the typed link only and drops the bundle
    // payload entirely. This guards the auth/callback precedent: nothing the
    // module does with a connect URL may write the raw URL's credential
    // material to a log stream.
    const consoleSpies = (
      ["log", "warn", "error", "info", "debug"] as const
    ).map((method) => spyOn(console, method));
    try {
      handleDeepLink(
        "forge://connect?url=https%3A%2F%2Fh.example&code=SECRET-CODE&bundle=U0VDUkVUYnVuZGxl",
      );
      for (const spy of consoleSpies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain("SECRET");
          expect(JSON.stringify(call)).not.toContain("U0VDUkVU");
        }
      }
    } finally {
      for (const spy of consoleSpies) {
        spy.mockRestore();
      }
    }
  });

  test("a connect link never reaches the unknown echo path, however malformed", () => {
    // `unknown` carries its URL through to the renderer's Sentry breadcrumb,
    // so a device code must never be able to route there. Every connect link
    // stays a connect link, malformed fields and all.
    for (const input of [
      "forge://connect?url=https%3A%2F%2Fh.example&code=SECRET-CODE",
      "forge://connect?url=nonsense&code=SECRET-CODE",
      "forge://connect?code=SECRET-CODE",
      "forge://connect/extra/path?code=SECRET-CODE",
    ]) {
      const link = parseForgeUrl(input);
      expect(link.kind).toBe("connect");
      expect(JSON.stringify(link)).not.toContain("nonsense");
    }
  });

  test("env-specific scheme for a foreign environment is rejected as unknown", () => {
    // A scheme that doesn't match any known environment is always
    // rejected, regardless of which env this test suite runs under.
    const url =
      "forge-assistant-nonexistent://auth/callback?code=abc&state=xyz";
    expect(parseForgeUrl(url)).toEqual({ kind: "unknown", url });
  });
});

describe("extractDeepLinkFromArgv", () => {
  test("returns the first forge:// URL in argv", () => {
    const argv = [
      "/usr/local/bin/electron",
      "--inspect=9229",
      "forge://send?message=hi",
      "--unrelated",
    ];
    expect(extractDeepLinkFromArgv(argv)).toBe("forge://send?message=hi");
  });

  test("matches the alternate scheme too", () => {
    expect(extractDeepLinkFromArgv(["forge-assistant://thread/x"])).toBe(
      "forge-assistant://thread/x",
    );
  });

  test("returns null when no deep-link arg is present", () => {
    expect(
      extractDeepLinkFromArgv(["/usr/local/bin/electron", "--foo"]),
    ).toBeNull();
  });

  test.each([
    "forge://send?message=hello",
    "forge://thread/thread-123",
    "forge://billing/checkout-complete?status=cancel",
  ])("extracts supported Windows launch URL %s", (url) => {
    expect(extractDeepLinkFromArgv(["Forge.exe", url])).toBe(url);
  });
});

describe("installDeepLinks", () => {
  test("delivers a cold-start argv link exactly once", () => {
    configureTestRuntime(["Forge.exe", "forge://send?message=cold"]);
    installDeepLinks();

    const drain = ipcHandleMock.mock.calls.find(
      (call) => call[0] === "forge:deepLinks:drain",
    )?.[1] as (event: unknown) => unknown[];
    expect(drain(allowedEvent)).toEqual([{ kind: "send", message: "cold" }]);
    expect(drain(allowedEvent)).toEqual([]);
  });

  test("delivers a second-instance argv link exactly once", () => {
    installDeepLinks();
    appListeners.get("second-instance")?.({}, [
      "Forge.exe",
      "forge://thread/warm",
      "forge://thread/ignored",
    ]);

    const drain = ipcHandleMock.mock.calls.find(
      (call) => call[0] === "forge:deepLinks:drain",
    )?.[1] as (event: unknown) => unknown[];
    expect(drain(allowedEvent)).toEqual([
      { kind: "openThread", threadId: "warm" },
    ]);
    expect(drain(allowedEvent)).toEqual([]);
  });

  test("registers unpackaged apps with absolute executable and entry paths", () => {
    const entryPoint = process.argv[1];
    const platform = process.platform;
    const expected = resolveRegisteredSchemes(
      resolveEnvironmentName(process.env),
    );
    process.argv[1] = ".";
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      installDeepLinks();
      const firstCallCount = setAsDefaultProtocolClientMock.mock.calls.length;

      installDeepLinks();
      installDeepLinks();

      expect(setAsDefaultProtocolClientMock.mock.calls).toEqual(
        expected.map((scheme) => [scheme, process.execPath, [resolve(".")]]),
      );
      // Idempotent — repeated calls don't register again.
      expect(setAsDefaultProtocolClientMock).toHaveBeenCalledTimes(
        firstCallCount,
      );
    } finally {
      process.argv[1] = entryPoint;
      Object.defineProperty(process, "platform", { value: platform });
    }
  });

  test("keeps unpackaged non-Windows protocol registration unchanged", () => {
    installDeepLinks();

    const expected = resolveRegisteredSchemes(
      resolveEnvironmentName(process.env),
    );
    expect(setAsDefaultProtocolClientMock.mock.calls).toEqual(
      expected.map((scheme) => [scheme]),
    );
  });

  test("subscribes to will-finish-launching and registers an open-url listener under it", () => {
    installDeepLinks();
    const wfl = appListeners.get("will-finish-launching");
    expect(wfl).toBeDefined();

    wfl?.();
    expect(appListeners.has("open-url")).toBe(true);
  });

  test("open-url calls preventDefault on the event and buffers the parsed link", () => {
    installDeepLinks();
    appListeners.get("will-finish-launching")?.();
    const openUrl = appListeners.get("open-url");
    expect(openUrl).toBeDefined();

    const preventDefault = mock(() => undefined);
    openUrl?.({ preventDefault } as unknown, "forge://send?message=hi");

    expect(preventDefault).toHaveBeenCalled();
  });

  test("registers the forge:deepLinks:drain IPC handler returning + clearing the buffer", () => {
    installDeepLinks();

    handleDeepLink("forge://send?message=one");
    handleDeepLink("forge://thread/abc");

    // Find the registered handler.
    const drainCall = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:deepLinks:drain",
    );
    expect(drainCall).toBeDefined();
    const drainHandler = drainCall![1] as (event: unknown) => unknown;

    expect(drainHandler(allowedEvent)).toEqual([
      { kind: "send", message: "one" },
      { kind: "openThread", threadId: "abc" },
    ]);
    // Second drain returns empty — buffer was cleared.
    expect(drainHandler(allowedEvent)).toEqual([]);
  });

  test("with a subscriber present, live links broadcast but do NOT enter the buffer (no replay on renderer reload)", () => {
    installDeepLinks();
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:deepLinks:drain",
    )![1] as (event: unknown) => unknown[];

    // Backlog before any subscriber.
    handleDeepLink("forge://send?message=backlog");

    // Renderer mounts: subscribes, drains.
    const s1 = makeSender();
    subscribeWith(s1);
    expect(drainHandler(allowedEvent)).toEqual([
      { kind: "send", message: "backlog" },
    ]);

    // Live link arrives while subscribed — broadcasts only.
    handleDeepLink("forge://thread/live");

    // Renderer hard-navigates: unsubscribe, then a new renderer
    // mounts and drains. The live link must NOT be replayed.
    unsubscribeWith(s1);
    const s2 = makeSender();
    subscribeWith(s2);
    expect(drainHandler(allowedEvent)).toEqual([]);
  });

  test("logout-relogin: link arriving while unsubscribed lands in the buffer for the next subscriber", () => {
    installDeepLinks();
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:deepLinks:drain",
    )![1] as (event: unknown) => unknown[];

    const s1 = makeSender();
    subscribeWith(s1);
    expect(drainHandler(allowedEvent)).toEqual([]);

    unsubscribeWith(s1);

    handleDeepLink("forge://thread/post-logout");

    const s2 = makeSender();
    subscribeWith(s2);
    expect(drainHandler(allowedEvent)).toEqual([
      { kind: "openThread", threadId: "post-logout" },
    ]);
  });

  test("unsubscribe with no matching subscriber is a no-op (idempotent delete)", () => {
    installDeepLinks();
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:deepLinks:drain",
    )![1] as (event: unknown) => unknown[];

    const s = makeSender();
    unsubscribeWith(s);
    unsubscribeWith(s);

    handleDeepLink("forge://send?message=should-buffer");
    expect(drainHandler(allowedEvent)).toEqual([
      { kind: "send", message: "should-buffer" },
    ]);
  });

  test("post-drain live links still broadcast (live subscribers still get them)", () => {
    installDeepLinks();
    const s = makeSender();
    subscribeWith(s);

    const w = makeWindow();
    windows = [w];
    handleDeepLink("forge://send?message=live");

    expect(w.webContents.send).toHaveBeenCalledWith("forge:deepLinks:event", {
      kind: "send",
      message: "live",
    });
  });

  test("destroyed webContents auto-clears its subscription (no leak when React cleanup misses)", () => {
    // The real bug this guards against: window close on Darwin
    // can tear down the JS context before React effect cleanups
    // flush, so `forge:deepLinks:unsubscribe` never fires.
    // The `destroyed` listener cleans up regardless, so future
    // links buffer correctly.
    installDeepLinks();
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:deepLinks:drain",
    )![1] as (event: unknown) => unknown[];

    const s = makeSender();
    subscribeWith(s);
    expect(drainHandler(allowedEvent)).toEqual([]);

    // Simulate window close without React cleanup running — only
    // the webContents `destroyed` event fires.
    s.fireDestroyed();

    // No subscribers now → next link is buffered.
    handleDeepLink("forge://send?message=after-crash");
    expect(drainHandler(allowedEvent)).toEqual([
      { kind: "send", message: "after-crash" },
    ]);
  });
});

describe("handleDeepLink — broadcast", () => {
  test("broadcasts to every BrowserWindow's webContents", () => {
    const w1 = makeWindow();
    const w2 = makeWindow();
    windows = [w1, w2];

    handleDeepLink("forge://send?message=broadcast");

    const expected = { kind: "send", message: "broadcast" };
    expect(w1.webContents.send).toHaveBeenCalledWith(
      "forge:deepLinks:event",
      expected,
    );
    expect(w2.webContents.send).toHaveBeenCalledWith(
      "forge:deepLinks:event",
      expected,
    );
  });

  test("skips destroyed windows", () => {
    const alive = makeWindow();
    const dead = makeWindow(true);
    windows = [alive, dead];

    handleDeepLink("forge://send?message=skip");

    expect(alive.webContents.send).toHaveBeenCalled();
    expect(dead.webContents.send).not.toHaveBeenCalled();
  });

  test("unknown-kind links are still broadcast (renderer logs / drops)", () => {
    const w = makeWindow();
    windows = [w];

    handleDeepLink("javascript:alert(1)");

    expect(w.webContents.send).toHaveBeenCalledWith("forge:deepLinks:event", {
      kind: "unknown",
      url: "javascript:alert(1)",
    });
  });
});

describe("handleDeepLink — window activation", () => {
  test("brings the main window forward for `send` (covers the no-renderer case on Darwin)", () => {
    handleDeepLink("forge://send?message=hi");
    expect(ensureMainWindowVisibleMock).toHaveBeenCalledTimes(1);
  });

  test("brings the main window forward for `openThread`", () => {
    handleDeepLink("forge://thread/abc");
    expect(ensureMainWindowVisibleMock).toHaveBeenCalledTimes(1);
  });

  test("brings the main window forward for `billingCheckoutComplete`", () => {
    handleDeepLink(
      "forge://billing/checkout-complete?status=success&session_id=cs_test_a1B2",
    );
    expect(ensureMainWindowVisibleMock).toHaveBeenCalledTimes(1);
  });

  test("brings the main window forward for `connect`", () => {
    handleDeepLink("forge://connect?url=https%3A%2F%2Fh.example&code=ABCD");
    expect(ensureMainWindowVisibleMock).toHaveBeenCalledTimes(1);
  });

  test("does NOT activate the window for unknown kinds (no UI side effect for foreign schemes)", () => {
    handleDeepLink("javascript:alert(1)");
    handleDeepLink("file:///etc/passwd");
    handleDeepLink("not a url");

    expect(ensureMainWindowVisibleMock).not.toHaveBeenCalled();
  });

  test("defers activation when app is not yet ready (cold-launch via forge://)", () => {
    // Cold launch path: `will-finish-launching` → `open-url` fires
    // BEFORE `app.whenReady()`. `new BrowserWindow()` pre-ready
    // would race Electron init; the link is buffered above and the
    // initial `installMainWindow` in the whenReady chain creates
    // the window which drains it on mount.
    appIsReady = false;
    handleDeepLink("forge://send?message=cold-launch");

    expect(ensureMainWindowVisibleMock).not.toHaveBeenCalled();
  });

  test("activates after app becomes ready (warm path: subsequent links)", () => {
    appIsReady = false;
    handleDeepLink("forge://send?message=cold");
    expect(ensureMainWindowVisibleMock).not.toHaveBeenCalled();

    // Simulate whenReady having fired.
    appIsReady = true;
    handleDeepLink("forge://thread/warm");
    expect(ensureMainWindowVisibleMock).toHaveBeenCalledTimes(1);
  });

  test("buffers the link AND activates so the renderer-on-mount drain still delivers it", () => {
    // Simulating the macOS path: app alive, main window closed,
    // user clicks forge://send → main handles it. The link must
    // both (a) be parked in the buffer for the freshly-created
    // renderer to drain, and (b) trigger window creation so the
    // renderer actually mounts.
    handleDeepLink("forge://send?message=delivered");

    // Activation fired.
    expect(ensureMainWindowVisibleMock).toHaveBeenCalledTimes(1);
    // Link buffered (no subscribers yet — the new window hasn't
    // mounted).
    const drainHandler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:deepLinks:drain",
    );
    // installDeepLinks hasn't run in this test, so register the
    // handler via a fresh install before draining.
    if (!drainHandler) {
      installDeepLinks();
    }
    const drain = ipcHandleMock.mock.calls.find(
      (c) => c[0] === "forge:deepLinks:drain",
    )![1] as (event: unknown) => unknown[];
    expect(drain(allowedEvent)).toEqual([
      { kind: "send", message: "delivered" },
    ]);
  });
});

describe("resolveRegisteredSchemes", () => {
  test("production registers forge and forge-assistant", () => {
    expect(resolveRegisteredSchemes("production")).toEqual([
      "forge",
      "forge-assistant",
    ]);
  });

  test("dev registers only forge-assistant-dev", () => {
    expect(resolveRegisteredSchemes("dev")).toEqual(["forge-assistant-dev"]);
  });

  test("staging registers only forge-assistant-staging", () => {
    expect(resolveRegisteredSchemes("staging")).toEqual([
      "forge-assistant-staging",
    ]);
  });

  test("local registers only forge-assistant-local", () => {
    expect(resolveRegisteredSchemes("local")).toEqual([
      "forge-assistant-local",
    ]);
  });

  test("unknown env derives scheme from env name", () => {
    expect(resolveRegisteredSchemes("test")).toEqual(["forge-assistant-test"]);
  });
});

describe("resolveAuthCallbackScheme", () => {
  test("uses the app-specific production scheme", () => {
    expect(resolveAuthCallbackScheme("production")).toBe("forge-assistant");
  });

  test("uses the environment-specific non-production scheme", () => {
    expect(resolveAuthCallbackScheme("dev")).toBe("forge-assistant-dev");
  });
});

describe("resolveAcceptedSchemes", () => {
  test("production accepts forge: and forge-assistant:", () => {
    const accepted = resolveAcceptedSchemes("production");
    expect(accepted).toContain("forge:");
    expect(accepted).toContain("forge-assistant:");
    expect(accepted).toHaveLength(2);
  });

  test("dev accepts forge:, forge-assistant:, and forge-assistant-dev:", () => {
    const accepted = resolveAcceptedSchemes("dev");
    expect(accepted).toContain("forge:");
    expect(accepted).toContain("forge-assistant:");
    expect(accepted).toContain("forge-assistant-dev:");
    expect(accepted).toHaveLength(3);
  });

  test("staging accepts forge:, forge-assistant:, and forge-assistant-staging:", () => {
    const accepted = resolveAcceptedSchemes("staging");
    expect(accepted).toContain("forge:");
    expect(accepted).toContain("forge-assistant:");
    expect(accepted).toContain("forge-assistant-staging:");
    expect(accepted).toHaveLength(3);
  });

  test("local accepts forge:, forge-assistant:, and forge-assistant-local:", () => {
    const accepted = resolveAcceptedSchemes("local");
    expect(accepted).toContain("forge:");
    expect(accepted).toContain("forge-assistant:");
    expect(accepted).toContain("forge-assistant-local:");
    expect(accepted).toHaveLength(3);
  });
});
