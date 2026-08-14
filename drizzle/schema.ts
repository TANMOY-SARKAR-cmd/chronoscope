import { boolean, double, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
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

/** Anonymous timing probes, retained for session history and aggregate stability analysis. */
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
}, table => [index("time_measurements_session_idx").on(table.sessionId), index("time_measurements_room_created_idx").on(table.roomCode, table.createdAt)]);

/** Curated, public source inventory. Custom host probes deliberately never enter this table. */
export const timeSources = mysqlTable("time_sources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  displayName: varchar("displayName", { length: 80 }).notNull(),
  host: varchar("host", { length: 253 }).notNull(),
  sourceTier: mysqlEnum("sourceTier", ["authority", "regional_pool"]).notNull(),
  region: varchar("region", { length: 48 }),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Backend-to-upstream observations used to make source transparency auditable. */
export const ntpHealthSnapshots = mysqlTable("ntp_health_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  authority: varchar("authority", { length: 64 }).notNull(),
  host: varchar("host", { length: 253 }).notNull(),
  sourceTier: mysqlEnum("sourceTier", ["authority", "regional_pool"]).default("authority").notNull(),
  region: varchar("region", { length: 48 }),
  status: mysqlEnum("status", ["reachable", "unreachable"]).notNull(),
  detail: varchar("detail", { length: 255 }),
  offsetMs: double("offsetMs"),
  delayMs: double("delayMs"),
  uncertaintyMs: double("uncertaintyMs"),
  sampledAtMs: double("sampledAtMs").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("ntp_health_authority_sampled_idx").on(table.authority, table.sampledAtMs), index("ntp_health_tier_sampled_idx").on(table.sourceTier, table.sampledAtMs)]);
