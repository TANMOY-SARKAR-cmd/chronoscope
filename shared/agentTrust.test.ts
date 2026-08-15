import { describe, expect, it } from "vitest";
import { deriveAttestationQualityBand, isAttestationFresh, isValidAgentPublicKey, sanitizePublicRationale, serializeAttestationPayload, sourceStateForReview } from "./agentTrust";

describe("community agent trust contracts", () => {
  it("serializes a stable signed payload without the signature", () => {
    const payload = serializeAttestationPayload({ id: "challenge_01", sourceId: "source_01", nonce: "nonce", expiresAtMs: 3_000 }, { protocolVersion: 1, challengeId: "challenge_01", sourceId: "source_01", sampledAtMs: 2_000, offsetMs: 1.25, delayMs: 12, uncertaintyMs: 4, stratum: 2, agentVersion: "0.1.0" });
    expect(payload).toContain('"challengeNonce":"nonce"');
    expect(payload).not.toContain("signature");
  });

  it("keeps freshness, quality, and public rationale conservative", () => {
    expect(isAttestationFresh(1_000, 1_000 + 86_400_000)).toBe(true);
    expect(isAttestationFresh(1_000, 1_000 + 86_400_001)).toBe(false);
    expect(deriveAttestationQualityBand({ delayMs: 250, uncertaintyMs: 50 })).toBe("healthy");
    expect(deriveAttestationQualityBand({ delayMs: 251, uncertaintyMs: 50 })).toBe("watch");
    expect(sanitizePublicRationale("  Stable   compact rationale  ")).toBe("Stable compact rationale");
  });

  it("validates standard Ed25519 public-key encoding and safe review outcomes", () => {
    expect(isValidAgentPublicKey("4au5QQaAG6IASddc2UJH36lZNhfEJUBzcQqeXdoeGNo=")).toBe(true);
    expect(isValidAgentPublicKey("not-a-key")).toBe(false);
    expect(sourceStateForReview("approve")).toBe("active");
    expect(sourceStateForReview("reject")).toBe("withdrawn");
  });
});
