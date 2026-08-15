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

/** Signed-in preferences are private by default; room sharing remains an explicit live opt-in. */
export const userChronoPreferences = mysqlTable("user_chrono_preferences", {
  userId: int("userId").primaryKey(),
  alertEnabled: boolean("alertEnabled").default(true).notNull(),
  alertThresholdMs: double("alertThresholdMs").default(25).notNull(),
  hardwareTemplateOptIn: boolean("hardwareTemplateOptIn").default(false).notNull(),
  hardwareTagsJson: text("hardwareTagsJson").notNull(),
  hardwareDescription: varchar("hardwareDescription", { length: 160 }),
  worldZonesJson: text("worldZonesJson").notNull(),
  publicLeaderboardOptIn: boolean("publicLeaderboardOptIn").default(false).notNull(),
  publicSetupLabel: varchar("publicSetupLabel", { length: 48 }),
  highContrastMode: boolean("highContrastMode").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Public rows are populated only by a signed-in operator’s explicit publish action. */
export const publicStabilityEntries = mysqlTable("public_stability_entries", {
  userId: int("userId").primaryKey(),
  setupLabel: varchar("setupLabel", { length: 48 }).notNull(),
  hardwareTagsJson: text("hardwareTagsJson").notNull(),
  stabilityScore: double("stabilityScore").notNull(),
  offsetMs: double("offsetMs").notNull(),
  jitterMs: double("jitterMs").notNull(),
  uncertaintyMs: double("uncertaintyMs").notNull(),
  sampleCount: int("sampleCount").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("public_stability_score_idx").on(table.stabilityScore, table.updatedAt)]);

/** Short-lived anonymous room events permit a bounded database relay when managed pub/sub is unavailable. */
export const roomRelayEvents = mysqlTable("room_relay_events", {
  id: int("id").autoincrement().primaryKey(),
  originId: varchar("originId", { length: 64 }).notNull(),
  roomCode: varchar("roomCode", { length: 5 }).notNull(),
  eventType: mysqlEnum("eventType", ["upsert", "remove"]).notNull(),
  peerId: varchar("peerId", { length: 16 }).notNull(),
  payloadJson: text("payloadJson"),
  expiresAtMs: double("expiresAtMs").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("room_relay_room_id_idx").on(table.roomCode, table.id), index("room_relay_expiry_idx").on(table.expiresAtMs)]);

/** Opt-in global source catalog. Public metadata is distinct from operator ownership data. */
export const globalTimeSources = mysqlTable("global_time_sources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerUserId: int("ownerUserId"),
  displayName: varchar("displayName", { length: 80 }).notNull(),
  host: varchar("host", { length: 253 }).notNull().unique(),
  sourceClass: mysqlEnum("sourceClass", ["authority", "regional_pool", "official", "community"]).notNull(),
  state: mysqlEnum("state", ["pending", "active", "paused", "quarantined", "withdrawn"]).default("pending").notNull(),
  provenance: mysqlEnum("provenance", ["curated", "verified_operator", "operator_declared"]).default("operator_declared").notNull(),
  verificationMethod: mysqlEnum("verificationMethod", ["none", "dns_txt", "https_token"]).default("none").notNull(),
  verificationToken: varchar("verificationToken", { length: 96 }),
  verifiedAt: timestamp("verifiedAt"),
  publicMetadataOptIn: boolean("publicMetadataOptIn").default(false).notNull(),
  publicLabel: varchar("publicLabel", { length: 48 }),
  region: varchar("region", { length: 48 }),
  groupKey: varchar("groupKey", { length: 96 }).notNull(),
  consecutiveFailures: int("consecutiveFailures").default(0).notNull(),
  nextEligibleAtMs: double("nextEligibleAtMs"),
  lastProbeAtMs: double("lastProbeAtMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("global_time_sources_state_idx").on(table.state, table.nextEligibleAtMs), index("global_time_sources_owner_idx").on(table.ownerUserId), index("global_time_sources_class_idx").on(table.sourceClass)]);

/** Bounded per-source telemetry retained for quality and conservative fusion calculations. */
export const globalSourceProbeSnapshots = mysqlTable("global_source_probe_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: varchar("sourceId", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["reachable", "unreachable", "blocked", "quarantined"]).notNull(),
  detail: varchar("detail", { length: 255 }),
  offsetMs: double("offsetMs"),
  delayMs: double("delayMs"),
  uncertaintyMs: double("uncertaintyMs"),
  stratum: int("stratum"),
  sampledAtMs: double("sampledAtMs").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("global_probe_source_sampled_idx").on(table.sourceId, table.sampledAtMs)]);

/** Compact quality data avoids exposing raw peer or contributor identifiers in public views. */
export const globalSourceQualitySummaries = mysqlTable("global_source_quality_summaries", {
  sourceId: varchar("sourceId", { length: 64 }).primaryKey(),
  reachableSamples: int("reachableSamples").default(0).notNull(),
  totalSamples: int("totalSamples").default(0).notNull(),
  medianOffsetMs: double("medianOffsetMs"),
  medianUncertaintyMs: double("medianUncertaintyMs"),
  medianDelayMs: double("medianDelayMs"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
