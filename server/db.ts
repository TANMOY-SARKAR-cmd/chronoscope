import { and, desc, eq, gt, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { InsertUser, fusionObservabilityRollups, globalSourceProbeSnapshots, globalSourceQualitySummaries, globalTimeSources, ntpHealthSnapshots, operatorAgentInstallations, operatorAttestationChallenges, operatorHealthAttestations, publicStabilityEntries, roomRelayEvents, sourceNetworkMetadata, sourceReviewApplications, sourceReviewEvents, timeMeasurements, timeSources, userChronoPreferences, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateStabilityScore, type SyncEstimate } from "../shared/timeMath";
import type { TimeSource, UpstreamHealth } from "./ntp";
import { aggregateSourceAccuracy, getSourceRangeStart, type SourceAccuracyRange } from "../shared/sourceAnalytics";
import { filterPublicSetupsByTag, normalizeLeaderboardTagFilter } from "../shared/peerComparison";
import { calculateBackoffMs, canTransitionCommunitySource, type GlobalMeshSource, type MeshProbeReading } from "../shared/globalMesh";
import { ATTESTATION_CHALLENGE_TTL_MS, deriveAttestationQualityBand, isAttestationFresh, sanitizePublicRationale, sourceStateForReview, type AgentAttestationEnvelope, type AgentPlatform, type PublicSourceApplication, type SourceNetworkMetadata, type SourceReviewDecision } from "../shared/agentTrust";
import { buildFusionObservability, getFusionObservabilityBucketDuration, getFusionObservabilityWindowStart, type FusionObservabilityRange } from "../shared/fusionObservability";

let _db: ReturnType<typeof drizzle> | null = null;
export function __setDbForTests(db: ReturnType<typeof drizzle> | null) { _db = db; }
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) { try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; } }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb(); if (!db) return;
  const values: InsertUser = { openId: user.openId }; const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function storeMeasurementBurst(input: { sessionId: string; burstId: string; roomCode?: string | null; estimate: SyncEstimate }) {
  const db = await getDb(); if (!db || input.estimate.samples.length === 0) return false;
  await db.insert(timeMeasurements).values(input.estimate.samples.map(sample => ({ sessionId: input.sessionId, burstId: input.burstId, roomCode: input.roomCode ?? null, sampleIndex: sample.sampleIndex, clientSentMs: sample.t1, serverReceivedMs: sample.t2, serverSentMs: sample.t3, clientReceivedMs: sample.t4, offsetMs: sample.offsetMs, delayMs: sample.delayMs, jitterMs: input.estimate.jitterMs, uncertaintyMs: input.estimate.uncertaintyMs, sampleCount: input.estimate.samples.length })));
  return true;
}

export async function getMeasurementHistory(sessionId: string, limit = 2_000) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(timeMeasurements).where(eq(timeMeasurements.sessionId, sessionId)).orderBy(desc(timeMeasurements.createdAt)).limit(Math.min(Math.max(1, limit), 2_000));
}

function persistedSource(source: TimeSource): source is TimeSource & { tier: "authority" | "regional_pool" } { return source.tier === "authority" || source.tier === "regional_pool"; }
export async function storeNtpHealthSnapshots(readings: UpstreamHealth[]) {
  const db = await getDb(); const persistent = readings.filter(persistedSource); if (!db || persistent.length === 0) return false;
  await db.insert(timeSources).values(persistent.map(reading => ({ id: reading.id, displayName: reading.name, host: reading.host, sourceTier: reading.tier as "authority" | "regional_pool", region: reading.region ?? null, enabled: true }))).onDuplicateKeyUpdate({ set: { updatedAt: new Date(), enabled: true } });
  await db.insert(ntpHealthSnapshots).values(persistent.map(reading => ({ authority: reading.id, host: reading.host, sourceTier: reading.tier as "authority" | "regional_pool", region: reading.region ?? null, status: (reading.status === "reachable" ? "reachable" : "unreachable") as "reachable" | "unreachable", detail: reading.detail ?? null, offsetMs: reading.offsetMs, delayMs: reading.delayMs, uncertaintyMs: reading.uncertaintyMs, sampledAtMs: reading.sampledAt })));
  return true;
}

