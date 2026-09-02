/**
 * Tests for the notification copy-composer: the fallback path that
 * composeFallbackCopy uses when the LLM is unavailable, the normalization
 * it applies to producer-supplied titles, and the shared deriveTitle
 * utility.
 */

import { describe, expect, test } from "bun:test";

import { composeFallbackCopy, deriveTitle } from "../copy-composer.js";
import type { NotificationSignal } from "../signal.js";
import type { NotificationChannel } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeSignal(
  overrides?: Partial<NotificationSignal>,
): NotificationSignal {
  return {
    signalId: "sig-copy-test-1",
    createdAt: Date.now(),
    sourceChannel: "scheduler",
    sourceContextId: "ctx-1",
    sourceEventName: "user.send_notification",
    contextPayload: {},
    attentionHints: {
      requiresAction: false,
      urgency: "low",
      isAsyncBackground: false,
      visibleInSourceNow: false,
    },
    ...overrides,
  };
}

const CHANNELS: NotificationChannel[] = ["forge" as NotificationChannel];

// ── activity.failed rendering ─────────────────────────────────────────

describe("activity.failed copy", () => {
  function failedSignal(
    contextPayload: Record<string, unknown>,
  ): NotificationSignal {
    return makeSignal({
      sourceEventName: "activity.failed",
      contextPayload,
    });
  }

  test("renders the carried classification message verbatim", () => {
    const copy = composeFallbackCopy(
      failedSignal({
        jobName: "schedule:PR scan",
        errorKind: "model_provider",
        errorMessage: "Agent turn failed (PROVIDER_BILLING)",
        failureSummary:
          "You're out of credits. Add credits in Settings to continue.",
      }),
      CHANNELS,
    );
    expect(copy.forge?.title).toBe("Background job failed: schedule:PR scan");
    expect(copy.forge?.body).toBe(
      "You're out of credits. Add credits in Settings to continue.",
    );
  });

  test("an oversized carried summary is bounded", () => {
    const copy = composeFallbackCopy(
      failedSignal({
        jobName: "job",
        errorKind: "model_provider",
        errorMessage: "irrelevant",
        failureSummary: "x".repeat(400),
      }),
      CHANNELS,
    );
    expect((copy.forge?.body ?? "").length).toBeLessThanOrEqual(303);
    expect(copy.forge?.body).toEndWith("...");
  });

  test("constant-shaped raw detail never reaches the body", () => {
    const copy = composeFallbackCopy(
      failedSignal({
        jobName: "heartbeat",
        errorKind: "model_provider",
        errorMessage: "Agent turn failed (PROVIDER_BILLING)",
      }),
      CHANNELS,
    );
    expect(copy.forge?.body).toBe("The model provider did not respond.");
    expect(copy.forge?.body).not.toContain("PROVIDER_BILLING");
  });

  test("readable raw detail is appended to the kind prose", () => {
    const copy = composeFallbackCopy(
      failedSignal({
        jobName: "watcher",
        errorKind: "exception",
        errorMessage: "The feed endpoint returned an empty document.",
      }),
      CHANNELS,
    );
    expect(copy.forge?.body).toBe(
      "It stopped with an error. The feed endpoint returned an empty document.",
    );
  });

  test("timeout renders its own prose", () => {
    const copy = composeFallbackCopy(
      failedSignal({
        jobName: "filing",
        errorKind: "timeout",
        errorMessage: "Background job 'filing' timed out after 1800000ms",
      }),
      CHANNELS,
    );
    expect(copy.forge?.body).toContain("It ran out of time before finishing.");
  });
});

// ── composeFallbackCopy with requestedMessage ─────────────────────────

