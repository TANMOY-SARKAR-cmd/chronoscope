export const FUSION_OBSERVABILITY_RANGES = ["6h", "24h", "7d", "30d", "90d"] as const;
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

/** Aggregate-only telemetry stored after raw probe snapshots age out of the short retention window. */
export type FusionObservabilityRollup = {
  bucketStartMs: number;
  bucketEndMs: number;
  sampleCount: number;
  reachableCount: number;
  measuredCount: number;
  medianDelayMs: number | null;
  medianUncertaintyMs: number | null;
  medianAbsoluteOffsetMs: number | null;
  observedSourceCount: number;
};

export type FusionObservabilityCoverage = {
  mode: "raw" | "persisted_rollup";
  availableBucketCount: number;
  expectedBucketCount: number;
  coveragePct: number | null;
  observedFromMs: number | null;
  partial: boolean;
};

export type FusionObservabilityInput = {
  range: FusionObservabilityRange;
  generatedAtMs: number;
  sources: FusionObservabilitySource[];
  readings: FusionObservabilityReading[];
  freshAttestationSourceIds: string[];
  reviewStatuses: Array<"pending" | "needs_attestation" | "approved" | "rejected" | "withdrawn">;
  rollups?: FusionObservabilityRollup[];
  coverage?: FusionObservabilityCoverage;
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
  coverage: FusionObservabilityCoverage;
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

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const RANGE_MS: Record<FusionObservabilityRange, number> = {
  "6h": 6 * HOUR_MS,
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

export function getFusionObservabilityWindowStart(range: FusionObservabilityRange, generatedAtMs: number): number {
  return generatedAtMs - RANGE_MS[range];
}

export function getFusionObservabilityBucketDuration(range: FusionObservabilityRange): number {
  return range === "6h" || range === "24h" ? HOUR_MS : range === "7d" ? 6 * HOUR_MS : DAY_MS;
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

function emptyReviewCounts(): Record<"pending" | "needs_attestation" | "approved" | "rejected" | "withdrawn", number> {
  return { pending: 0, needs_attestation: 0, approved: 0, rejected: 0, withdrawn: 0 };
}

function contextForSources(sources: FusionObservabilitySource[], observedSourceIds?: Set<string>) {
  const observedSources = observedSourceIds
    ? Array.from(observedSourceIds).map(sourceId => sources.find(source => source.id === sourceId)).filter((source): source is FusionObservabilitySource => Boolean(source))
    : sources.filter(source => source.state === "active");
  const knownMetadata = observedSources.filter(source => Boolean(source.asn?.trim() || source.regionCode?.trim()));
  const groupCounts = new Map<string, number>();
  for (const source of observedSources) groupCounts.set(source.groupKey, (groupCounts.get(source.groupKey) ?? 0) + 1);
  const largestGroupCount = Math.max(0, ...Array.from(groupCounts.values()));
  const largestObservedGroupSharePct = observedSources.length ? (largestGroupCount / observedSources.length) * 100 : null;
  const independenceMetadataCoveragePct = observedSources.length ? (knownMetadata.length / observedSources.length) * 100 : null;
  const correlationRisk: FusionObservability["summary"]["correlationRisk"] = largestObservedGroupSharePct === null || independenceMetadataCoveragePct === 0
    ? "unknown"
    : largestObservedGroupSharePct >= 80 ? "elevated"
      : largestObservedGroupSharePct >= 60 ? "moderate"
        : "low";
  return { observedSources, independenceMetadataCoveragePct, largestObservedGroupSharePct, correlationRisk };
}

function reviewCountsFor(statuses: FusionObservabilityInput["reviewStatuses"]) {
  const reviewCounts = emptyReviewCounts();
  for (const status of statuses) reviewCounts[status] += 1;
  return reviewCounts;
}

function defaultCoverage(range: FusionObservabilityRange, generatedAtMs: number, pointCount: number): FusionObservabilityCoverage {
  const expectedBucketCount = Math.ceil(RANGE_MS[range] / getFusionObservabilityBucketDuration(range));
  return { mode: "raw", availableBucketCount: pointCount, expectedBucketCount, coveragePct: pointCount ? Math.min(100, (pointCount / expectedBucketCount) * 100) : 0, observedFromMs: null, partial: pointCount > 0 && pointCount < expectedBucketCount };
}

function buildRollupObservability(input: FusionObservabilityInput, windowStartMs: number, rollups: FusionObservabilityRollup[]): FusionObservability {
  const selected = rollups.filter(rollup => rollup.bucketEndMs > windowStartMs && rollup.bucketStartMs <= input.generatedAtMs).sort((left, right) => left.bucketStartMs - right.bucketStartMs);
  const sampleCount = selected.reduce((total, rollup) => total + rollup.sampleCount, 0);
  const reachableCount = selected.reduce((total, rollup) => total + rollup.reachableCount, 0);
  const coverage = input.coverage ?? defaultCoverage(input.range, input.generatedAtMs, selected.length);
  const sourceContext = contextForSources(input.sources);
  const caveats: string[] = [];
  if (!selected.length) caveats.push("No persisted aggregate buckets fall inside the selected window.");
  if (coverage.partial) caveats.push("Historical coverage is partial; missing buckets are not treated as source failures.");
  caveats.push("Long-window medians are medians of persisted bucket medians, not exact sample-level medians.");
  if (sourceContext.observedSources.length && sourceContext.independenceMetadataCoveragePct !== null && sourceContext.independenceMetadataCoveragePct < 100) caveats.push("ASN or coarse-region metadata is incomplete, so correlation risk may be understated.");
  if (!input.freshAttestationSourceIds.length) caveats.push("No fresh signed operator attestations are available in this view.");
  return {
    range: input.range,
    generatedAtMs: input.generatedAtMs,
    windowStartMs,
    coverage,
    summary: {
      activeSourceCount: input.sources.filter(source => source.state === "active").length,
      observedSourceCount: selected.length ? Math.max(...selected.map(rollup => rollup.observedSourceCount)) : 0,
      sampleCount,
      reachableRatePct: sampleCount ? (reachableCount / sampleCount) * 100 : null,
      medianDelayMs: median(selected.map(rollup => rollup.medianDelayMs).filter(finite)),
      medianUncertaintyMs: median(selected.map(rollup => rollup.medianUncertaintyMs).filter(finite)),
      medianAbsoluteOffsetMs: median(selected.map(rollup => rollup.medianAbsoluteOffsetMs).filter(finite)),
      freshAttestedSourceCount: new Set(input.freshAttestationSourceIds).size,
      reviewCounts: reviewCountsFor(input.reviewStatuses),
      independenceMetadataCoveragePct: sourceContext.independenceMetadataCoveragePct,
      largestObservedGroupSharePct: sourceContext.largestObservedGroupSharePct,
      correlationRisk: sourceContext.correlationRisk,
      caveats,
    },
    timeline: selected.map(rollup => ({
      bucketStartMs: rollup.bucketStartMs,
      sampleCount: rollup.sampleCount,
      reachableRatePct: rollup.sampleCount ? (rollup.reachableCount / rollup.sampleCount) * 100 : null,
      medianDelayMs: rollup.medianDelayMs,
      medianUncertaintyMs: rollup.medianUncertaintyMs,
      medianAbsoluteOffsetMs: rollup.medianAbsoluteOffsetMs,
      observedSourceCount: rollup.observedSourceCount,
    })),
  };
}

/**
 * Produces aggregate observability only. It intentionally excludes hostnames, source labels,
 * contributor identities, reviewer notes, signed attestations, and raw peer measurements.
 */
export function buildFusionObservability(input: FusionObservabilityInput): FusionObservability {
  const windowStartMs = getFusionObservabilityWindowStart(input.range, input.generatedAtMs);
  if (input.rollups) return buildRollupObservability(input, windowStartMs, input.rollups);
  const readings = input.readings.filter(reading => reading.sampledAtMs >= windowStartMs && reading.sampledAtMs <= input.generatedAtMs);
  const observedSourceIds = new Set(readings.map(reading => reading.sourceId));
  const reachable = readings.filter(reading => reading.status === "reachable");
  const measurementReady = reachable.filter(reading => finite(reading.delayMs) && finite(reading.uncertaintyMs) && finite(reading.offsetMs));
  const sourceContext = contextForSources(input.sources, observedSourceIds);
  const caveats: string[] = [];
  if (!readings.length) caveats.push("No probe samples fall inside the selected window.");
  if (sourceContext.observedSources.length && sourceContext.independenceMetadataCoveragePct !== null && sourceContext.independenceMetadataCoveragePct < 100) caveats.push("ASN or coarse-region metadata is incomplete, so correlation risk may be understated.");
  if (sourceContext.observedSources.length && sourceContext.observedSources.length < 3) caveats.push("Fewer than three observed sources limits independent-consensus confidence.");
  if (!input.freshAttestationSourceIds.length) caveats.push("No fresh signed operator attestations are available in this view.");
  const duration = getFusionObservabilityBucketDuration(input.range);
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
    coverage: input.coverage ?? defaultCoverage(input.range, input.generatedAtMs, timeline.length),
    summary: {
      activeSourceCount: input.sources.filter(source => source.state === "active").length,
      observedSourceCount: sourceContext.observedSources.length,
      sampleCount: readings.length,
      reachableRatePct: readings.length ? (reachable.length / readings.length) * 100 : null,
      medianDelayMs: median(measurementReady.map(reading => reading.delayMs as number)),
      medianUncertaintyMs: median(measurementReady.map(reading => reading.uncertaintyMs as number)),
      medianAbsoluteOffsetMs: median(measurementReady.map(reading => Math.abs(reading.offsetMs as number))),
      freshAttestedSourceCount: new Set(input.freshAttestationSourceIds).size,
      reviewCounts: reviewCountsFor(input.reviewStatuses),
      independenceMetadataCoveragePct: sourceContext.independenceMetadataCoveragePct,
      largestObservedGroupSharePct: sourceContext.largestObservedGroupSharePct,
      correlationRisk: sourceContext.correlationRisk,
      caveats,
    },
    timeline,
  };
}
