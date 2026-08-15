import { afterEach, describe, expect, it } from "vitest";
import { __setDbForTests, setCommunitySourceState, storeGlobalMeshProbeReadings } from "./db";

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
});
