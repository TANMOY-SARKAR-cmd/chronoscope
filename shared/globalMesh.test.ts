import { describe, expect, it } from "vitest";
import { calculateBackoffMs, canTransitionCommunitySource, fuseGlobalTime, safePublicSourceLabel, selectProbeCohort, type GlobalMeshSource, type MeshProbeReading } from "./globalMesh";

const source = (id: string, overrides: Partial<GlobalMeshSource> = {}): GlobalMeshSource => ({ id, displayName: id, host: `${id}.example.net`, sourceClass: "community", state: "active", provenance: "verified_operator", verificationMethod: "dns_txt", publicMetadataOptIn: false, publicLabel: null, region: null, groupKey: id, lastProbeAtMs: null, consecutiveFailures: 0, nextEligibleAtMs: null, ...overrides });
const reading = (sourceId: string, offsetMs: number, overrides: Partial<MeshProbeReading> = {}): MeshProbeReading => ({ sourceId, sourceClass: "community", groupKey: sourceId, status: "reachable", offsetMs, delayMs: 12, uncertaintyMs: 2, sampledAtMs: 1, ...overrides });

describe("global source mesh", () => {
  it("selects only active and currently eligible sources, favoring the most overdue", () => {
    const cohort = selectProbeCohort([source("fresh", { lastProbeAtMs: 100 }), source("old", { lastProbeAtMs: 10 }), source("paused", { state: "paused" }), source("backoff", { nextEligibleAtMs: 1_000 })], 500, 2);
    expect(cohort.map(item => item.id)).toEqual(["old", "fresh"]);
  });

  it("uses bounded exponential backoff and excludes unsafe latency from fusion", () => {
    expect(calculateBackoffMs(0)).toBe(30_000);
    expect(calculateBackoffMs(1)).toBe(60_000);
    expect(calculateBackoffMs(20)).toBe(3_600_000);
    const result = fuseGlobalTime([reading("safe", 2), reading("slow", 3, { delayMs: 2_000 })]);
    expect(result.contributors).toEqual(["safe"]);
    expect(result.rejected).toContainEqual({ sourceId: "slow", reason: "high_delay" });
  });

  it("allows only safe community lifecycle transitions", () => {
    expect(canTransitionCommunitySource("pending", "paused")).toBe(false);
    expect(canTransitionCommunitySource("pending", "withdrawn")).toBe(true);
    expect(canTransitionCommunitySource("active", "paused")).toBe(true);
    expect(canTransitionCommunitySource("paused", "withdrawn")).toBe(true);
    expect(canTransitionCommunitySource("withdrawn", "withdrawn")).toBe(false);
  });

  it("rejects offset outliers and duplicate operator groups before fusion", () => {
    const result = fuseGlobalTime([reading("a", 1, { groupKey: "operator-a" }), reading("a-second", 1.1, { groupKey: "operator-a", uncertaintyMs: 4 }), reading("b", 2, { groupKey: "operator-b" }), reading("bad", 300, { groupKey: "operator-c" })]);
    expect(result.qualityState).toBe("degraded");
    expect(result.contributorCount).toBe(2);
    expect(result.contributors).toEqual(expect.arrayContaining(["a", "b"]));
    expect(result.rejected).toEqual(expect.arrayContaining([{ sourceId: "bad", reason: "outlier" }, { sourceId: "a-second", reason: "duplicate_group" }]));
    expect(result.fusedOffsetMs).toBeGreaterThan(1);
    expect(result.fusedOffsetMs).toBeLessThan(2);
  });

  it("marks a single contributor degraded and expands the uncertainty for disagreement", () => {
    const single = fuseGlobalTime([reading("only", 4)]);
    const disagreeing = fuseGlobalTime([reading("a", -8), reading("b", 8)]);
    expect(single.qualityState).toBe("degraded");
    expect(disagreeing.fusedUncertaintyMs).toBeGreaterThan(single.fusedUncertaintyMs ?? 0);
  });

  it("uses known ASN and regional diversity cautiously without rewarding unknown metadata", () => {
    const diverse = fuseGlobalTime([reading("a", 1, { asn: "AS1", regionCode: "EU" }), reading("b", 1.2, { asn: "AS2", regionCode: "NA" }), reading("c", 0.9, { asn: "AS3", regionCode: "AP" })]);
    const limited = fuseGlobalTime([reading("a", 1, { asn: "AS1", regionCode: "EU" }), reading("b", 1.2, { asn: "AS1", regionCode: "EU" }), reading("c", 0.9, { asn: "AS1", regionCode: "EU" })]);
    const unknown = fuseGlobalTime([reading("a", 1), reading("b", 1.2), reading("c", 0.9)]);
    expect(diverse.diversityState).toBe("diverse");
    expect(limited.diversityState).toBe("limited");
    expect(unknown.diversityState).toBe("unknown");
    expect(limited.fusedUncertaintyMs).toBeGreaterThan(diverse.fusedUncertaintyMs ?? 0);
  });

  it("does not expose a private community operator label", () => {
    expect(safePublicSourceLabel(source("private", { displayName: "Personal lab oscillator", publicLabel: "Lab" }))).toBe("Verified community source");
    expect(safePublicSourceLabel(source("public", { publicMetadataOptIn: true, publicLabel: "Open PPS lab" }))).toBe("Open PPS lab");
  });
});
