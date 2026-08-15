import { getGlobalMeshLatestReadings, getGlobalMeshQualitySummaries, getGlobalMeshSources, seedGlobalMeshSources, storeGlobalMeshProbeReadings } from "./db";
import { CONTROLLED_TIME_SOURCES, queryRegisteredNtpSource } from "./ntp";
import { fuseGlobalTime, selectProbeCohort, type MeshConsensus, type MeshProbeReading } from "../shared/globalMesh";

const REFRESH_TTL_MS = 45_000;
export type GlobalSourceMeshResult = {
  generatedAt: number;
  consensus: MeshConsensus;
  sourceCounts: { configured: number; active: number; pending: number; paused: number; quarantined: number };
  sources: Array<{ id: string; displayName: string; sourceClass: string; state: string; provenance: string; publicLabel: string | null; region: string | null; lastProbeAtMs: number | null; quality: { reachableSamples: number; totalSamples: number; medianUncertaintyMs: number | null; medianDelayMs: number | null } | null }>;
  readings: MeshProbeReading[];
};
let cached: { value: GlobalSourceMeshResult; expiresAt: number } | null = null;

/**
 * Refreshes a bounded rotating cohort. This is intentionally query-triggered and cache
 * protected until a deployed project-level scheduler is enabled; it does not use timers.
 */
export async function getGlobalSourceMesh(force = false): Promise<GlobalSourceMeshResult> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  await seedGlobalMeshSources(CONTROLLED_TIME_SOURCES);
  const sources = await getGlobalMeshSources();
  const cohort = selectProbeCohort(sources, Date.now(), 24);
  const readings: MeshProbeReading[] = await Promise.all(cohort.map(async source => {
    const health = await queryRegisteredNtpSource(source);
    return { sourceId: source.id, sourceClass: source.sourceClass, groupKey: source.groupKey, status: health.status, detail: health.detail ?? null, offsetMs: health.offsetMs, delayMs: health.delayMs, uncertaintyMs: health.uncertaintyMs, sampledAtMs: health.sampledAt };
  }));
  if (readings.length) await storeGlobalMeshProbeReadings(readings);
  const latestSources = await getGlobalMeshSources();
  const latestReadings = await getGlobalMeshLatestReadings(latestSources.map(source => source.id));
  const qualityBySource = await getGlobalMeshQualitySummaries(latestSources.map(source => source.id));
  const consensus = fuseGlobalTime(latestReadings);
  const value = {
    generatedAt: Date.now(),
    consensus,
    sourceCounts: {
      configured: latestSources.length,
      active: latestSources.filter(source => source.state === "active").length,
      pending: latestSources.filter(source => source.state === "pending").length,
      paused: latestSources.filter(source => source.state === "paused").length,
      quarantined: latestSources.filter(source => source.state === "quarantined").length,
    },
    sources: latestSources.map(source => { const quality = qualityBySource.get(source.id); return { id: source.id, displayName: source.publicMetadataOptIn || source.sourceClass !== "community" ? source.displayName : "Verified community source", sourceClass: source.sourceClass, state: source.state, provenance: source.provenance, publicLabel: source.publicMetadataOptIn ? source.publicLabel : null, region: source.region, lastProbeAtMs: source.lastProbeAtMs, quality: quality ? { reachableSamples: quality.reachableSamples, totalSamples: quality.totalSamples, medianUncertaintyMs: quality.medianUncertaintyMs, medianDelayMs: quality.medianDelayMs } : null }; }),
    readings: latestReadings,
  };
  cached = { value, expiresAt: Date.now() + REFRESH_TTL_MS };
  return value;
}

export function clearGlobalSourceMeshCache() { cached = null; }
