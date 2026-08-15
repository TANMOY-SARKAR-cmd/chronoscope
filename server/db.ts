import { and, desc, eq, gt, gte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomUUID } from "node:crypto";
import { InsertUser, globalSourceProbeSnapshots, globalSourceQualitySummaries, globalTimeSources, ntpHealthSnapshots, publicStabilityEntries, roomRelayEvents, timeMeasurements, timeSources, userChronoPreferences, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateStabilityScore, type SyncEstimate } from "../shared/timeMath";
import type { TimeSource, UpstreamHealth } from "./ntp";
import { aggregateSourceAccuracy, getSourceRangeStart, type SourceAccuracyRange } from "../shared/sourceAnalytics";
import { filterPublicSetupsByTag, normalizeLeaderboardTagFilter } from "../shared/peerComparison";
import { calculateBackoffMs, canTransitionCommunitySource, type GlobalMeshSource, type MeshProbeReading } from "../shared/globalMesh";

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
    const medianValue = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null; };
    await db.insert(globalSourceQualitySummaries).values({ sourceId: reading.sourceId, reachableSamples: reachable.length, totalSamples: probeHistory.length, medianOffsetMs: medianValue(reachable.map(item => item.offsetMs!)), medianUncertaintyMs: medianValue(reachable.map(item => item.uncertaintyMs!)), medianDelayMs: medianValue(reachable.map(item => item.delayMs!)) }).onDuplicateKeyUpdate({ set: { reachableSamples: reachable.length, totalSamples: probeHistory.length, medianOffsetMs: medianValue(reachable.map(item => item.offsetMs!)), medianUncertaintyMs: medianValue(reachable.map(item => item.uncertaintyMs!)), medianDelayMs: medianValue(reachable.map(item => item.delayMs!)), updatedAt: new Date() } });
  }
  return true;
}

export async function getGlobalMeshQualitySummaries(sourceIds: string[]) {
  const db = await getDb(); if (!db || !sourceIds.length) return new Map<string, { reachableSamples: number; totalSamples: number; medianOffsetMs: number | null; medianUncertaintyMs: number | null; medianDelayMs: number | null }>();
  const summaries = await db.select().from(globalSourceQualitySummaries).where(inArray(globalSourceQualitySummaries.sourceId, sourceIds)).limit(400);
  return new Map(summaries.map(summary => [summary.sourceId, { reachableSamples: summary.reachableSamples, totalSamples: summary.totalSamples, medianOffsetMs: summary.medianOffsetMs, medianUncertaintyMs: summary.medianUncertaintyMs, medianDelayMs: summary.medianDelayMs }]));
}

export async function getGlobalMeshLatestReadings(sourceIds: string[]) {
  const db = await getDb(); if (!db || !sourceIds.length) return [] as MeshProbeReading[];
  const snapshots = await db.select().from(globalSourceProbeSnapshots).where(inArray(globalSourceProbeSnapshots.sourceId, sourceIds)).orderBy(desc(globalSourceProbeSnapshots.sampledAtMs)).limit(Math.min(2_000, sourceIds.length * 8));
  const sources = await db.select().from(globalTimeSources).where(inArray(globalTimeSources.id, sourceIds)).limit(400);
  const sourceById = new Map(sources.map(source => [source.id, source])); const seen = new Set<string>();
  return snapshots.flatMap(snapshot => { if (seen.has(snapshot.sourceId)) return []; seen.add(snapshot.sourceId); const source = sourceById.get(snapshot.sourceId); if (!source) return []; return [{ sourceId: snapshot.sourceId, sourceClass: source.sourceClass, groupKey: source.groupKey, status: snapshot.status, detail: snapshot.detail, offsetMs: snapshot.offsetMs, delayMs: snapshot.delayMs, uncertaintyMs: snapshot.uncertaintyMs, stratum: snapshot.stratum, sampledAtMs: snapshot.sampledAtMs } satisfies MeshProbeReading]; });
}

export async function getPublicGlobalMeshRegistry(limit = 200) {
  const db = await getDb(); if (!db) return [] as Array<Pick<GlobalMeshSource, "id" | "displayName" | "sourceClass" | "state" | "provenance" | "publicMetadataOptIn" | "publicLabel" | "region">>;
  const sources = await db.select().from(globalTimeSources).where(and(eq(globalTimeSources.state, "active"), eq(globalTimeSources.publicMetadataOptIn, true))).orderBy(globalTimeSources.sourceClass, globalTimeSources.displayName).limit(Math.min(Math.max(1, limit), 200));
  return sources.map(source => ({ ...mapGlobalSource(source), host: undefined, groupKey: undefined, lastProbeAtMs: undefined, consecutiveFailures: undefined, nextEligibleAtMs: undefined }));
}
