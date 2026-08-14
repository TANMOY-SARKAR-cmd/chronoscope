import { median, standardDeviation } from "./timeMath";

export type SourceSnapshotInput = {
  authority: string;
  status: "reachable" | "unreachable";
  offsetMs: number | null;
  uncertaintyMs: number | null;
  sampledAtMs: number;
};

export type SourceAccuracyRange = "24h" | "7d" | "30d";

const RANGE_MS: Record<SourceAccuracyRange, number> = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };
const BUCKET_MS: Record<SourceAccuracyRange, number> = { "24h": 3_600_000, "7d": 21_600_000, "30d": 86_400_000 };

export function getSourceRangeStart(range: SourceAccuracyRange, now = Date.now()) { return now - RANGE_MS[range]; }

export function aggregateSourceAccuracy(snapshots: SourceSnapshotInput[], sourceNames: Map<string, string>, range: SourceAccuracyRange) {
  const sourceGroups = new Map<string, SourceSnapshotInput[]>();
  const buckets = new Map<number, SourceSnapshotInput[]>();
  const bucketMs = BUCKET_MS[range];
  for (const snapshot of snapshots) {
    const group = sourceGroups.get(snapshot.authority) ?? [];
    group.push(snapshot); sourceGroups.set(snapshot.authority, group);
    const bucket = Math.floor(snapshot.sampledAtMs / bucketMs) * bucketMs;
    const bucketSnapshots = buckets.get(bucket) ?? [];
    bucketSnapshots.push(snapshot); buckets.set(bucket, bucketSnapshots);
  }

  const sources = Array.from(sourceGroups.entries()).map(([id, values]) => {
    const reachable = values.filter(value => value.status === "reachable");
    const offsets = reachable.flatMap(value => value.offsetMs === null ? [] : [value.offsetMs]);
    const uncertainty = reachable.flatMap(value => value.uncertaintyMs === null ? [] : [value.uncertaintyMs]);
    return {
      id,
      name: sourceNames.get(id) ?? id,
      samples: values.length,
      availabilityPct: values.length ? (reachable.length / values.length) * 100 : 0,
      medianOffsetMs: offsets.length ? median(offsets) : null,
      jitterMs: offsets.length > 1 ? standardDeviation(offsets) : null,
      medianUncertaintyMs: uncertainty.length ? median(uncertainty) : null,
      lastSampledAt: Math.max(...values.map(value => value.sampledAtMs)),
    };
  }).sort((a, b) => b.availabilityPct - a.availabilityPct || a.name.localeCompare(b.name));

  const timeline = Array.from(buckets.entries()).sort(([a], [b]) => a - b).map(([timestamp, values]) => {
    const reachable = values.filter(value => value.status === "reachable");
    const offsets = reachable.flatMap(value => value.offsetMs === null ? [] : [value.offsetMs]);
    const uncertainty = reachable.flatMap(value => value.uncertaintyMs === null ? [] : [value.uncertaintyMs]);
    return {
      timestamp,
      availabilityPct: values.length ? (reachable.length / values.length) * 100 : 0,
      medianOffsetMs: offsets.length ? median(offsets) : null,
      medianUncertaintyMs: uncertainty.length ? median(uncertainty) : null,
      samples: values.length,
    };
  });

  return { sources, timeline };
}
