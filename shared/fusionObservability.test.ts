import { describe, expect, it } from "vitest";
import { buildFusionObservability } from "./fusionObservability";

const generatedAtMs = 1_700_000_000_000;

describe("Fusion Observability", () => {
  it("projects aggregate health without returning source identifiers or raw readings", () => {
    const result = buildFusionObservability({
      range: "24h", generatedAtMs,
      sources: [
        { id: "private-source-a", state: "active", groupKey: "group-a", asn: "AS64500", regionCode: "NA" },
        { id: "private-source-b", state: "active", groupKey: "group-b", asn: "AS64501", regionCode: "EU" },
      ],
      readings: [
        { sourceId: "private-source-a", status: "reachable", offsetMs: 1.25, delayMs: 8, uncertaintyMs: 0.9, sampledAtMs: generatedAtMs - 1_000 },
        { sourceId: "private-source-b", status: "reachable", offsetMs: -2.25, delayMs: 12, uncertaintyMs: 1.1, sampledAtMs: generatedAtMs - 2_000 },
      ],
      freshAttestationSourceIds: ["private-source-a"],
      reviewStatuses: ["pending", "approved"],
    });
    expect(result.summary.observedSourceCount).toBe(2);
    expect(result.summary.medianAbsoluteOffsetMs).toBe(1.75);
    expect(result.summary.independenceMetadataCoveragePct).toBe(100);
    expect(JSON.stringify(result)).not.toContain("private-source-a");
    expect(JSON.stringify(result)).not.toContain("AS64500");
  });

  it("excludes samples outside the selected time range", () => {
    const result = buildFusionObservability({
      range: "6h", generatedAtMs,
      sources: [{ id: "s1", state: "active", groupKey: "g1", asn: "AS1", regionCode: "NA" }],
      readings: [
        { sourceId: "s1", status: "reachable", offsetMs: 1, delayMs: 4, uncertaintyMs: 1, sampledAtMs: generatedAtMs - 60_000 },
        { sourceId: "s1", status: "reachable", offsetMs: 9, delayMs: 99, uncertaintyMs: 9, sampledAtMs: generatedAtMs - 7 * 60 * 60 * 1_000 },
      ],
      freshAttestationSourceIds: [], reviewStatuses: [],
    });
    expect(result.summary.sampleCount).toBe(1);
    expect(result.summary.medianDelayMs).toBe(4);
  });

  it("flags missing independence metadata and concentrated cohorts instead of making an accuracy claim", () => {
    const missingMetadata = buildFusionObservability({
      range: "24h", generatedAtMs,
      sources: [{ id: "s1", state: "active", groupKey: "shared", asn: null, regionCode: null }],
      readings: [{ sourceId: "s1", status: "reachable", offsetMs: 0, delayMs: 2, uncertaintyMs: 0.5, sampledAtMs: generatedAtMs - 1_000 }],
      freshAttestationSourceIds: [], reviewStatuses: [],
    });
    expect(missingMetadata.summary.correlationRisk).toBe("unknown");
    expect(missingMetadata.summary.caveats.join(" ")).toContain("metadata is incomplete");

    const concentrated = buildFusionObservability({
      range: "24h", generatedAtMs,
      sources: ["a", "b", "c", "d", "e"].map((id, index) => ({ id, state: "active" as const, groupKey: index < 4 ? "shared" : "independent", asn: `AS${index}`, regionCode: "NA" })),
      readings: ["a", "b", "c", "d", "e"].map(sourceId => ({ sourceId, status: "reachable" as const, offsetMs: 0, delayMs: 2, uncertaintyMs: 0.5, sampledAtMs: generatedAtMs - 1_000 })),
      freshAttestationSourceIds: [], reviewStatuses: [],
    });
    expect(concentrated.summary.correlationRisk).toBe("elevated");
    expect(concentrated.summary.largestObservedGroupSharePct).toBe(80);
  });
});
