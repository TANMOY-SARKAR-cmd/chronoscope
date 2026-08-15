import { describe, expect, it } from "vitest";
import { buildFusionObservability, getFusionObservabilityBucketDuration } from "./fusionObservability";

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

  it("builds a privacy-safe historical timeline from persisted aggregate buckets", () => {
    const result = buildFusionObservability({
      range: "30d", generatedAtMs,
      sources: [{ id: "source-private", state: "active", groupKey: "cohort-a", asn: "AS64500", regionCode: "NA" }],
      readings: [], freshAttestationSourceIds: [], reviewStatuses: [],
      rollups: [
        { bucketStartMs: generatedAtMs - 2 * 86_400_000, bucketEndMs: generatedAtMs - 86_400_000, sampleCount: 6, reachableCount: 5, measuredCount: 5, medianDelayMs: 14, medianUncertaintyMs: 1.2, medianAbsoluteOffsetMs: 0.8, observedSourceCount: 3 },
        { bucketStartMs: generatedAtMs - 86_400_000, bucketEndMs: generatedAtMs, sampleCount: 4, reachableCount: 4, measuredCount: 4, medianDelayMs: 10, medianUncertaintyMs: 0.8, medianAbsoluteOffsetMs: 0.5, observedSourceCount: 2 },
      ],
      coverage: { mode: "persisted_rollup", availableBucketCount: 2, expectedBucketCount: 30, coveragePct: 6.67, observedFromMs: generatedAtMs - 2 * 86_400_000, partial: true },
    });
    expect(result.timeline).toHaveLength(2);
    expect(result.summary.sampleCount).toBe(10);
    expect(result.summary.reachableRatePct).toBe(90);
    expect(result.coverage).toMatchObject({ mode: "persisted_rollup", partial: true, availableBucketCount: 2 });
    expect(result.summary.caveats.join(" ")).toContain("Historical coverage is partial");
    expect(JSON.stringify(result)).not.toContain("source-private");
  });

  it("treats long-window roll-up coverage as partial instead of treating absent buckets as failures", () => {
    const result = buildFusionObservability({
      range: "90d", generatedAtMs, sources: [], readings: [], freshAttestationSourceIds: [], reviewStatuses: [], rollups: [],
      coverage: { mode: "persisted_rollup", availableBucketCount: 0, expectedBucketCount: 90, coveragePct: 0, observedFromMs: null, partial: false },
    });
    expect(result.summary.reachableRatePct).toBeNull();
    expect(result.coverage.coveragePct).toBe(0);
    expect(result.summary.caveats.join(" ")).toContain("No persisted aggregate buckets");
  });

  it("uses hour-level roll-ups for seven days and daily roll-ups for thirty and ninety days", () => {
    expect(getFusionObservabilityBucketDuration("7d")).toBe(6 * 60 * 60 * 1_000);
    expect(getFusionObservabilityBucketDuration("30d")).toBe(24 * 60 * 60 * 1_000);
    expect(getFusionObservabilityBucketDuration("90d")).toBe(24 * 60 * 60 * 1_000);
  });
});
