import { describe, expect, it } from "vitest";
import { isValidRelayReport, resolveRelayTransport, shouldApplyRemoteRelay } from "./realtimeGuards";

const report = { id: "P-AB12CD", offsetMs: 1, uncertaintyMs: 2, jitterMs: 0.5, sampleCount: 10, updatedAt: 1_700_000_000_000, tags: ["GPSDO"], description: null };

describe("ChronoMesh relay safeguards", () => {
  it("selects managed transport when available and otherwise retains database or single-instance fallbacks", () => {
    expect(resolveRelayTransport("auto", true)).toBe("managed");
    expect(resolveRelayTransport("auto", false)).toBe("database");
    expect(resolveRelayTransport("database", true)).toBe("database");
    expect(resolveRelayTransport("single", true)).toBe("single");
  });

  it("rejects self echoes and malformed or oversized remote reports", () => {
    expect(shouldApplyRemoteRelay({ originId: "remote", peerId: report.id, payload: report }, "local", "P-LOCAL")).toBe(true);
    expect(shouldApplyRemoteRelay({ originId: "local", peerId: report.id, payload: report }, "local", "P-OTHER")).toBe(false);
    expect(shouldApplyRemoteRelay({ originId: "remote", peerId: report.id, payload: report }, "local", report.id)).toBe(false);
    expect(isValidRelayReport({ ...report, id: "P-X", tags: Array(6).fill("tag") }, "P-X")).toBe(false);
    expect(isValidRelayReport({ ...report, description: "x".repeat(4_000) }, report.id)).toBe(false);
  });
});
