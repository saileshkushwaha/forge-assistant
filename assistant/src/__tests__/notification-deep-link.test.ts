/**
 * Regression tests for Forge notification deep-link metadata.
 *
 * Validates that the ForgeAdapter broadcasts notification_intent with
 * deepLinkMetadata, and that the broadcaster correctly passes deepLinkTarget
 * from the decision through to the adapter payload — regardless of whether
 * the conversation was newly created or reused. Also covers the platform
 * (APNs) channel, whose deepLinkTarget must be enriched with the
 * conversationId so remote-push taps can navigate.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { PairingOptions } from "../notifications/conversation-pairing.js";

// -- Mocks (must be declared before importing modules that depend on them) ----

mock.module("../contacts/guardian-delivery-reader.js", () => ({
  getGuardianDelivery: async () => null,
}));

// Mock destination-resolver for broadcaster tests
mock.module("../notifications/destination-resolver.js", () => ({
  resolveDestinations: (channels: string[]) => {
    const m = new Map();
    for (const ch of channels) {
      m.set(ch, { channel: ch, endpoint: `mock-${ch}` });
    }
    return m;
  },
}));

// Mock deliveries-store to avoid DB access. Existing deliveries are
// configurable per channel so duplicate-delivery retry paths can be driven;
// the default (no rows) leaves every channel on the fresh-delivery path.
let existingDeliveriesByChannel: Record<
  string,
  {
    id: string;
    conversationId: string | null;
    messageId: string | null;
    conversationStrategy: string | null;
  }
> = {};
mock.module("../notifications/deliveries-store.js", () => ({
  createDelivery: () => {},
  updateDeliveryStatus: () => {},
  findDeliveryByDecisionAndChannel: (_decisionId: string, channel: string) =>
    existingDeliveriesByChannel[channel],
}));

// Mock conversation-crud so the broadcaster's source-context fallback lookup
// can be driven from tests without DB access.
let mockExistingConversations: Record<string, { id: string }> = {};
mock.module("../persistence/conversation-crud.js", () => ({
  setConversationProcessingStartedAt: () => {},
  isConversationProcessing: () => false,
  getConversation: (id: string) => mockExistingConversations[id] ?? null,
}));

// Configurable mock for conversation-pairing
let nextPairingResult:
  | import("../notifications/conversation-pairing.js").PairingResult
  | null = null;
// Per-channel results take precedence over nextPairingResult, so mixed
// broadcasts can drive prod-realistic pairings (e.g. platform is push_only
// and pairs null while forge creates a conversation).
let pairingResultsByChannel: Record<
  string,
  import("../notifications/conversation-pairing.js").PairingResult
> = {};
let pairingCallCount = 0;

mock.module("../notifications/conversation-pairing.js", () => ({
  pairDeliveryWithConversation: async (
    _signal: unknown,
    channel: string,
    _copy: unknown,
    _options?: PairingOptions,
  ) => {
    const byChannel = pairingResultsByChannel[channel];
    if (byChannel) {
      return byChannel;
    }
    if (nextPairingResult) {
      const result = nextPairingResult;
      nextPairingResult = null;
      return result;
    }
    const id = `mock-conv-${++pairingCallCount}`;
    return {
      conversationId: id,
      messageId: `mock-msg-${pairingCallCount}`,
      strategy: "start_new_conversation" as const,
      createdNewConversation: true,
      conversationFallbackUsed: false,
    };
  },
}));

import type { AssistantEvent } from "../api/index.js";
import { ForgeAdapter } from "../notifications/adapters/macos.js";
import { NotificationBroadcaster } from "../notifications/broadcaster.js";
import type { NotificationSignal } from "../notifications/signal.js";
import type {
  ChannelAdapter,
  ChannelDeliveryPayload,
  ChannelDestination,
  DeliveryResult,
  NotificationChannel,
  NotificationDecision,
} from "../notifications/types.js";

// -- Helpers -----------------------------------------------------------------

function makeSignal(
  overrides?: Partial<NotificationSignal>,
): NotificationSignal {
  return {
    signalId: "sig-deeplink-001",
    createdAt: Date.now(),
    sourceChannel: "scheduler",
    sourceContextId: "sess-001",
    sourceEventName: "test.event",
    contextPayload: {},
    attentionHints: {
      requiresAction: false,
      urgency: "medium",
      isAsyncBackground: true,
      visibleInSourceNow: false,
    },
    ...overrides,
  };
}

function makeDecision(
  overrides?: Partial<NotificationDecision>,
): NotificationDecision {
  return {
    shouldNotify: true,
    selectedChannels: ["forge"],
    reasoningSummary: "Deep-link test decision",
    renderedCopy: {
      forge: { title: "Test Alert", body: "Something happened" },
    },
    dedupeKey: "deeplink-test-001",
    confidence: 0.9,
    fallbackUsed: false,
    ...overrides,
  };
}

class MockAdapter implements ChannelAdapter {
  readonly channel: NotificationChannel;
  sent: ChannelDeliveryPayload[] = [];

  constructor(channel: NotificationChannel) {
    this.channel = channel;
  }

  async send(
    payload: ChannelDeliveryPayload,
    _dest: ChannelDestination,
  ): Promise<DeliveryResult> {
    this.sent.push(payload);
    return { success: true };
  }
}

// -- Tests -------------------------------------------------------------------

describe("notification deep-link metadata", () => {
  beforeEach(() => {
    nextPairingResult = null;
    pairingResultsByChannel = {};
    mockExistingConversations = {};
    existingDeliveriesByChannel = {};
  });

  describe("ForgeAdapter", () => {
    test("broadcasts notification_intent with deepLinkMetadata from payload", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      await adapter.send(
        {
          sourceEventName: "test.event",
          copy: { title: "Alert", body: "Something happened" },
          deepLinkTarget: {
            conversationId: "conv-123",
            conversationType: "notification",
          },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      expect(messages).toHaveLength(1);
      const msg = messages[0] as unknown as Record<string, unknown>;
      expect(msg.type).toBe("notification_intent");
      expect(msg.title).toBe("Alert");
      expect(msg.body).toBe("Something happened");
      expect(msg.deepLinkMetadata).toEqual({
        conversationId: "conv-123",
        conversationType: "notification",
      });
    });

    test("broadcasts notification_intent without deepLinkMetadata when absent", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      await adapter.send(
        {
          sourceEventName: "test.event",
          copy: { title: "Alert", body: "No deep link" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      expect(messages).toHaveLength(1);
      const msg = messages[0] as unknown as Record<string, unknown>;
      expect(msg.type).toBe("notification_intent");
      expect(msg.deepLinkMetadata).toBeUndefined();
    });

    test("includes conversationId in deepLinkMetadata for navigation", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      const conversationId = "conv-deep-link-test";
      await adapter.send(
        {
          sourceEventName: "guardian.question",
          copy: { title: "Guardian Question", body: "What is the code?" },
          deepLinkTarget: { conversationId },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      const msg = messages[0] as unknown as Record<string, unknown>;
      const metadata = msg.deepLinkMetadata as Record<string, unknown>;
      expect(metadata.conversationId).toBe(conversationId);
    });

    test("returns success: true on successful broadcast", async () => {
      const adapter = new ForgeAdapter(() => {});

      const result = await adapter.send(
        {
          sourceEventName: "test.event",
          copy: { title: "T", body: "B" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      expect(result.success).toBe(true);
    });

    test("returns success: false when broadcast throws", async () => {
      const adapter = new ForgeAdapter(() => {
        throw new Error("connection lost");
      });

      const result = await adapter.send(
        {
          sourceEventName: "test.event",
          copy: { title: "T", body: "B" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("connection lost");
    });

    test("sourceEventName is included in the event payload", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      await adapter.send(
        {
          sourceEventName: "guardian.question",
          copy: { title: "Alert", body: "Body" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      const msg = messages[0] as unknown as Record<string, unknown>;
      expect(msg.sourceEventName).toBe("guardian.question");
    });

    test("deepLinkMetadata with conversationId enables client-side navigation", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      // Simulate a notification that should deep-link to a specific conversation
      await adapter.send(
        {
          sourceEventName: "activity.complete",
          copy: { title: "Task Done", body: "Your task has completed" },
          deepLinkTarget: {
            conversationId: "conv-task-run-42",
            workItemId: "work-item-7",
          },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      const msg = messages[0] as unknown as Record<string, unknown>;
      const metadata = msg.deepLinkMetadata as Record<string, unknown>;
      expect(metadata.conversationId).toBe("conv-task-run-42");
      expect(metadata.workItemId).toBe("work-item-7");
    });

    test("deep-link payload includes messageId when present", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      await adapter.send(
        {
          sourceEventName: "guardian.question",
          copy: { title: "Question", body: "Body" },
          deepLinkTarget: { conversationId: "conv-1", messageId: "msg-1" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      const msg = messages[0] as unknown as Record<string, unknown>;
      const metadata = msg.deepLinkMetadata as Record<string, unknown>;
      expect(metadata.messageId).toBe("msg-1");
    });

    // ── Deep-link conversationId present regardless of reuse/new ──────

    test("deep-link payload includes conversationId for a newly created conversation", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      // Simulates the broadcaster merging pairing.conversationId into deep-link
      // for a newly created notification conversation (start_new path)
      await adapter.send(
        {
          sourceEventName: "schedule.notify",
          copy: { title: "Reminder", body: "Take out the trash" },
          deepLinkTarget: { conversationId: "conv-new-convo-001" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      const msg = messages[0] as unknown as Record<string, unknown>;
      const metadata = msg.deepLinkMetadata as Record<string, unknown>;
      expect(metadata.conversationId).toBe("conv-new-convo-001");
    });

    test("deep-link payload includes conversationId for a reused conversation", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      // Simulates the broadcaster merging pairing.conversationId into deep-link
      // for a reused notification conversation (reuse_existing path)
      await adapter.send(
        {
          sourceEventName: "schedule.notify",
          copy: {
            title: "Follow-up",
            body: "Still need to take out the trash",
          },
          deepLinkTarget: { conversationId: "conv-reused-convo-042" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      const msg = messages[0] as unknown as Record<string, unknown>;
      const metadata = msg.deepLinkMetadata as Record<string, unknown>;
      expect(metadata.conversationId).toBe("conv-reused-convo-042");
    });

    // ── Reused conversation deep-link stability regressions ─────────────────

    test("reused conversation preserves the same conversationId across follow-up notifications", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      const stableConversationId = "conv-bound-telegram-dest-001";

      // First notification to a bound destination
      await adapter.send(
        {
          sourceEventName: "guardian.question",
          copy: { title: "Question 1", body: "Allow file read?" },
          deepLinkTarget: {
            conversationId: stableConversationId,
            messageId: "msg-seed-1",
          },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      // Follow-up notification reuses the same bound conversation
      await adapter.send(
        {
          sourceEventName: "guardian.question",
          copy: { title: "Question 2", body: "Allow network access?" },
          deepLinkTarget: {
            conversationId: stableConversationId,
            messageId: "msg-seed-2",
          },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      expect(messages).toHaveLength(2);

      const meta1 = (messages[0] as unknown as Record<string, unknown>)
        .deepLinkMetadata as Record<string, unknown>;
      const meta2 = (messages[1] as unknown as Record<string, unknown>)
        .deepLinkMetadata as Record<string, unknown>;

      // Both deep links point to the same conversation
      expect(meta1.conversationId).toBe(stableConversationId);
      expect(meta2.conversationId).toBe(stableConversationId);

      // But each has a distinct messageId for scroll-to-message targeting
      expect(meta1.messageId).toBe("msg-seed-1");
      expect(meta2.messageId).toBe("msg-seed-2");
    });

    test("reused conversation deep-link messageId changes per delivery for scroll targeting", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      const conversationId = "conv-reused-scroll-test";

      await adapter.send(
        {
          sourceEventName: "schedule.notify",
          copy: { title: "Reminder", body: "First" },
          deepLinkTarget: { conversationId, messageId: "msg-a" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      await adapter.send(
        {
          sourceEventName: "schedule.notify",
          copy: { title: "Reminder", body: "Second" },
          deepLinkTarget: { conversationId, messageId: "msg-b" },
          urgency: "medium",
        },
        { channel: "forge" },
      );

      const meta1 = (messages[0] as unknown as Record<string, unknown>)
        .deepLinkMetadata as Record<string, unknown>;
      const meta2 = (messages[1] as unknown as Record<string, unknown>)
        .deepLinkMetadata as Record<string, unknown>;

      // Same conversation but different message targets
      expect(meta1.conversationId).toBe(conversationId);
      expect(meta2.conversationId).toBe(conversationId);
      expect(meta1.messageId).not.toBe(meta2.messageId);
    });

    test("deep-link metadata is stable when conversation is reused via binding-key continuation", async () => {
      const messages: AssistantEvent[] = [];
      const adapter = new ForgeAdapter((msg) => messages.push(msg));

      // Simulates the binding-key continuation path: multiple notifications
      // to the same voice destination reuse the same bound conversation, and
      // the deep-link metadata should reflect the bound conversation ID
      // rather than creating a new one each time.
      const boundConvId = "conv-voice-bound-+15551234567";

      for (const body of ["Alert 1", "Alert 2", "Alert 3"]) {
        await adapter.send(
          {
            sourceEventName: "activity.complete",
            copy: { title: "Activity", body },
            deepLinkTarget: { conversationId: boundConvId },
            urgency: "medium",
          },
          { channel: "forge" },
        );
      }

      expect(messages).toHaveLength(3);

      // All three notifications deep-link to the same bound conversation
      for (const msg of messages) {
        const metadata = (msg as unknown as Record<string, unknown>)
          .deepLinkMetadata as Record<string, unknown>;
        expect(metadata.conversationId).toBe(boundConvId);
      }
    });
  });

  // ── NotificationBroadcaster deep-link injection ──────────────────────
  //
  // These tests exercise the production code path where the broadcaster
  // calls pairDeliveryWithConversation() and merges the pairing result's
  // conversationId/messageId into deepLinkTarget before passing to the
  // adapter. This catches regressions that the adapter-only tests above
  // would miss (e.g. broadcaster stops merging pairing results).

  describe("NotificationBroadcaster deep-link injection", () => {
    test("broadcaster merges pairing conversationId into deepLinkTarget for forge", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const broadcaster = new NotificationBroadcaster([forgeAdapter]);

      nextPairingResult = {
        conversationId: "conv-paired-abc",
        messageId: "msg-paired-abc",
        strategy: "start_new_conversation" as const,
        createdNewConversation: true,
        conversationFallbackUsed: false,
      };

      const signal = makeSignal();
      const decision = makeDecision();

      await broadcaster.broadcastDecision(signal, decision);

      expect(forgeAdapter.sent).toHaveLength(1);
      const deepLink = forgeAdapter.sent[0].deepLinkTarget;
      expect(deepLink).toBeDefined();
      expect(deepLink!.conversationId).toBe("conv-paired-abc");
    });

    test("broadcaster merges pairing messageId into deepLinkTarget for forge", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const broadcaster = new NotificationBroadcaster([forgeAdapter]);

      nextPairingResult = {
        conversationId: "conv-paired-def",
        messageId: "msg-paired-def",
        strategy: "start_new_conversation" as const,
        createdNewConversation: true,
        conversationFallbackUsed: false,
      };

      const signal = makeSignal();
      const decision = makeDecision();

      await broadcaster.broadcastDecision(signal, decision);

      expect(forgeAdapter.sent).toHaveLength(1);
      const deepLink = forgeAdapter.sent[0].deepLinkTarget;
      expect(deepLink).toBeDefined();
      expect(deepLink!.messageId).toBe("msg-paired-def");
    });

    test("reused conversation deep-link points to the reused conversationId", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const broadcaster = new NotificationBroadcaster([forgeAdapter]);

      nextPairingResult = {
        conversationId: "conv-reused-xyz",
        messageId: "msg-reused-xyz",
        strategy: "start_new_conversation" as const,
        createdNewConversation: false,
        conversationFallbackUsed: false,
      };

      const signal = makeSignal();
      const decision = makeDecision({
        conversationActions: {
          forge: {
            action: "reuse_existing",
            conversationId: "conv-original-placeholder",
          },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      expect(forgeAdapter.sent).toHaveLength(1);
      const deepLink = forgeAdapter.sent[0].deepLinkTarget;
      expect(deepLink).toBeDefined();
      // The deep-link should use the pairing result, not the original placeholder
      expect(deepLink!.conversationId).toBe("conv-reused-xyz");
    });

    test("deep-link conversationId is stable across multiple deliveries to the same reused conversation", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const broadcaster = new NotificationBroadcaster([forgeAdapter]);

      const stableConvId = "conv-stable-reuse-001";

      // First delivery
      nextPairingResult = {
        conversationId: stableConvId,
        messageId: "msg-delivery-1",
        strategy: "start_new_conversation" as const,
        createdNewConversation: false,
        conversationFallbackUsed: false,
      };

      await broadcaster.broadcastDecision(makeSignal(), makeDecision());

      // Second delivery — same conversation reused via binding-key
      nextPairingResult = {
        conversationId: stableConvId,
        messageId: "msg-delivery-2",
        strategy: "start_new_conversation" as const,
        createdNewConversation: false,
        conversationFallbackUsed: false,
      };

      await broadcaster.broadcastDecision(makeSignal(), makeDecision());

      expect(forgeAdapter.sent).toHaveLength(2);

      const deepLink1 = forgeAdapter.sent[0].deepLinkTarget;
      const deepLink2 = forgeAdapter.sent[1].deepLinkTarget;

      // Both deliveries point to the same stable conversation
      expect(deepLink1!.conversationId).toBe(stableConvId);
      expect(deepLink2!.conversationId).toBe(stableConvId);

      // But each has a distinct messageId for scroll targeting
      expect(deepLink1!.messageId).toBe("msg-delivery-1");
      expect(deepLink2!.messageId).toBe("msg-delivery-2");
    });

    // ── Source-context fallback when pairing yields no conversation ──

    test("falls back to signal.sourceContextId for deep link when pairing returns no conversation and sourceContextId resolves", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const broadcaster = new NotificationBroadcaster([forgeAdapter]);

      // Passive forge signal: pairing skips creation, returns null.
      nextPairingResult = {
        conversationId: null,
        messageId: null,
        strategy: "start_new_conversation" as const,
        createdNewConversation: false,
        conversationFallbackUsed: false,
      };

      const originConvId = "conv-origin-of-event";
      mockExistingConversations[originConvId] = { id: originConvId };

      const signal = makeSignal({ sourceContextId: originConvId });
      const decision = makeDecision();

      await broadcaster.broadcastDecision(signal, decision);

      expect(forgeAdapter.sent).toHaveLength(1);
      const deepLink = forgeAdapter.sent[0].deepLinkTarget;
      expect(deepLink).toBeDefined();
      expect(deepLink!.conversationId).toBe(originConvId);
    });

    test("omits conversationId from deep link when pairing returns no conversation and sourceContextId is a sentinel", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const broadcaster = new NotificationBroadcaster([forgeAdapter]);

      nextPairingResult = {
        conversationId: null,
        messageId: null,
        strategy: "start_new_conversation" as const,
        createdNewConversation: false,
        conversationFallbackUsed: false,
      };

      // Sentinel sourceContextId (job ID, access-req-*, etc.) — getConversation returns null.
      const signal = makeSignal({ sourceContextId: "access-req-sentinel-xyz" });
      const decision = makeDecision();

      await broadcaster.broadcastDecision(signal, decision);

      expect(forgeAdapter.sent).toHaveLength(1);
      const deepLink = forgeAdapter.sent[0].deepLinkTarget;
      // Decision did not carry a deepLinkTarget either — the resulting
      // deep link should be undefined or have no conversationId.
      expect(deepLink?.conversationId).toBeUndefined();
    });

    // ── Platform (APNs) channel deep-link enrichment ──────────────────
    //
    // The platform adapter forwards deepLinkTarget verbatim as
    // deep_link_metadata, so the broadcaster must enrich it with the
    // conversationId the same way it does for forge — otherwise remote-push
    // taps have no routing key and cannot navigate.

    test("broadcaster merges pairing conversationId and messageId into deepLinkTarget for platform", async () => {
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([platformAdapter]);

      nextPairingResult = {
        conversationId: "conv-paired-platform",
        messageId: "msg-paired-platform",
        strategy: "start_new_conversation" as const,
        createdNewConversation: true,
        conversationFallbackUsed: false,
      };

      const signal = makeSignal();
      const decision = makeDecision({
        selectedChannels: ["platform"],
        renderedCopy: {
          platform: { title: "Test Alert", body: "Something happened" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      expect(platformAdapter.sent).toHaveLength(1);
      const deepLink = platformAdapter.sent[0].deepLinkTarget;
      expect(deepLink).toBeDefined();
      expect(deepLink!.conversationId).toBe("conv-paired-platform");
      expect(deepLink!.messageId).toBe("msg-paired-platform");
    });

    test("platform deep link falls back to signal.sourceContextId when pairing returns no conversation", async () => {
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([platformAdapter]);

      // Production platform pairing: push_only strategy pairs no conversation.
      nextPairingResult = {
        conversationId: null,
        messageId: null,
        strategy: "push_only" as const,
        createdNewConversation: false,
        conversationFallbackUsed: false,
      };

      const originConvId = "conv-origin-of-push";
      mockExistingConversations[originConvId] = { id: originConvId };

      const signal = makeSignal({ sourceContextId: originConvId });
      const decision = makeDecision({
        selectedChannels: ["platform"],
        renderedCopy: {
          platform: { title: "Turn done", body: "Your task finished" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      expect(platformAdapter.sent).toHaveLength(1);
      const deepLink = platformAdapter.sent[0].deepLinkTarget;
      expect(deepLink).toBeDefined();
      expect(deepLink!.conversationId).toBe(originConvId);
    });

    test("platform deep link omits conversationId when sourceContextId is a sentinel", async () => {
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([platformAdapter]);

      nextPairingResult = {
        conversationId: null,
        messageId: null,
        strategy: "push_only" as const,
        createdNewConversation: false,
        conversationFallbackUsed: false,
      };

      const signal = makeSignal({ sourceContextId: "job-sentinel-123" });
      const decision = makeDecision({
        selectedChannels: ["platform"],
        renderedCopy: {
          platform: { title: "Alert", body: "Body" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      expect(platformAdapter.sent).toHaveLength(1);
      expect(
        platformAdapter.sent[0].deepLinkTarget?.conversationId,
      ).toBeUndefined();
    });

    test("forge and platform each receive deep-link enrichment in the same broadcast", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([
        forgeAdapter,
        platformAdapter,
      ]);

      // Forge is ordered first and consumes the queued pairing result;
      // the platform pairing call then receives the mock's auto-generated
      // conversation, so each channel is enriched from its own pairing.
      nextPairingResult = {
        conversationId: "conv-forge-paired",
        messageId: "msg-forge-paired",
        strategy: "start_new_conversation" as const,
        createdNewConversation: true,
        conversationFallbackUsed: false,
      };

      const signal = makeSignal();
      const decision = makeDecision({
        selectedChannels: ["platform", "forge"],
        renderedCopy: {
          forge: { title: "Test Alert", body: "Something happened" },
          platform: { title: "Test Alert", body: "Something happened" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      // Forge behavior unchanged: paired conversation wins.
      expect(forgeAdapter.sent).toHaveLength(1);
      expect(forgeAdapter.sent[0].deepLinkTarget?.conversationId).toBe(
        "conv-forge-paired",
      );

      // Platform enriched independently from its own pairing call.
      expect(platformAdapter.sent).toHaveLength(1);
      const platformConvId =
        platformAdapter.sent[0].deepLinkTarget?.conversationId;
      expect(String(platformConvId)).toStartWith("mock-conv-");
    });

    // ── Forge pairing carried into the platform deep link ─────────────
    //
    // In production the platform channel is push_only: its own pairing
    // returns null. When the forge channel creates (or reuses) a
    // conversation in the same broadcast, the platform deep link must
    // carry that conversation so remote-push taps land in the thread the
    // notification is about (approval requests, guardian questions).

    test("platform deep link carries the forge-created conversation in a mixed broadcast", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([
        forgeAdapter,
        platformAdapter,
      ]);

      pairingResultsByChannel = {
        forge: {
          conversationId: "conv-forge-created",
          messageId: "msg-forge-seed",
          strategy: "start_new_conversation",
          createdNewConversation: true,
          conversationFallbackUsed: false,
        },
        platform: {
          conversationId: null,
          messageId: null,
          strategy: "push_only",
          createdNewConversation: false,
          conversationFallbackUsed: false,
        },
      };

      // Sentinel source context (access-req-*) that resolves to no
      // conversation, so the forge carry is the only viable deep-link source.
      const signal = makeSignal({ sourceContextId: "access-req-123" });
      // Platform listed first to prove the forge-first ordering makes the
      // carry available regardless of selectedChannels order.
      const decision = makeDecision({
        selectedChannels: ["platform", "forge"],
        renderedCopy: {
          forge: { title: "Approval needed", body: "Allow file access?" },
          platform: { title: "Approval needed", body: "Allow file access?" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      // Forge unchanged: enriched from its own pairing.
      expect(forgeAdapter.sent).toHaveLength(1);
      expect(forgeAdapter.sent[0].deepLinkTarget?.conversationId).toBe(
        "conv-forge-created",
      );
      expect(forgeAdapter.sent[0].deepLinkTarget?.messageId).toBe(
        "msg-forge-seed",
      );

      // Platform carries the forge-created conversation and seed message.
      expect(platformAdapter.sent).toHaveLength(1);
      expect(platformAdapter.sent[0].deepLinkTarget?.conversationId).toBe(
        "conv-forge-created",
      );
      expect(platformAdapter.sent[0].deepLinkTarget?.messageId).toBe(
        "msg-forge-seed",
      );
    });

    test("platform prefers the forge pairing over the source-context fallback in a mixed broadcast", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([
        forgeAdapter,
        platformAdapter,
      ]);

      pairingResultsByChannel = {
        forge: {
          conversationId: "conv-approval-thread",
          messageId: "msg-approval-card",
          strategy: "start_new_conversation",
          createdNewConversation: true,
          conversationFallbackUsed: false,
        },
        platform: {
          conversationId: null,
          messageId: null,
          strategy: "push_only",
          createdNewConversation: false,
          conversationFallbackUsed: false,
        },
      };

      // The source context resolves to a real conversation, but the tap
      // should land in the created approval thread, not the source.
      const originConvId = "conv-source-of-signal";
      mockExistingConversations[originConvId] = { id: originConvId };

      const signal = makeSignal({ sourceContextId: originConvId });
      const decision = makeDecision({
        selectedChannels: ["forge", "platform"],
        renderedCopy: {
          forge: { title: "Question", body: "Approve?" },
          platform: { title: "Question", body: "Approve?" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      expect(platformAdapter.sent).toHaveLength(1);
      expect(platformAdapter.sent[0].deepLinkTarget?.conversationId).toBe(
        "conv-approval-thread",
      );
    });

    test("platform deep link carries the conversation from a duplicate forge delivery on retry", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([
        forgeAdapter,
        platformAdapter,
      ]);

      // Persisted-decision retry: the forge delivery row already exists
      // (with the paired conversation), so the forge channel skips as a
      // duplicate before any fresh pairing runs.
      existingDeliveriesByChannel = {
        forge: {
          id: "delivery-forge-existing",
          conversationId: "conv-from-existing-row",
          messageId: "msg-from-existing-row",
          conversationStrategy: "start_new_conversation",
        },
      };
      pairingResultsByChannel = {
        platform: {
          conversationId: null,
          messageId: null,
          strategy: "push_only",
          createdNewConversation: false,
          conversationFallbackUsed: false,
        },
      };

      // Sentinel source context (access-req-*) that resolves to no
      // conversation, so the duplicate-row carry is the only viable source.
      const signal = makeSignal({ sourceContextId: "access-req-retry-456" });
      const decision = makeDecision({
        persistedDecisionId: "decision-retry-001",
        selectedChannels: ["platform", "forge"],
        renderedCopy: {
          forge: { title: "Approval needed", body: "Allow file access?" },
          platform: { title: "Approval needed", body: "Allow file access?" },
        },
      });

      const results = await broadcaster.broadcastDecision(signal, decision);

      // Forge duplicate is skipped without re-sending.
      expect(forgeAdapter.sent).toHaveLength(0);
      const forgeResult = results.find((r) => r.channel === "forge");
      expect(forgeResult?.status).toBe("skipped");
      expect(forgeResult?.conversationId).toBe("conv-from-existing-row");

      // Platform still delivers, carrying the existing row's conversation.
      expect(platformAdapter.sent).toHaveLength(1);
      expect(platformAdapter.sent[0].deepLinkTarget?.conversationId).toBe(
        "conv-from-existing-row",
      );
      expect(platformAdapter.sent[0].deepLinkTarget?.messageId).toBe(
        "msg-from-existing-row",
      );
    });

    test("platform falls back to sourceContextId in a mixed broadcast when forge pairs no conversation", async () => {
      const forgeAdapter = new MockAdapter("forge");
      const platformAdapter = new MockAdapter("platform");
      const broadcaster = new NotificationBroadcaster([
        forgeAdapter,
        platformAdapter,
      ]);

      // Passive forge signal: pairing skips conversation creation.
      pairingResultsByChannel = {
        forge: {
          conversationId: null,
          messageId: null,
          strategy: "start_new_conversation",
          createdNewConversation: false,
          conversationFallbackUsed: false,
        },
        platform: {
          conversationId: null,
          messageId: null,
          strategy: "push_only",
          createdNewConversation: false,
          conversationFallbackUsed: false,
        },
      };

      const originConvId = "conv-passive-origin";
      mockExistingConversations[originConvId] = { id: originConvId };

      const signal = makeSignal({ sourceContextId: originConvId });
      const decision = makeDecision({
        selectedChannels: ["forge", "platform"],
        renderedCopy: {
          forge: { title: "Turn done", body: "Task finished" },
          platform: { title: "Turn done", body: "Task finished" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      expect(platformAdapter.sent).toHaveLength(1);
      expect(platformAdapter.sent[0].deepLinkTarget?.conversationId).toBe(
        originConvId,
      );
    });

    test("channels other than forge and platform do not receive deterministic enrichment", async () => {
      const telegramAdapter = new MockAdapter("telegram");
      const broadcaster = new NotificationBroadcaster([telegramAdapter]);

      nextPairingResult = {
        conversationId: "conv-telegram-paired",
        messageId: "msg-telegram-paired",
        strategy: "continue_existing_conversation" as const,
        createdNewConversation: true,
        conversationFallbackUsed: false,
      };

      const signal = makeSignal();
      const decision = makeDecision({
        selectedChannels: ["telegram"],
        renderedCopy: {
          telegram: { title: "Alert", body: "Body" },
        },
      });

      await broadcaster.broadcastDecision(signal, decision);

      expect(telegramAdapter.sent).toHaveLength(1);
      expect(telegramAdapter.sent[0].deepLinkTarget).toBeUndefined();
    });
  });
});