export type ChronoPreferences = { alertEnabled: boolean; alertThresholdMs: number; hardwareTemplateOptIn: boolean; hardwareTags: string[]; hardwareDescription: string | null; worldZones: string[]; publicLeaderboardOptIn: boolean; publicSetupLabel: string | null; highContrastMode: boolean };
const defaultChronoPreferences: ChronoPreferences = { alertEnabled: true, alertThresholdMs: 25, hardwareTemplateOptIn: false, hardwareTags: [], hardwareDescription: null, worldZones: ["UTC", "America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"], publicLeaderboardOptIn: false, publicSetupLabel: null, highContrastMode: false };
function parseStringArray(value: string, maxLength: number) { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string").slice(0, maxLength) : []; } catch { return []; } }

export async function getChronoPreferences(userId: number): Promise<ChronoPreferences> {
  const db = await getDb(); if (!db) return defaultChronoPreferences;
  const stored = (await db.select().from(userChronoPreferences).where(eq(userChronoPreferences.userId, userId)).limit(1))[0];
  if (!stored) return defaultChronoPreferences;
  return { alertEnabled: stored.alertEnabled, alertThresholdMs: stored.alertThresholdMs, hardwareTemplateOptIn: stored.hardwareTemplateOptIn, hardwareTags: parseStringArray(stored.hardwareTagsJson, 5), hardwareDescription: stored.hardwareDescription, worldZones: parseStringArray(stored.worldZonesJson, 24).length ? parseStringArray(stored.worldZonesJson, 24) : defaultChronoPreferences.worldZones, publicLeaderboardOptIn: stored.publicLeaderboardOptIn, publicSetupLabel: stored.publicSetupLabel, highContrastMode: stored.highContrastMode };
}

export async function saveChronoPreferences(userId: number, preferences: ChronoPreferences) {
  const db = await getDb(); if (!db) return false;
  const values = { userId, alertEnabled: preferences.alertEnabled, alertThresholdMs: preferences.alertThresholdMs, hardwareTemplateOptIn: preferences.hardwareTemplateOptIn, hardwareTagsJson: JSON.stringify(preferences.hardwareTags), hardwareDescription: preferences.hardwareDescription, worldZonesJson: JSON.stringify(preferences.worldZones), publicLeaderboardOptIn: preferences.publicLeaderboardOptIn, publicSetupLabel: preferences.publicSetupLabel, highContrastMode: preferences.highContrastMode };
  await db.insert(userChronoPreferences).values(values).onDuplicateKeyUpdate({ set: { ...values, updatedAt: new Date() } });
  if (!preferences.publicLeaderboardOptIn) await db.delete(publicStabilityEntries).where(eq(publicStabilityEntries.userId, userId));
  return true;
}

export async function publishPublicStabilityEntry(userId: number, input: { offsetMs: number; jitterMs: number; uncertaintyMs: number; sampleCount: number }) {
  const db = await getDb(); if (!db) return false;
  const preferences = await getChronoPreferences(userId);
  if (!preferences.publicLeaderboardOptIn || !preferences.publicSetupLabel) throw new Error("Enable public leaderboard sharing and save a public setup label first.");
  const stabilityScore = calculateStabilityScore(input.jitterMs, input.sampleCount);
  await db.insert(publicStabilityEntries).values({ userId, setupLabel: preferences.publicSetupLabel, hardwareTagsJson: JSON.stringify(preferences.hardwareTags), stabilityScore, offsetMs: input.offsetMs, jitterMs: input.jitterMs, uncertaintyMs: input.uncertaintyMs, sampleCount: input.sampleCount }).onDuplicateKeyUpdate({ set: { setupLabel: preferences.publicSetupLabel, hardwareTagsJson: JSON.stringify(preferences.hardwareTags), stabilityScore, offsetMs: input.offsetMs, jitterMs: input.jitterMs, uncertaintyMs: input.uncertaintyMs, sampleCount: input.sampleCount, updatedAt: new Date() } });
  return true;
}

export async function getPublicStabilityLeaderboard(tag?: string | null, limit = 100) {
  const db = await getDb(); if (!db) return [];
  const entries = await db.select({ setupLabel: publicStabilityEntries.setupLabel, hardwareTagsJson: publicStabilityEntries.hardwareTagsJson, stabilityScore: publicStabilityEntries.stabilityScore, offsetMs: publicStabilityEntries.offsetMs, jitterMs: publicStabilityEntries.jitterMs, uncertaintyMs: publicStabilityEntries.uncertaintyMs, sampleCount: publicStabilityEntries.sampleCount, updatedAt: publicStabilityEntries.updatedAt }).from(publicStabilityEntries).orderBy(desc(publicStabilityEntries.stabilityScore), desc(publicStabilityEntries.updatedAt)).limit(Math.min(Math.max(1, limit), 100));
  return filterPublicSetupsByTag(entries.map(entry => ({ ...entry, hardwareTags: parseStringArray(entry.hardwareTagsJson, 5) })), normalizeLeaderboardTagFilter(tag));
}

export async function getPublicStabilityTags() {
  const entries = await getPublicStabilityLeaderboard(null, 100);
  return Array.from(new Set(entries.flatMap(entry => entry.hardwareTags))).sort((a, b) => a.localeCompare(b));
}

export async function getSourceAccuracyAnalytics(range: SourceAccuracyRange) {
  const db = await getDb(); const generatedAt = Date.now();
  if (!db) return { range, generatedAt, sources: [], timeline: [] };
  const [sources, snapshots] = await Promise.all([
    db.select().from(timeSources).limit(200),
    db.select().from(ntpHealthSnapshots).where(gte(ntpHealthSnapshots.sampledAtMs, getSourceRangeStart(range, generatedAt))).orderBy(desc(ntpHealthSnapshots.sampledAtMs)).limit(20_000),
  ]);
  const names = new Map(sources.map(source => [source.id, source.displayName]));
  return { range, generatedAt, ...aggregateSourceAccuracy(snapshots.map(snapshot => ({ authority: snapshot.authority, status: snapshot.status, offsetMs: snapshot.offsetMs, uncertaintyMs: snapshot.uncertaintyMs, sampledAtMs: snapshot.sampledAtMs })), names, range) };
}

/** Returns aggregate mesh health without hostnames, source labels, contributor identities, or review notes. */
export async function getFusionObservability(range: FusionObservabilityRange) {
  const db = await getDb();
  const generatedAtMs = Date.now();
  if (!db) return buildFusionObservability({ range, generatedAtMs, sources: [], readings: [], freshAttestationSourceIds: [], reviewStatuses: [] });
  const windowStartMs = getFusionObservabilityWindowStart(range, generatedAtMs);
  const usePersistedRollups = range === "7d" || range === "30d" || range === "90d";
  const rollupGranularity = range === "7d" ? "hour" : "day";
  const [sources, snapshots, rollups, attestations, reviewApplications] = await Promise.all([
    db.select({ id: globalTimeSources.id, state: globalTimeSources.state, groupKey: globalTimeSources.groupKey }).from(globalTimeSources).limit(400),
    usePersistedRollups ? Promise.resolve([]) : db.select({ sourceId: globalSourceProbeSnapshots.sourceId, status: globalSourceProbeSnapshots.status, offsetMs: globalSourceProbeSnapshots.offsetMs, delayMs: globalSourceProbeSnapshots.delayMs, uncertaintyMs: globalSourceProbeSnapshots.uncertaintyMs, sampledAtMs: globalSourceProbeSnapshots.sampledAtMs }).from(globalSourceProbeSnapshots).where(gte(globalSourceProbeSnapshots.sampledAtMs, windowStartMs)).orderBy(desc(globalSourceProbeSnapshots.sampledAtMs)).limit(10_000),
    usePersistedRollups ? db.select({ bucketStartMs: fusionObservabilityRollups.bucketStartMs, bucketEndMs: fusionObservabilityRollups.bucketEndMs, sampleCount: fusionObservabilityRollups.sampleCount, reachableCount: fusionObservabilityRollups.reachableCount, measuredCount: fusionObservabilityRollups.measuredCount, medianDelayMs: fusionObservabilityRollups.medianDelayMs, medianUncertaintyMs: fusionObservabilityRollups.medianUncertaintyMs, medianAbsoluteOffsetMs: fusionObservabilityRollups.medianAbsoluteOffsetMs, observedSourceCount: fusionObservabilityRollups.observedSourceCount }).from(fusionObservabilityRollups).where(and(eq(fusionObservabilityRollups.granularity, rollupGranularity), gt(fusionObservabilityRollups.bucketEndMs, windowStartMs), lte(fusionObservabilityRollups.bucketStartMs, generatedAtMs))).orderBy(fusionObservabilityRollups.bucketStartMs).limit(10_000) : Promise.resolve([]),
    db.select({ sourceId: operatorHealthAttestations.sourceId, sampledAtMs: operatorHealthAttestations.sampledAtMs }).from(operatorHealthAttestations).where(eq(operatorHealthAttestations.status, "accepted")).orderBy(desc(operatorHealthAttestations.sampledAtMs)).limit(2_000),
    db.select({ status: sourceReviewApplications.status }).from(sourceReviewApplications).limit(1_000),
  ]);
  const sourceIds = sources.map(source => source.id);
  const metadata = sourceIds.length ? await db.select({ sourceId: sourceNetworkMetadata.sourceId, asn: sourceNetworkMetadata.asn, regionCode: sourceNetworkMetadata.regionCode }).from(sourceNetworkMetadata).where(inArray(sourceNetworkMetadata.sourceId, sourceIds)).limit(400) : [];
  const metadataBySource = new Map(metadata.map(item => [item.sourceId, item]));
  const coverage = usePersistedRollups ? (() => {
    const expectedBucketCount = Math.ceil((generatedAtMs - windowStartMs) / getFusionObservabilityBucketDuration(range));
    const observedFromMs = rollups.length ? Math.min(...rollups.map(rollup => rollup.bucketStartMs)) : null;
    const coveragePct = expectedBucketCount ? Math.min(100, (rollups.length / expectedBucketCount) * 100) : null;
    return { mode: "persisted_rollup" as const, availableBucketCount: rollups.length, expectedBucketCount, coveragePct, observedFromMs, partial: rollups.length > 0 && rollups.length < expectedBucketCount };
  })() : undefined;
  return buildFusionObservability({
    range,
    generatedAtMs,
    sources: sources.map(source => ({ ...source, asn: metadataBySource.get(source.id)?.asn ?? null, regionCode: metadataBySource.get(source.id)?.regionCode ?? null })),
    readings: snapshots,
    rollups: usePersistedRollups ? rollups : undefined,
    coverage,
    freshAttestationSourceIds: attestations.filter(attestation => isAttestationFresh(attestation.sampledAtMs, generatedAtMs)).map(attestation => attestation.sourceId),
    reviewStatuses: reviewApplications.map(application => application.status),
  });
}

export type RoomRelayEventInput = { originId: string; roomCode: string; eventType: "upsert" | "remove"; peerId: string; payload: unknown | null };
export type RoomRelayEvent = RoomRelayEventInput & { id: number; expiresAtMs: number };
export async function appendRoomRelayEvent(event: RoomRelayEventInput) {
  const db = await getDb(); if (!db) return false;
  await db.insert(roomRelayEvents).values({ ...event, payloadJson: event.payload === null ? null : JSON.stringify(event.payload), expiresAtMs: Date.now() + 120_000 });
  return true;
}

export async function getRoomRelayEvents(roomCode: string, afterId: number, originId: string): Promise<{ events: RoomRelayEvent[]; cursor: number }> {
  const db = await getDb(); if (!db) return { events: [], cursor: afterId };
  const events = await db.select().from(roomRelayEvents).where(and(eq(roomRelayEvents.roomCode, roomCode), gt(roomRelayEvents.id, afterId), gt(roomRelayEvents.expiresAtMs, Date.now()))).orderBy(roomRelayEvents.id).limit(100);
  return { cursor: events.length ? events[events.length - 1].id : afterId, events: events.filter(event => event.originId !== originId).flatMap(event => {
    try { return [{ id: event.id, originId: event.originId, roomCode: event.roomCode, eventType: event.eventType, peerId: event.peerId, payload: event.payloadJson ? JSON.parse(event.payloadJson) : null, expiresAtMs: event.expiresAtMs }]; } catch { return []; }
  }) };
}

type CommunitySourceInput = { host: string; displayName: string; publicMetadataOptIn: boolean; publicLabel: string | null; region: string | null };
function sourceGroupKey(host: string) { const labels = host.split("."); return `domain:${labels.slice(-2).join(".")}`; }
function mapGlobalSource(row: typeof globalTimeSources.$inferSelect): GlobalMeshSource {
  return { id: row.id, displayName: row.displayName, host: row.host, sourceClass: row.sourceClass, state: row.state, provenance: row.provenance, verificationMethod: row.verificationMethod, publicMetadataOptIn: row.publicMetadataOptIn, publicLabel: row.publicLabel, region: row.region, groupKey: row.groupKey, lastProbeAtMs: row.lastProbeAtMs, consecutiveFailures: row.consecutiveFailures, nextEligibleAtMs: row.nextEligibleAtMs };
}

export async function seedGlobalMeshSources(sources: Array<{ id: string; name: string; host: string; tier: string; region?: string }>) {
  const db = await getDb(); if (!db || !sources.length) return false;
  await db.insert(globalTimeSources).values(sources.map(source => ({ id: source.id, displayName: source.name, host: source.host, sourceClass: source.tier === "regional_pool" ? "regional_pool" as const : "authority" as const, state: "active" as const, provenance: "curated" as const, verificationMethod: "none" as const, publicMetadataOptIn: true, publicLabel: source.name, region: source.region ?? null, groupKey: `curated:${source.id}`, consecutiveFailures: 0 }))).onDuplicateKeyUpdate({ set: { updatedAt: new Date(), state: "active", provenance: "curated", publicMetadataOptIn: true } });
  return true;
}

export async function getGlobalMeshSources(ownerUserId?: number) {
  const db = await getDb(); if (!db) return [] as GlobalMeshSource[];
  const rows = ownerUserId === undefined ? await db.select().from(globalTimeSources).orderBy(globalTimeSources.sourceClass, globalTimeSources.displayName).limit(400) : await db.select().from(globalTimeSources).where(and(eq(globalTimeSources.ownerUserId, ownerUserId), eq(globalTimeSources.sourceClass, "community"))).orderBy(globalTimeSources.createdAt).limit(100);
  return rows.map(mapGlobalSource);
}

export async function createCommunitySource(ownerUserId: number, input: CommunitySourceInput) {
  const db = await getDb(); if (!db) return { stored: false as const, source: null, verificationToken: null };
  const existing = (await db.select().from(globalTimeSources).where(eq(globalTimeSources.host, input.host)).limit(1))[0];
  if (existing) throw new Error("This hostname is already registered in the source mesh.");
  const id = `community-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const verificationToken = randomUUID().replace(/-/g, "");
  await db.insert(globalTimeSources).values({ id, ownerUserId, displayName: input.displayName, host: input.host, sourceClass: "community", state: "pending", provenance: "operator_declared", verificationMethod: "dns_txt", verificationToken, publicMetadataOptIn: input.publicMetadataOptIn, publicLabel: input.publicMetadataOptIn ? input.publicLabel : null, region: input.region, groupKey: sourceGroupKey(input.host), consecutiveFailures: 0 });
  const stored = (await db.select().from(globalTimeSources).where(eq(globalTimeSources.id, id)).limit(1))[0];
  return { stored: true as const, source: stored ? mapGlobalSource(stored) : null, verificationToken };
}

export async function setCommunitySourceState(ownerUserId: number, sourceId: string, state: "paused" | "withdrawn") {
  const db = await getDb(); if (!db) return false;
  const current = await db.select({ state: globalTimeSources.state }).from(globalTimeSources).where(and(eq(globalTimeSources.id, sourceId), eq(globalTimeSources.ownerUserId, ownerUserId), eq(globalTimeSources.sourceClass, "community"))).limit(1);
  if (!current[0] || !canTransitionCommunitySource(current[0].state, state)) return false;
  const result = await db.update(globalTimeSources).set({ state, nextEligibleAtMs: null }).where(and(eq(globalTimeSources.id, sourceId), eq(globalTimeSources.ownerUserId, ownerUserId), eq(globalTimeSources.sourceClass, "community")));
  return result[0].affectedRows > 0;
}

export async function verifyCommunitySource(ownerUserId: number, sourceId: string) {
  const db = await getDb(); if (!db) return false;
  const result = await db.update(globalTimeSources).set({ state: "active", provenance: "verified_operator", verifiedAt: new Date(), verificationToken: null, consecutiveFailures: 0, nextEligibleAtMs: null }).where(and(eq(globalTimeSources.id, sourceId), eq(globalTimeSources.ownerUserId, ownerUserId), eq(globalTimeSources.sourceClass, "community"), eq(globalTimeSources.state, "pending")));
  return result[0].affectedRows > 0;
}

export async function getCommunitySourceVerification(ownerUserId: number, sourceId: string) {
  const db = await getDb(); if (!db) return null;
  const source = (await db.select({ host: globalTimeSources.host, verificationToken: globalTimeSources.verificationToken, state: globalTimeSources.state }).from(globalTimeSources).where(and(eq(globalTimeSources.id, sourceId), eq(globalTimeSources.ownerUserId, ownerUserId), eq(globalTimeSources.sourceClass, "community"))).limit(1))[0];
  return source ?? null;
}

function medianValue(values: number[]): number | null { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null; }

/** Replaces one bounded aggregate bucket; no host, contributor, or peer identity is retained in the result. */
export async function materializeFusionObservabilityRollup(bucketStartMs: number, bucketEndMs: number, granularity: "hour" | "day") {
  const db = await getDb();
  if (!db || !Number.isFinite(bucketStartMs) || !Number.isFinite(bucketEndMs) || bucketEndMs <= bucketStartMs) return false;
  const entries = await db.select({ sourceId: globalSourceProbeSnapshots.sourceId, status: globalSourceProbeSnapshots.status, offsetMs: globalSourceProbeSnapshots.offsetMs, delayMs: globalSourceProbeSnapshots.delayMs, uncertaintyMs: globalSourceProbeSnapshots.uncertaintyMs }).from(globalSourceProbeSnapshots).where(and(gte(globalSourceProbeSnapshots.sampledAtMs, bucketStartMs), lt(globalSourceProbeSnapshots.sampledAtMs, bucketEndMs))).limit(20_000);
  const reachable = entries.filter(entry => entry.status === "reachable");
  const measured = reachable.filter(entry => entry.offsetMs !== null && entry.delayMs !== null && entry.uncertaintyMs !== null);
  await db.delete(fusionObservabilityRollups).where(and(eq(fusionObservabilityRollups.granularity, granularity), eq(fusionObservabilityRollups.bucketStartMs, bucketStartMs), eq(fusionObservabilityRollups.bucketEndMs, bucketEndMs)));
  await db.insert(fusionObservabilityRollups).values({ granularity, bucketStartMs, bucketEndMs, bucketDurationMs: bucketEndMs - bucketStartMs, sampleCount: entries.length, reachableCount: reachable.length, measuredCount: measured.length, medianDelayMs: medianValue(measured.map(entry => entry.delayMs!)), medianUncertaintyMs: medianValue(measured.map(entry => entry.uncertaintyMs!)), medianAbsoluteOffsetMs: medianValue(measured.map(entry => Math.abs(entry.offsetMs!))), observedSourceCount: new Set(entries.map(entry => entry.sourceId)).size });
  return true;
}

export async function storeGlobalMeshProbeReadings(readings: MeshProbeReading[]) {
  const db = await getDb(); if (!db || !readings.length) return false;
  await db.insert(globalSourceProbeSnapshots).values(readings.map(reading => ({ sourceId: reading.sourceId, status: reading.status, detail: reading.detail ?? null, offsetMs: reading.offsetMs, delayMs: reading.delayMs, uncertaintyMs: reading.uncertaintyMs, stratum: reading.stratum ?? null, sampledAtMs: reading.sampledAtMs })));
  for (const reading of readings) {
    const failed = reading.status !== "reachable";
    const source = (await db.select().from(globalTimeSources).where(eq(globalTimeSources.id, reading.sourceId)).limit(1))[0];
    if (!source) continue;
    const failures = failed ? source.consecutiveFailures + 1 : 0;
    await db.update(globalTimeSources).set({ lastProbeAtMs: reading.sampledAtMs, consecutiveFailures: failures, nextEligibleAtMs: failed ? reading.sampledAtMs + calculateBackoffMs(failures) : null }).where(eq(globalTimeSources.id, reading.sourceId));
    const probeHistory = await db.select().from(globalSourceProbeSnapshots).where(eq(globalSourceProbeSnapshots.sourceId, reading.sourceId)).orderBy(desc(globalSourceProbeSnapshots.sampledAtMs)).limit(120);
    const reachable = probeHistory.filter(item => item.status === "reachable" && item.offsetMs !== null && item.delayMs !== null && item.uncertaintyMs !== null);
    await db.insert(globalSourceQualitySummaries).values({ sourceId: reading.sourceId, reachableSamples: reachable.length, totalSamples: probeHistory.length, medianOffsetMs: medianValue(reachable.map(item => item.offsetMs!)), medianUncertaintyMs: medianValue(reachable.map(item => item.uncertaintyMs!)), medianDelayMs: medianValue(reachable.map(item => item.delayMs!)) }).onDuplicateKeyUpdate({ set: { reachableSamples: reachable.length, totalSamples: probeHistory.length, medianOffsetMs: medianValue(reachable.map(item => item.offsetMs!)), medianUncertaintyMs: medianValue(reachable.map(item => item.uncertaintyMs!)), medianDelayMs: medianValue(reachable.map(item => item.delayMs!)), updatedAt: new Date() } });
  }
  const hourMs = 60 * 60 * 1_000; const dayMs = 24 * hourMs;
  const buckets = new Map<string, { bucketStartMs: number; bucketEndMs: number; granularity: "hour" | "day" }>();
  for (const reading of readings) for (const [duration, granularity] of [[hourMs, "hour"], [dayMs, "day"]] as const) { const bucketStartMs = Math.floor(reading.sampledAtMs / duration) * duration; buckets.set(`${granularity}:${bucketStartMs}`, { bucketStartMs, bucketEndMs: bucketStartMs + duration, granularity }); }
  await Promise.all(Array.from(buckets.values()).map(bucket => materializeFusionObservabilityRollup(bucket.bucketStartMs, bucket.bucketEndMs, bucket.granularity).catch(error => console.warn("[Fusion observability] roll-up materialization failed:", error))));
  return true;
}

export async function getGlobalMeshQualitySummaries(sourceIds: string[]) {
  const db = await getDb(); if (!db || !sourceIds.length) return new Map<string, { reachableSamples: number; totalSamples: number; medianOffsetMs: number | null; medianUncertaintyMs: number | null; medianDelayMs: number | null }>();
  const summaries = await db.select().from(globalSourceQualitySummaries).where(inArray(globalSourceQualitySummaries.sourceId, sourceIds)).limit(400);
  return new Map(summaries.map(summary => [summary.sourceId, { reachableSamples: summary.reachableSamples, totalSamples: summary.totalSamples, medianOffsetMs: summary.medianOffsetMs, medianUncertaintyMs: summary.medianUncertaintyMs, medianDelayMs: summary.medianDelayMs }]));
}

export async function getGlobalMeshLatestReadings(sourceIds: string[]) {
  const db = await getDb(); if (!db || !sourceIds.length) return [] as MeshProbeReading[];
  const [snapshots, sources, networkMetadata] = await Promise.all([
    db.select().from(globalSourceProbeSnapshots).where(inArray(globalSourceProbeSnapshots.sourceId, sourceIds)).orderBy(desc(globalSourceProbeSnapshots.sampledAtMs)).limit(Math.min(2_000, sourceIds.length * 8)),
    db.select().from(globalTimeSources).where(inArray(globalTimeSources.id, sourceIds)).limit(400),
    getSourceNetworkMetadata(sourceIds),
  ]);
  const sourceById = new Map(sources.map(source => [source.id, source])); const seen = new Set<string>();
  return snapshots.flatMap(snapshot => { if (seen.has(snapshot.sourceId)) return []; seen.add(snapshot.sourceId); const source = sourceById.get(snapshot.sourceId); if (!source) return []; const metadata = networkMetadata.get(snapshot.sourceId); return [{ sourceId: snapshot.sourceId, sourceClass: source.sourceClass, groupKey: source.groupKey, asn: metadata?.asn ?? null, countryCode: metadata?.countryCode ?? null, regionCode: metadata?.regionCode ?? null, status: snapshot.status, detail: snapshot.detail, offsetMs: snapshot.offsetMs, delayMs: snapshot.delayMs, uncertaintyMs: snapshot.uncertaintyMs, stratum: snapshot.stratum, sampledAtMs: snapshot.sampledAtMs } satisfies MeshProbeReading]; });
}

export async function getPublicGlobalMeshRegistry(limit = 200) {
  const db = await getDb(); if (!db) return [] as Array<Pick<GlobalMeshSource, "id" | "displayName" | "sourceClass" | "state" | "provenance" | "publicMetadataOptIn" | "publicLabel" | "region">>;
  const sources = await db.select().from(globalTimeSources).where(and(eq(globalTimeSources.state, "active"), eq(globalTimeSources.publicMetadataOptIn, true))).orderBy(globalTimeSources.sourceClass, globalTimeSources.displayName).limit(Math.min(Math.max(1, limit), 200));
  return sources.map(source => ({ ...mapGlobalSource(source), host: undefined, groupKey: undefined, lastProbeAtMs: undefined, consecutiveFailures: undefined, nextEligibleAtMs: undefined }));
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function trustId(prefix: string): string { return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 24)}`; }

export async function createAgentInstallation(ownerUserId: number, input: { publicKey: string; platform: AgentPlatform; agentVersion: string; coarseRegion: string | null }) {
  const db = await getDb(); if (!db) return null;
  const publicKey = input.publicKey.trim(); const keyFingerprint = sha256(publicKey);
  const existing = (await db.select({ id: operatorAgentInstallations.id, ownerUserId: operatorAgentInstallations.ownerUserId, revokedAt: operatorAgentInstallations.revokedAt }).from(operatorAgentInstallations).where(eq(operatorAgentInstallations.keyFingerprint, keyFingerprint)).limit(1))[0];
  if (existing && existing.ownerUserId !== ownerUserId) throw new Error("This contributor key is already enrolled by another account.");
  if (existing && !existing.revokedAt) throw new Error("This contributor key is already active.");
  const id = existing?.id ?? trustId("agent"); const enrollmentCredential = randomBytes(32).toString("base64url");
  const values = { id, ownerUserId, publicKey, keyFingerprint, accessTokenHash: sha256(enrollmentCredential), platform: input.platform, agentVersion: input.agentVersion, coarseRegion: input.coarseRegion, lastSeenAtMs: null, revokedAt: null };
  await db.insert(operatorAgentInstallations).values(values).onDuplicateKeyUpdate({ set: { accessTokenHash: values.accessTokenHash, agentVersion: input.agentVersion, coarseRegion: input.coarseRegion, revokedAt: null, updatedAt: new Date() } });
  return { id, keyFingerprint, platform: input.platform, agentVersion: input.agentVersion, coarseRegion: input.coarseRegion, enrollmentCredential };
}

export async function getAgentInstallationByCredential(installationId: string, enrollmentCredential: string) {
  const db = await getDb(); if (!db || !enrollmentCredential) return null;
  return (await db.select({ id: operatorAgentInstallations.id, ownerUserId: operatorAgentInstallations.ownerUserId, revokedAt: operatorAgentInstallations.revokedAt }).from(operatorAgentInstallations).where(and(eq(operatorAgentInstallations.id, installationId), eq(operatorAgentInstallations.accessTokenHash, sha256(enrollmentCredential)), isNull(operatorAgentInstallations.revokedAt))).limit(1))[0] ?? null;
}

export async function getAgentInstallations(ownerUserId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: operatorAgentInstallations.id, platform: operatorAgentInstallations.platform, keyFingerprint: operatorAgentInstallations.keyFingerprint, agentVersion: operatorAgentInstallations.agentVersion, coarseRegion: operatorAgentInstallations.coarseRegion, lastSeenAtMs: operatorAgentInstallations.lastSeenAtMs, revokedAt: operatorAgentInstallations.revokedAt }).from(operatorAgentInstallations).where(eq(operatorAgentInstallations.ownerUserId, ownerUserId)).orderBy(desc(operatorAgentInstallations.createdAt)).limit(50);
}

