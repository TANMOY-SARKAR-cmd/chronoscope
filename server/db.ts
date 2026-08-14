import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, ntpHealthSnapshots, timeMeasurements, timeSources, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { SyncEstimate } from "../shared/timeMath";
import type { TimeSource, UpstreamHealth } from "./ntp";

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
