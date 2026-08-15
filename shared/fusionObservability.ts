export const FUSION_OBSERVABILITY_RANGES = ["6h", "24h", "7d"] as const;
export type FusionObservabilityRange = (typeof FUSION_OBSERVABILITY_RANGES)[number];

export type FusionObservabilitySource = {
  id: string;
  state: "pending" | "active" | "paused" | "quarantined" | "withdrawn";
  groupKey: string;
  asn: string | null;
  regionCode: string | null;
};

export type FusionObservabilityReading = {
  sourceId: string;
  status: "reachable" | "unreachable" | "blocked" | "quarantined";
  offsetMs: number | null;
  delayMs: number | null;
  uncertaintyMs: number | null;
  sampledAtMs: number;
};

export type FusionObservabilityInput = {
  range: FusionObservabilityRange;
  generatedAtMs: number;
  sources: FusionObservabilitySource[];
  readings: FusionObservabilityReading[];
  freshAttestationSourceIds: string[];
  reviewStatuses: Array<"pending" | "needs_attestation" | "approved" | "rejected" | "withdrawn">;
};

export type FusionObservabilityTimelinePoint = {
  bucketStartMs: number;
  sampleCount: number;
  reachableRatePct: number | null;
  medianDelayMs: number | null;
  medianUncertaintyMs: number | null;
  medianAbsoluteOffsetMs: number | null;
  observedSourceCount: number;
};

export type FusionObservability = {
  range: FusionObservabilityRange;
  generatedAtMs: number;
  windowStartMs: number;
  summary: {
    activeSourceCount: number;
    observedSourceCount: number;
    sampleCount: number;
    reachableRatePct: number | null;
    medianDelayMs: number | null;
    medianUncertaintyMs: number | null;
    medianAbsoluteOffsetMs: number | null;
    freshAttestedSourceCount: number;
    reviewCounts: Record<"pending" | "needs_attestation" | "approved" | "rejected" | "withdrawn", number>;
    independenceMetadataCoveragePct: number | null;
    largestObservedGroupSharePct: number | null;
    correlationRisk: "unknown" | "elevated" | "moderate" | "low";
    caveats: string[];
  };
  timeline: FusionObservabilityTimelinePoint[];
};

const RANGE_MS: Record<FusionObservabilityRange, number> = {
  "6h": 6 * 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
};

export function getFusionObservabilityWindowStart(range: FusionObservabilityRange, generatedAtMs: number): number {
  return generatedAtMs - RANGE_MS[range];
}

