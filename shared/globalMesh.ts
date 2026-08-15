export const GLOBAL_MESH_SOURCE_CLASSES = ["authority", "regional_pool", "official", "community"] as const;
export type GlobalMeshSourceClass = (typeof GLOBAL_MESH_SOURCE_CLASSES)[number];

export const GLOBAL_MESH_SOURCE_STATES = ["pending", "active", "paused", "quarantined", "withdrawn"] as const;
export type GlobalMeshSourceState = (typeof GLOBAL_MESH_SOURCE_STATES)[number];

export type SourceProvenance = "curated" | "verified_operator" | "operator_declared";
export type VerificationMethod = "none" | "dns_txt" | "https_token";

export type GlobalMeshSource = {
  id: string;
  displayName: string;
  host: string;
  sourceClass: GlobalMeshSourceClass;
  state: GlobalMeshSourceState;
  provenance: SourceProvenance;
  verificationMethod: VerificationMethod;
  publicMetadataOptIn: boolean;
  publicLabel: string | null;
  region: string | null;
  groupKey: string;
  lastProbeAtMs: number | null;
  consecutiveFailures: number;
  nextEligibleAtMs: number | null;
};

export type MeshProbeReading = {
  sourceId: string;
  sourceClass: GlobalMeshSourceClass;
  groupKey: string;
  status: "reachable" | "unreachable" | "blocked" | "quarantined";
  offsetMs: number | null;
  delayMs: number | null;
  uncertaintyMs: number | null;
  sampledAtMs: number;
  stratum?: number | null;
  detail?: string | null;
};

export type MeshRejectionReason = "not_active" | "unreachable" | "missing_measurement" | "high_delay" | "high_uncertainty" | "outlier" | "duplicate_group";
export type MeshRejection = { sourceId: string; reason: MeshRejectionReason };

export type MeshConsensus = {
  fusedOffsetMs: number | null;
  fusedUncertaintyMs: number | null;
  contributorCount: number;
  independentGroupCount: number;
  eligibleCount: number;
  rejectedCount: number;
  qualityState: "healthy" | "degraded" | "unavailable";
  contributors: string[];
  rejected: MeshRejection[];
};

const MAX_DELAY_MS = 1_200;
const MAX_UNCERTAINTY_MS = 600;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function finite(value: number | null): value is number { return typeof value === "number" && Number.isFinite(value); }

/**
 * Selects a bounded, fair cohort. It never expands an unbounded source registry into
 * an all-at-once UDP scan: overdue sources win, then selection rotates deterministically.
 */
export function selectProbeCohort(sources: GlobalMeshSource[], nowMs: number, limit = 24): GlobalMeshSource[] {
  const eligible = sources.filter(source => source.state === "active" && (!source.nextEligibleAtMs || source.nextEligibleAtMs <= nowMs));
  return eligible.sort((a, b) => {
    const left = a.lastProbeAtMs ?? 0; const right = b.lastProbeAtMs ?? 0;
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  }).slice(0, Math.max(1, Math.min(limit, 48)));
}

/** Builds an intentionally conservative fusion result from a source cohort. */
export function fuseGlobalTime(readings: MeshProbeReading[]): MeshConsensus {
  const rejected: MeshRejection[] = [];
  const eligible = readings.flatMap(reading => {
    if (reading.status !== "reachable") { rejected.push({ sourceId: reading.sourceId, reason: "unreachable" }); return []; }
    if (!finite(reading.offsetMs) || !finite(reading.delayMs) || !finite(reading.uncertaintyMs)) { rejected.push({ sourceId: reading.sourceId, reason: "missing_measurement" }); return []; }
    if (reading.delayMs > MAX_DELAY_MS) { rejected.push({ sourceId: reading.sourceId, reason: "high_delay" }); return []; }
    if (reading.uncertaintyMs > MAX_UNCERTAINTY_MS) { rejected.push({ sourceId: reading.sourceId, reason: "high_uncertainty" }); return []; }
    return [reading as MeshProbeReading & { offsetMs: number; delayMs: number; uncertaintyMs: number }];
  });
  if (!eligible.length) return { fusedOffsetMs: null, fusedUncertaintyMs: null, contributorCount: 0, independentGroupCount: 0, eligibleCount: 0, rejectedCount: rejected.length, qualityState: "unavailable", contributors: [], rejected };

  const midpoint = median(eligible.map(reading => reading.offsetMs));
  const mad = median(eligible.map(reading => Math.abs(reading.offsetMs - midpoint)));
  const outlierWindow = Math.max(8, mad * 4, median(eligible.map(reading => reading.uncertaintyMs)) * 3);
  const clustered = eligible.filter(reading => {
    const accepted = Math.abs(reading.offsetMs - midpoint) <= outlierWindow;
    if (!accepted) rejected.push({ sourceId: reading.sourceId, reason: "outlier" });
    return accepted;
  });

  const uniqueGroupReadings = new Map<string, typeof clustered[number]>();
  for (const reading of clustered) {
    const current = uniqueGroupReadings.get(reading.groupKey);
    if (!current || reading.uncertaintyMs < current.uncertaintyMs) {
      if (current) rejected.push({ sourceId: current.sourceId, reason: "duplicate_group" });
      uniqueGroupReadings.set(reading.groupKey, reading);
    } else rejected.push({ sourceId: reading.sourceId, reason: "duplicate_group" });
  }
  const contributors = Array.from(uniqueGroupReadings.values());
  if (!contributors.length) return { fusedOffsetMs: null, fusedUncertaintyMs: null, contributorCount: 0, independentGroupCount: 0, eligibleCount: eligible.length, rejectedCount: rejected.length, qualityState: "unavailable", contributors: [], rejected };
  const weighted = contributors.reduce((total, reading) => {
    const variance = Math.max(0.25, reading.uncertaintyMs ** 2 + (reading.delayMs / 2) ** 2);
    const weight = 1 / variance;
    return { offset: total.offset + reading.offsetMs * weight, weight: total.weight + weight };
  }, { offset: 0, weight: 0 });
  const fusedOffsetMs = weighted.offset / weighted.weight;
  const disagreement = contributors.length > 1 ? Math.sqrt(contributors.reduce((sum, reading) => sum + (reading.offsetMs - fusedOffsetMs) ** 2, 0) / contributors.length) : 0;
  const fusedUncertaintyMs = Math.sqrt(1 / weighted.weight) + disagreement;
  const qualityState = contributors.length >= 3 ? "healthy" : "degraded";
  return { fusedOffsetMs, fusedUncertaintyMs, contributorCount: contributors.length, independentGroupCount: contributors.length, eligibleCount: eligible.length, rejectedCount: rejected.length, qualityState, contributors: contributors.map(reading => reading.sourceId), rejected };
}

export function calculateBackoffMs(consecutiveFailures: number): number {
  return Math.min(3_600_000, 30_000 * 2 ** Math.min(7, Math.max(0, consecutiveFailures)));
}

export function canTransitionCommunitySource(current: GlobalMeshSourceState, next: "paused" | "withdrawn"): boolean {
  if (current === "withdrawn") return false;
  if (next === "withdrawn") return current === "pending" || current === "active" || current === "paused" || current === "quarantined";
  return current === "active" || current === "paused";
}

export function safePublicSourceLabel(source: Pick<GlobalMeshSource, "publicMetadataOptIn" | "publicLabel" | "displayName" | "sourceClass">): string {
  if (source.sourceClass === "community" && !source.publicMetadataOptIn) return "Verified community source";
  return source.publicLabel?.trim() || source.displayName;
}
