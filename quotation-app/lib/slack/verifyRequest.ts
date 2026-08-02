import { createHmac, timingSafeEqual } from "crypto";

// Slack's standard request-signing scheme: https://api.slack.com/authentication/verifying-requests
// Must be checked against the raw request body — the caller is responsible
// for reading it via req.text() before any JSON/form parsing.
export function verifySlackRequest(params: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) throw new Error("SLACK_SIGNING_SECRET is not set");
  if (!params.timestampHeader || !params.signatureHeader) return false;

  // Reject requests older than 5 minutes — replay-attack protection, per
  // Slack's own recommendation.
  const timestamp = Number(params.timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 60 * 5) {
    return false;
  }

  const baseString = `v0:${params.timestampHeader}:${params.rawBody}`;
  const expectedSignature = `v0=${createHmac("sha256", secret).update(baseString).digest("hex")}`;

  const expected = Buffer.from(expectedSignature, "utf8");
  const actual = Buffer.from(params.signatureHeader, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
