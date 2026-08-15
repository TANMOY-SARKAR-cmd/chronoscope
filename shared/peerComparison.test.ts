import { describe, expect, it } from "vitest";
import { buildInsightCsvRows, buildPeerComparisonPoint, filterPublicSetupsByTag, getTopComparisonSetups, normalizeLeaderboardTagFilter } from "./peerComparison";

const entries = [
  { setupLabel: "PPS bench", hardwareTags: ["GPSDO", "PPS"], stabilityScore: 93, offsetMs: 1.2, jitterMs: 0.1, uncertaintyMs: 0.4, sampleCount: 12 },
  { setupLabel: "OCXO rack", hardwareTags: ["OCXO"], stabilityScore: 96, offsetMs: -0.6, jitterMs: 0.2, uncertaintyMs: 0.5, sampleCount: 10 },
  { setupLabel: "Lab node", hardwareTags: ["GPSDO"], stabilityScore: 88, offsetMs: 0.4, jitterMs: 0.3, uncertaintyMs: 0.6, sampleCount: 8 },
];

describe("ChronoMesh public comparison contracts", () => {
  it("filters only explicit public tags using normalized exact matches", () => {
    expect(normalizeLeaderboardTagFilter("  GPSDO  ")).toBe("GPSDO");
    expect(filterPublicSetupsByTag(entries, "gpsdo").map(entry => entry.setupLabel)).toEqual(["PPS bench", "Lab node"]);
    expect(filterPublicSetupsByTag(entries, "GPS")).toEqual([]);
  });

  it("uses only consented public aggregates in the ordered comparison trace", () => {
    const leaders = getTopComparisonSetups(entries, 2);
    expect(leaders.map(entry => entry.setupLabel)).toEqual(["OCXO rack", "PPS bench"]);
    expect(buildPeerComparisonPoint(1000, -1.5, leaders)).toEqual({ timestamp: 1000, localOffsetMs: -1.5, leader_0: -0.6, leader_1: 1.2 });
  });

  it("serializes AI insight text and grounded evidence as distinct CSV rows", () => {
    const rows = buildInsightCsvRows({ generatedAt: 1, model: "test", analytics: { range: "24h" }, value: { summary: "Jitter is stable", jitterTrend: "stable", offsetAssessment: "no_clear_anomaly", limitation: "Aggregate data only", evidence: [{ source: "Cloudflare", metric: "jitterMs", value: 0.2 }] } }, "2026-01-01T00:00:00.000Z");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("Jitter is stable");
    expect(rows[4]).toEqual(["ai_jitter_evidence", "2026-01-01T00:00:00.000Z", "24h", "test", "Cloudflare:jitterMs", 0.2]);
  });
});

