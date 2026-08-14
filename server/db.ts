import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, ntpHealthSnapshots, timeMeasurements, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { UpstreamHealth } from "./ntp";
import type { SyncEstimate } from "../shared/timeMath";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function storeMeasurementBurst(input: {
  sessionId: string;
  burstId: string;
  roomCode?: string | null;
  estimate: SyncEstimate;
}) {
  const db = await getDb();
  if (!db || input.estimate.samples.length === 0) return false;
  await db.insert(timeMeasurements).values(input.estimate.samples.map(sample => ({
    sessionId: input.sessionId,
    burstId: input.burstId,
    roomCode: input.roomCode ?? null,
    sampleIndex: sample.sampleIndex,
    clientSentMs: sample.t1,
    serverReceivedMs: sample.t2,
    serverSentMs: sample.t3,
    clientReceivedMs: sample.t4,
    offsetMs: sample.offsetMs,
    delayMs: sample.delayMs,
    jitterMs: input.estimate.jitterMs,
    uncertaintyMs: input.estimate.uncertaintyMs,
    sampleCount: input.estimate.samples.length,
  })));
  return true;
}

export async function storeNtpHealthSnapshots(readings: UpstreamHealth[]) {
  const db = await getDb();
  if (!db || readings.length === 0) return false;
  await db.insert(ntpHealthSnapshots).values(readings.map(reading => ({
    authority: reading.id,
    host: reading.host,
    status: reading.status,
    offsetMs: reading.offsetMs,
    delayMs: reading.delayMs,
    uncertaintyMs: reading.uncertaintyMs,
    sampledAtMs: reading.sampledAt,
  })));
  return true;
}