export async function revokeAgentInstallation(ownerUserId: number, installationId: string) {
  const db = await getDb(); if (!db) return false;
  const result = await db.update(operatorAgentInstallations).set({ revokedAt: new Date() }).where(and(eq(operatorAgentInstallations.id, installationId), eq(operatorAgentInstallations.ownerUserId, ownerUserId), isNull(operatorAgentInstallations.revokedAt)));
  return result[0].affectedRows > 0;
}

export async function createAttestationChallenge(ownerUserId: number, input: { installationId: string; sourceId: string }) {
  const db = await getDb(); if (!db) return null;
  const [installation, source] = await Promise.all([
    db.select({ id: operatorAgentInstallations.id, revokedAt: operatorAgentInstallations.revokedAt }).from(operatorAgentInstallations).where(and(eq(operatorAgentInstallations.id, input.installationId), eq(operatorAgentInstallations.ownerUserId, ownerUserId))).limit(1),
    db.select({ id: globalTimeSources.id, state: globalTimeSources.state }).from(globalTimeSources).where(and(eq(globalTimeSources.id, input.sourceId), eq(globalTimeSources.ownerUserId, ownerUserId), eq(globalTimeSources.sourceClass, "community"))).limit(1),
  ]);
  if (!installation[0] || installation[0].revokedAt || !source[0] || source[0].state !== "active") throw new Error("An active owned source and non-revoked contributor installation are required.");
  const nowMs = Date.now(); const nonce = randomBytes(32).toString("base64url"); const id = trustId("challenge"); const expiresAtMs = nowMs + ATTESTATION_CHALLENGE_TTL_MS;
  await db.insert(operatorAttestationChallenges).values({ id, installationId: input.installationId, sourceId: input.sourceId, nonceHash: sha256(nonce), expiresAtMs });
  return { id, installationId: input.installationId, sourceId: input.sourceId, nonce, expiresAtMs };
}