function finite(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function bucketDuration(range: FusionObservabilityRange): number {
  return range === "7d" ? 6 * 60 * 60 * 1_000 : 60 * 60 * 1_000;
}

function emptyReviewCounts(): Record<"pending" | "needs_attestation" | "approved" | "rejected" | "withdrawn", number> {
  return { pending: 0, needs_attestation: 0, approved: 0, rejected: 0, withdrawn: 0 };
}

/**
 * Produces aggregate observability only. It intentionally excludes hostnames, source labels,
 * contributor identities, reviewer notes, signed attestations, and raw peer measurements.
 */
export function buildFusionObservability(input: FusionObservabilityInput): FusionObservability {
  const windowStartMs = getFusionObservabilityWindowStart(input.range, input.generatedAtMs);
  const sourcesById = new Map(input.sources.map(source => [source.id, source]));
  const readings = input.readings.filter(reading => reading.sampledAtMs >= windowStartMs && reading.sampledAtMs <= input.generatedAtMs);
  const observedSourceIds = new Set(readings.map(reading => reading.sourceId));
  const reachable = readings.filter(reading => reading.status === "reachable");
  const measurementReady = reachable.filter(reading => finite(reading.delayMs) && finite(reading.uncertaintyMs) && finite(reading.offsetMs));
  const observedSources = Array.from(observedSourceIds).map(sourceId => sourcesById.get(sourceId)).filter((source): source is FusionObservabilitySource => Boolean(source));
  const knownMetadata = observedSources.filter(source => Boolean(source.asn?.trim() || source.regionCode?.trim()));
  const groupCounts = new Map<string, number>();
  for (const source of observedSources) groupCounts.set(source.groupKey, (groupCounts.get(source.groupKey) ?? 0) + 1);
  const largestGroupCount = Math.max(0, ...Array.from(groupCounts.values()));
  const largestObservedGroupSharePct = observedSources.length ? (largestGroupCount / observedSources.length) * 100 : null;
  const independenceMetadataCoveragePct = observedSources.length ? (knownMetadata.length / observedSources.length) * 100 : null;
  const correlationRisk = largestObservedGroupSharePct === null || independenceMetadataCoveragePct === 0
    ? "unknown"
    : largestObservedGroupSharePct >= 80 ? "elevated"
      : largestObservedGroupSharePct >= 60 ? "moderate"
        : "low";
  const caveats: string[] = [];
  if (!readings.length) caveats.push("No probe samples fall inside the selected window.");
  if (observedSources.length && independenceMetadataCoveragePct !== null && independenceMetadataCoveragePct < 100) caveats.push("ASN or coarse-region metadata is incomplete, so correlation risk may be understated.");
  if (observedSources.length && observedSources.length < 3) caveats.push("Fewer than three observed sources limits independent-consensus confidence.");
  if (!input.freshAttestationSourceIds.length) caveats.push("No fresh signed operator attestations are available in this view.");

  const reviewCounts = emptyReviewCounts();
  for (const status of input.reviewStatuses) reviewCounts[status] += 1;
  const duration = bucketDuration(input.range);
  const buckets = new Map<number, FusionObservabilityReading[]>();
  for (const reading of readings) {
    const bucketStartMs = Math.floor(reading.sampledAtMs / duration) * duration;
    const entries = buckets.get(bucketStartMs) ?? [];
    entries.push(reading);
    buckets.set(bucketStartMs, entries);
  }
  const timeline = Array.from(buckets.entries()).sort(([left], [right]) => left - right).map(([bucketStartMs, entries]) => {
    const bucketReachable = entries.filter(entry => entry.status === "reachable");
    const bucketMeasured = bucketReachable.filter(entry => finite(entry.delayMs) && finite(entry.uncertaintyMs) && finite(entry.offsetMs));
    return {
      bucketStartMs,
      sampleCount: entries.length,
      reachableRatePct: entries.length ? (bucketReachable.length / entries.length) * 100 : null,
      medianDelayMs: median(bucketMeasured.map(entry => entry.delayMs as number)),
      medianUncertaintyMs: median(bucketMeasured.map(entry => entry.uncertaintyMs as number)),
      medianAbsoluteOffsetMs: median(bucketMeasured.map(entry => Math.abs(entry.offsetMs as number))),
      observedSourceCount: new Set(entries.map(entry => entry.sourceId)).size,
    };
  });

  return {
    range: input.range,
    generatedAtMs: input.generatedAtMs,
    windowStartMs,
    summary: {
      activeSourceCount: input.sources.filter(source => source.state === "active").length,
      observedSourceCount: observedSources.length,
      sampleCount: readings.length,
      reachableRatePct: readings.length ? (reachable.length / readings.length) * 100 : null,
      medianDelayMs: median(measurementReady.map(reading => reading.delayMs as number)),
      medianUncertaintyMs: median(measurementReady.map(reading => reading.uncertaintyMs as number)),
      medianAbsoluteOffsetMs: median(measurementReady.map(reading => Math.abs(reading.offsetMs as number))),
      freshAttestedSourceCount: new Set(input.freshAttestationSourceIds).size,
      reviewCounts,
      independenceMetadataCoveragePct,
      largestObservedGroupSharePct,
      correlationRisk,
      caveats,
    },
    timeline,
  };
}
