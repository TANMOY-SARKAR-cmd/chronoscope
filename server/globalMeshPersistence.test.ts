import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { __setDbForTests, decideSourceReviewApplication, recordVerifiedAttestation, setCommunitySourceState, storeGlobalMeshProbeReadings } from "./db";

afterEach(() => __setDbForTests(null));

describe("global source mesh persistence guards", () => {
  it("does not update an owner-scoped source when its lifecycle transition is invalid", async () => {
    const updates: unknown[] = [];
    const fakeDb = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ state: "pending" }] }) }) }), update: () => ({ set: (value: unknown) => { updates.push(value); return { where: async () => [{ affectedRows: 1 }] }; } }) };
    __setDbForTests(fakeDb as never);
    await expect(setCommunitySourceState(42, "community-source-123", "paused")).resolves.toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("persists a bounded next eligibility timestamp after a failed probe", async () => {
    const updates: Array<Record<string, unknown>> = []; let selectCall = 0;
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }), limit: async () => selectCall++ === 0 ? [{ consecutiveFailures: 0 }] : [] }) }) }),
      insert: () => ({ values: () => ({ onDuplicateKeyUpdate: async () => undefined }) }),
      update: () => ({ set: (value: Record<string, unknown>) => { updates.push(value); return { where: async () => [{ affectedRows: 1 }] }; } }),
    };
    __setDbForTests(fakeDb as never);
    await storeGlobalMeshProbeReadings([{ sourceId: "community-source-123", sourceClass: "community", groupKey: "operator", status: "unreachable", offsetMs: null, delayMs: null, uncertaintyMs: null, sampledAtMs: 10_000 }]);
    expect(updates[0]).toMatchObject({ consecutiveFailures: 1, nextEligibleAtMs: 70_000 });
  });

  it("rejects a signed-attestation replay when atomic challenge consumption loses the race", async () => {
    const nonce = "attestation-nonce"; const nonceHash = createHash("sha256").update(nonce).digest("hex"); let selectCall = 0;
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => selectCall++ === 0 ? [{ id: "challenge-123", installationId: "agent-123", sourceId: "source-123", nonceHash, expiresAtMs: Date.now() + 60_000, consumedAt: null }] : [{ id: "agent-123", revokedAt: null }] }) }) }),
      update: () => ({ set: () => ({ where: async () => [{ affectedRows: 0 }] }) }),
    };
    __setDbForTests(fakeDb as never);
    await expect(recordVerifiedAttestation({ installationId: "agent-123", challengeId: "challenge-123", nonce, envelopeHash: "evidence-hash", envelope: { protocolVersion: 1, challengeId: "challenge-123", sourceId: "source-123", sampledAtMs: Date.now(), offsetMs: 1, delayMs: 10, uncertaintyMs: 2, stratum: 2, agentVersion: "0.1.0", signatureBase64: "unused-in-persistence-test" } })).resolves.toEqual({ accepted: false, reason: "challenge_already_consumed" });
  });

  it("writes an auditable review transition before projecting the application state", async () => {
    const events: Array<Record<string, unknown>> = []; const updates: Array<Record<string, unknown>> = []; let sourceSelects = 0;
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => {
        sourceSelects += 1;
        return sourceSelects === 1 ? [{ sourceId: "community-source-123", status: "pending" }] : sourceSelects === 2 ? [{ id: "community-source-123", state: "active" }] : [];
      }, orderBy: () => ({ limit: async () => [] }) }) }) }),
      insert: () => ({ values: async (value: Record<string, unknown>) => { events.push(value); } }),
      update: () => ({ set: (value: Record<string, unknown>) => { updates.push(value); return { where: async () => [{ affectedRows: 1 }] }; } }),
    };
    __setDbForTests(fakeDb as never);
    await expect(decideSourceReviewApplication(7, { sourceId: "community-source-123", decision: "request_attestation", reasonCode: "fresh-evidence-needed", privateNote: "Review again after a fresh health report.", publicRationale: "A current signed health report is required." })).resolves.toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sourceId: "community-source-123", reviewerUserId: 7, priorState: "active", nextState: "pending", decision: "request_attestation", reasonCode: "fresh-evidence-needed", publicRationale: "A current signed health report is required." });
    expect(updates[0]).toMatchObject({ status: "needs_attestation", publicRationale: "A current signed health report is required." });
  });
});