export async function getAttestationVerificationContext(installationId: string, challengeId: string) {
  const db = await getDb(); if (!db) return null;
  const challenge = (await db.select().from(operatorAttestationChallenges).where(and(eq(operatorAttestationChallenges.id, challengeId), eq(operatorAttestationChallenges.installationId, installationId), isNull(operatorAttestationChallenges.consumedAt))).limit(1))[0];
  if (!challenge) return null;
  const installation = (await db.select().from(operatorAgentInstallations).where(and(eq(operatorAgentInstallations.id, installationId), isNull(operatorAgentInstallations.revokedAt))).limit(1))[0];
  return installation ? { challenge, installation } : null;
}

export async function recordVerifiedAttestation(input: { installationId: string; challengeId: string; nonce: string; envelopeHash: string; envelope: AgentAttestationEnvelope }) {
  const db = await getDb(); if (!db) return { accepted: false, reason: "database_unavailable" as const };
  const context = await getAttestationVerificationContext(input.installationId, input.challengeId);
  const reason = !context ? "challenge_unavailable" : context.challenge.expiresAtMs < Date.now() ? "challenge_expired" : context.challenge.nonceHash !== sha256(input.nonce) ? "nonce_mismatch" : context.challenge.sourceId !== input.envelope.sourceId ? "source_mismatch" : null;
  if (reason) return { accepted: false, reason };
  const consume = await db.update(operatorAttestationChallenges).set({ consumedAt: new Date() }).where(and(eq(operatorAttestationChallenges.id, input.challengeId), eq(operatorAttestationChallenges.installationId, input.installationId), isNull(operatorAttestationChallenges.consumedAt)));
  if (consume[0].affectedRows !== 1) return { accepted: false, reason: "challenge_already_consumed" as const };
  const qualityBand = deriveAttestationQualityBand(input.envelope);
  await db.insert(operatorHealthAttestations).values({ sourceId: input.envelope.sourceId, installationId: input.installationId, envelopeHash: input.envelopeHash, qualityBand, status: "accepted", sampledAtMs: input.envelope.sampledAtMs });
  await db.update(operatorAgentInstallations).set({ lastSeenAtMs: Date.now(), agentVersion: input.envelope.agentVersion }).where(eq(operatorAgentInstallations.id, input.installationId));
  return { accepted: true as const, qualityBand };
}

