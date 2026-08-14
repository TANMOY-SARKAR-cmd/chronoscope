import { double, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Anonymous timing probes, retained for history and aggregate stability analysis. */
export const timeMeasurements = mysqlTable("time_measurements", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  burstId: varchar("burstId", { length: 64 }).notNull(),
  roomCode: varchar("roomCode", { length: 5 }),
  sampleIndex: int("sampleIndex").notNull(),
  clientSentMs: double("clientSentMs").notNull(),
  serverReceivedMs: double("serverReceivedMs").notNull(),
  serverSentMs: double("serverSentMs").notNull(),
  clientReceivedMs: double("clientReceivedMs").notNull(),
  offsetMs: double("offsetMs").notNull(),
  delayMs: double("delayMs").notNull(),
  jitterMs: double("jitterMs").notNull(),
  uncertaintyMs: double("uncertaintyMs").notNull(),
  sampleCount: int("sampleCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("time_measurements_session_idx").on(table.sessionId),
  index("time_measurements_room_created_idx").on(table.roomCode, table.createdAt),
]);

/** Backend-to-upstream NTP observations used to make server transparency auditable. */
export const ntpHealthSnapshots = mysqlTable("ntp_health_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  authority: varchar("authority", { length: 32 }).notNull(),
  host: varchar("host", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["reachable", "unreachable"]).notNull(),
  offsetMs: double("offsetMs"),
  delayMs: double("delayMs"),
  uncertaintyMs: double("uncertaintyMs"),
  sampledAtMs: double("sampledAtMs").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("ntp_health_authority_sampled_idx").on(table.authority, table.sampledAtMs)]);
