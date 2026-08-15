import { and, desc, eq, gt, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, ntpHealthSnapshots, publicStabilityEntries, roomRelayEvents, timeMeasurements, timeSources, userChronoPreferences, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateStabilityScore, type SyncEstimate } from "../shared/timeMath";
import type { TimeSource, UpstreamHealth } from "./ntp";
import { aggregateSourceAccuracy, getSourceRangeStart, type SourceAccuracyRange } from "../shared/sourceAnalytics";
import { filterPublicSetupsByTag, normalizeLeaderboardTagFilter } from "../shared/peerComparison";

let _db: ReturnType<typeof drizzle> | null = null;
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