export async function getSourceAttestationStatus(sourceIds: string[], nowMs = Date.now()) {
  const db = await getDb(); if (!db || !sourceIds.length) return new Map<string, { lastAttestedAtMs: number | null; qualityBand: string | null; fresh: boolean }>();
  const rows = await db.select().from(operatorHealthAttestations).where(and(inArray(operatorHealthAttestations.sourceId, sourceIds), eq(operatorHealthAttestations.status, "accepted"))).orderBy(desc(operatorHealthAttestations.sampledAtMs)).limit(Math.min(2_000, sourceIds.length * 8));
  const seen = new Map<string, { lastAttestedAtMs: number | null; qualityBand: string | null; fresh: boolean }>();
  for (const row of rows) if (!seen.has(row.sourceId)) seen.set(row.sourceId, { lastAttestedAtMs: row.sampledAtMs, qualityBand: row.qualityBand, fresh: isAttestationFresh(row.sampledAtMs, nowMs) });
  return seen;
}

export async function upsertSourceReviewApplication(ownerUserId: number, input: { sourceId: string; capabilities: string[]; publicQueueOptIn: boolean; requestedPublicLabel: string | null }) {
  const db = await getDb(); if (!db) return false;
  const source = (await db.select({ id: globalTimeSources.id, publicLabel: globalTimeSources.publicLabel }).from(globalTimeSources).where(and(eq(globalTimeSources.id, input.sourceId), eq(globalTimeSources.ownerUserId, ownerUserId), eq(globalTimeSources.sourceClass, "community"))).limit(1))[0];
  if (!source) throw new Error("Only the owner of a community source may submit an application.");
  if (input.publicQueueOptIn && !(input.requestedPublicLabel ?? source.publicLabel)) throw new Error("A public queue label is required when public listing is enabled.");
  const nowMs = Date.now(); const values = { sourceId: input.sourceId, applicantUserId: ownerUserId, status: "pending" as const, capabilitiesJson: JSON.stringify(input.capabilities.slice(0, 8)), publicQueueOptIn: input.publicQueueOptIn, requestedPublicLabel: input.publicQueueOptIn ? (input.requestedPublicLabel ?? source.publicLabel) : null, publicRationale: null, submittedAtMs: nowMs, updatedAtMs: nowMs };
  await db.insert(sourceReviewApplications).values(values).onDuplicateKeyUpdate({ set: { capabilitiesJson: values.capabilitiesJson, publicQueueOptIn: values.publicQueueOptIn, requestedPublicLabel: values.requestedPublicLabel, status: "pending", updatedAtMs: nowMs } });
  return true;
}