describe("composeFallbackCopy honors requestedMessage / requestedTitle", () => {
  test("uses requestedMessage as body and requestedTitle as title", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "Take out the trash",
        requestedTitle: "Household Reminder",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toBe("Take out the trash");
    expect(copy.forge?.title).toBe("Household Reminder");
    expect(copy.forge?.conversationSeedMessage).toBe("Take out the trash");
  });

  test("derives title from body when requestedTitle is absent", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "First sentence. Second sentence follows.",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toBe("First sentence. Second sentence follows.");
    expect(copy.forge?.title).toBe("First sentence.");
  });

  test("derives title from body when requestedTitle is empty string", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "Some message body here",
        requestedTitle: "",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toBe("Some message body here");
    expect(copy.forge?.title).toBe("Some message body here");
  });

  test("derives title from body when requestedTitle is whitespace", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "Whitespace title test",
        requestedTitle: "   ",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toBe("Whitespace title test");
    expect(copy.forge?.title).toBe("Whitespace title test");
  });

  test("trims whitespace from requestedMessage", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "  padded message  ",
        requestedTitle: "  padded title  ",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toBe("padded message");
    expect(copy.forge?.title).toBe("padded title");
  });

  test("populates copy for all requested channels", () => {
    const channels = [
      "forge" as NotificationChannel,
      "telegram" as NotificationChannel,
    ];
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "Multi-channel test",
        requestedTitle: "Multi Title",
      },
    });
    const copy = composeFallbackCopy(signal, channels);

    expect(copy.forge?.body).toBe("Multi-channel test");
    expect(copy.forge?.title).toBe("Multi Title");
    expect(copy.telegram?.body).toBe("Multi-channel test");
    expect(copy.telegram?.title).toBe("Multi Title");
  });

  test("falls through to template when requestedMessage is absent", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.notify",
      contextPayload: {
        message: "Standup time",
        label: "Daily Standup",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Daily Standup");
    expect(copy.forge?.body).toBe("Standup time");
  });

  test("falls through to template when requestedMessage is empty string", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.notify",
      contextPayload: {
        requestedMessage: "",
        message: "Standup time",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Reminder");
    expect(copy.forge?.body).toBe("Standup time");
  });

  test("falls through to template when requestedMessage is whitespace", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.notify",
      contextPayload: {
        requestedMessage: "   ",
        message: "Standup time",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Reminder");
    expect(copy.forge?.body).toBe("Standup time");
  });

  test("falls through to generic copy when no requestedMessage and no template match", () => {
    const signal = makeSignal({
      sourceEventName: "unknown.event",
      contextPayload: {},
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Notification");
    expect(copy.forge?.body).toBe("");
  });

  test("requestedMessage takes priority over event-name template", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.notify",
      contextPayload: {
        requestedMessage: "User-supplied content",
        requestedTitle: "User Title",
        message: "Template message field",
        label: "Template label field",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toBe("User-supplied content");
    expect(copy.forge?.title).toBe("User Title");
  });

  test("strips markdown and quotes from a producer-supplied title", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "The deploy finished cleanly.",
        requestedTitle: '"**Deploy** finished"',
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Deploy finished");
  });

  test("derives the title when requestedTitle reads as leaked prose", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "Backup finished. Nothing needs your attention.",
        requestedTitle: "I need to generate a title for this notification",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Backup finished.");
  });

  test("derives the title when requestedTitle spans multiple lines", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "The nightly job is done.",
        requestedTitle: "Nightly job\nsecond line",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("The nightly job is done.");
  });

  test("truncates an over-long requestedTitle to the shared title budget", () => {
    const signal = makeSignal({
      contextPayload: {
        requestedMessage: "Body text",
        requestedTitle:
          "Alpha bravo charlie delta echo foxtrot golf hotel india juliett",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Alpha bravo charlie delta echo");
  });

  test("works with non-assistant_tool source channels", () => {
    for (const sourceChannel of ["scheduler", "watcher", "slack"] as const) {
      const signal = makeSignal({
        sourceChannel,
        contextPayload: {
          requestedMessage: `Message from ${sourceChannel}`,
        },
      });
      const copy = composeFallbackCopy(signal, CHANNELS);

      expect(copy.forge?.body).toBe(`Message from ${sourceChannel}`);
    }
  });
});

// ── Plugin schedule templates ─────────────────────────────────────────

describe("composeFallbackCopy plugin schedule templates", () => {
  test("schedule.declared renders plugin, schedule name, and cadence", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.declared",
      contextPayload: {
        pluginName: "news",
        scheduleName: "digest",
        sourceKey: "plugin:news/digest",
        cadence: "0 9 * * *",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("New plugin schedule: digest");
    expect(copy.forge?.body).toContain('Plugin "news"');
    expect(copy.forge?.body).toContain('"digest"');
    expect(copy.forge?.body).toContain("0 9 * * *");
  });

  test("schedule.declared omits the cadence suffix when absent", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.declared",
      contextPayload: { pluginName: "news", scheduleName: "digest" },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).not.toContain("(");
    expect(copy.forge?.body).toContain('"digest"');
  });

  test("schedule.definition_changed renders plugin and schedule name", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.definition_changed",
      contextPayload: {
        pluginName: "news",
        scheduleName: "digest",
        sourceKey: "plugin:news/digest",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Plugin schedule changed: digest");
    expect(copy.forge?.body).toBe(
      'Plugin "news" changed the definition of its schedule "digest".',
    );
  });

  test("schedule.definition_error renders plugin, schedule name, and reason", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.definition_error",
      contextPayload: {
        pluginName: "news",
        scheduleName: "digest",
        sourceKey: "plugin:news/digest",
        reason: "invalid cron expression",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("Plugin schedule error: digest");
    expect(copy.forge?.body).toContain('Plugin "news"');
    expect(copy.forge?.body).toContain("invalid cron expression");
    // A non-empty body means the broadcaster's empty-body skip never
    // suppresses a definition error when the notification LLM is down.
    expect(copy.forge?.body?.length).toBeGreaterThan(0);
  });

  test("schedule.definition_error says so when the schedule was paused", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.definition_error",
      contextPayload: {
        pluginName: "news",
        scheduleName: "sync",
        sourceKey: "plugin:news/sync",
        reason: "config.json is not valid JSON",
        paused: true,
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toContain("config.json is not valid JSON");
    expect(copy.forge?.body).toContain("paused until the declaration loads");
  });

  test("schedule.definition_error omits the pause line when the row kept running", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.definition_error",
      contextPayload: {
        pluginName: "news",
        scheduleName: "digest",
        reason: "invalid cron expression",
        paused: false,
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).not.toContain("paused");
  });

  test("schedule.definition_error still renders with an empty payload", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.definition_error",
      contextPayload: {},
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body?.length).toBeGreaterThan(0);
  });

  test("schedule.declared sanitizes plugin-controlled fields", () => {
    // Plugin-authored declaration strings carrying a clear-screen CSI, an OSC
    // title write, a BEL, and a newline must not reach the rendered copy.
    const signal = makeSignal({
      sourceEventName: "schedule.declared",
      contextPayload: {
        pluginName: "news\u001b[2Jext",
        scheduleName: "digest\u0007",
        cadence: "0 9 * * *\u001b]0;pwned\u0007",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.title).toBe("New plugin schedule: digest");
    expect(copy.forge?.body).toContain('Plugin "newsext"');
    expect(copy.forge?.body).toContain("0 9 * * *");
    expect(copy.forge?.body).not.toContain("\u001b");
    expect(copy.forge?.body).not.toContain("\u0007");
    expect(copy.forge?.body).not.toContain("pwned");
  });

  test("schedule.declared omits a cadence that sanitizes to nothing", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.declared",
      contextPayload: {
        pluginName: "news",
        scheduleName: "digest",
        cadence: "\u001b[2J\u0007",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).not.toContain("(");
    expect(copy.forge?.body).not.toContain("\u001b");
  });

  test("schedule.definition_error sanitizes and flattens the reason", () => {
    const signal = makeSignal({
      sourceEventName: "schedule.definition_error",
      contextPayload: {
        pluginName: "news\u001b[31m",
        scheduleName: "digest",
        reason: "bad\nexpression\u001b[0m",
      },
    });
    const copy = composeFallbackCopy(signal, CHANNELS);

    expect(copy.forge?.body).toContain('Plugin "news"');
    expect(copy.forge?.body).toContain("bad expression");
    expect(copy.forge?.body).not.toContain("\u001b");
    expect(copy.forge?.body).not.toContain("\n");
  });
});

// ── deriveTitle ───────────────────────────────────────────────────────

describe("deriveTitle", () => {
  test("extracts first sentence when period is present", () => {
    expect(deriveTitle("First sentence. Second sentence.")).toBe(
      "First sentence.",
    );
  });

  test("extracts first sentence on exclamation mark", () => {
    expect(deriveTitle("Alert! More details follow.")).toBe("Alert!");
  });

  test("extracts first sentence on question mark", () => {
    expect(deriveTitle("Ready? Let me know.")).toBe("Ready?");
  });

  test("uses full body when no sentence terminator", () => {
    expect(deriveTitle("No terminator here")).toBe("No terminator here");
  });

  test("truncates to 60 characters with ellipsis", () => {
    const long = "A".repeat(80);
    const result = deriveTitle(long);
    expect(result.length).toBeLessThanOrEqual(61); // 60 + ellipsis char
    expect(result.endsWith("\u2026")).toBe(true);
  });

  test("does not truncate at exactly 60 characters", () => {
    const exact = "A".repeat(60);
    expect(deriveTitle(exact)).toBe(exact);
  });

  test("trims whitespace", () => {
    expect(deriveTitle("  trimmed  ")).toBe("trimmed");
  });
});
