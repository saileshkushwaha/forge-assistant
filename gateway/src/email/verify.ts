import { verifyForgeSignature } from "../http/forge-signature.js";

/**
 * Verify the Forge-Signature header sent by the Forge platform.
 *
 * The scheme itself lives in `http/forge-signature.ts`, shared with the
 * plugin webhook routes so one comparison serves both.
 */
export function verifyEmailWebhookSignature(
  headers: Headers,
  rawBody: string,
  webhookSecret: string,
): boolean {
  return verifyForgeSignature(headers, rawBody, webhookSecret);
}