export async function getPublicSourceReviewApplications(limit = 100): Promise<PublicSourceApplication[]> {
  const db = await getDb(); if (!db) return [];
  const applications = await db.select().from(sourceReviewApplications).where(eq(sourceReviewApplications.publicQueueOptIn, true)).orderBy(desc(sourceReviewApplications.updatedAtMs)).limit(Math.min(Math.max(1, limit), 100));
  const sourceIds = applications.map(application => application.sourceId); if (!sourceIds.length) return [];
  const sources = await db.select({ id: globalTimeSources.id, publicLabel: globalTimeSources.publicLabel, region: globalTimeSources.region }).from(globalTimeSources).where(inArray(globalTimeSources.id, sourceIds)).limit(100);
  const sourceById = new Map(sources.map(source => [source.id, source]));
  return applications.flatMap(application => { const source = sourceById.get(application.sourceId); const label = application.requestedPublicLabel ?? source?.publicLabel; return label ? [{ sourceId: application.sourceId, publicLabel: label, region: source?.region ?? null, status: application.status, submittedAtMs: application.submittedAtMs, updatedAtMs: application.updatedAtMs, publicRationale: application.publicRationale }] : []; });
}

export async function getReviewerSourceApplications(limit = 100) {
  const db = await getDb(); if (!db) return [];
  const applications = await db.select().from(sourceReviewApplications).orderBy(desc(sourceReviewApplications.updatedAtMs)).limit(Math.min(Math.max(1, limit), 100));
  const sourceIds = applications.map(application => application.sourceId); if (!sourceIds.length) return [];
  const [sources, attestations, metadata] = await Promise.all([
    db.select({ id: globalTimeSources.id, host: globalTimeSources.host, displayName: globalTimeSources.displayName, state: globalTimeSources.state, verifiedAt: globalTimeSources.verifiedAt, region: globalTimeSources.region }).from(globalTimeSources).where(inArray(globalTimeSources.id, sourceIds)).limit(100),
    getSourceAttestationStatus(sourceIds),
    db.select().from(sourceNetworkMetadata).where(inArray(sourceNetworkMetadata.sourceId, sourceIds)).limit(100),
  ]);
  const sourceById = new Map(sources.map(source => [source.id, source])); const metadataById = new Map(metadata.map(item => [item.sourceId, item]));
  return applications.flatMap(application => { const source = sourceById.get(application.sourceId); return source ? [{ application, source, attestation: attestations.get(application.sourceId) ?? null, networkMetadata: metadataById.get(application.sourceId) ?? null }] : []; });
}

export async function decideSourceReviewApplication(reviewerUserId: number, input: { sourceId: string; decision: SourceReviewDecision; reasonCode: string; privateNote: string | null; publicRationale: string | null }) {
  const db = await getDb(); if (!db) return false;
  const application = (await db.select().from(sourceReviewApplications).where(eq(sourceReviewApplications.sourceId, input.sourceId)).limit(1))[0];
  const source = (await db.select().from(globalTimeSources).where(eq(globalTimeSources.id, input.sourceId)).limit(1))[0];
  if (!application || !source) return false;
  const currentAttestation = (await getSourceAttestationStatus([input.sourceId])).get(input.sourceId);
  if (input.decision === "approve" && (!currentAttestation?.fresh || source.state !== "active")) throw new Error("Approval requires DNS activation and a fresh accepted health attestation.");
  const nextStatus = input.decision === "approve" ? "approved" : input.decision === "request_attestation" ? "needs_attestation" : input.decision === "reject" ? "rejected" : input.decision === "withdraw" ? "withdrawn" : application.status;
  const nextState = sourceStateForReview(input.decision);
  const publicRationale = sanitizePublicRationale(input.publicRationale);
  await db.insert(sourceReviewEvents).values({ sourceId: input.sourceId, reviewerUserId, priorState: source.state, nextState, decision: input.decision, reasonCode: input.reasonCode, privateNote: input.privateNote?.trim().slice(0, 500) || null, publicRationale });
  await db.update(sourceReviewApplications).set({ status: nextStatus, publicRationale, updatedAtMs: Date.now() }).where(eq(sourceReviewApplications.sourceId, input.sourceId));
  if (input.decision === "quarantine" || input.decision === "withdraw" || input.decision === "reject") await db.update(globalTimeSources).set({ state: input.decision === "quarantine" ? "quarantined" : "withdrawn", nextEligibleAtMs: null }).where(eq(globalTimeSources.id, input.sourceId));
  return true;
}

export async function getSourceNetworkMetadata(sourceIds: string[]): Promise<Map<string, SourceNetworkMetadata>> {
  const db = await getDb(); if (!db || !sourceIds.length) return new Map();
  const rows = await db.select().from(sourceNetworkMetadata).where(inArray(sourceNetworkMetadata.sourceId, sourceIds)).limit(400);
  return new Map(rows.map(row => [row.sourceId, { sourceId: row.sourceId, asn: row.asn, countryCode: row.countryCode, regionCode: row.regionCode, confidence: row.confidence, observedAtMs: row.observedAtMs, expiresAtMs: row.expiresAtMs }]));
}
