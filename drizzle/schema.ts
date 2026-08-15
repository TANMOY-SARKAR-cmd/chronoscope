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

/** Device-bound contributor keys remain private to their owner and trusted reviewers. */
export const operatorAgentInstallations = mysqlTable("operator_agent_installations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  publicKey: varchar("publicKey", { length: 96 }).notNull(),
  keyFingerprint: varchar("keyFingerprint", { length: 64 }).notNull().unique(),
  accessTokenHash: varchar("accessTokenHash", { length: 64 }).notNull().unique(),
  platform: mysqlEnum("platform", ["linux", "windows", "ios"]).notNull(),
  agentVersion: varchar("agentVersion", { length: 32 }).notNull(),
  coarseRegion: varchar("coarseRegion", { length: 48 }),
  lastSeenAtMs: double("lastSeenAtMs"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("agent_installation_owner_idx").on(table.ownerUserId, table.revokedAt)]);

/** Single-use challenges are stored only as SHA-256 hashes to prevent replay. */
export const operatorAttestationChallenges = mysqlTable("operator_attestation_challenges", {
  id: varchar("id", { length: 64 }).primaryKey(),
  installationId: varchar("installationId", { length: 64 }).notNull(),
  sourceId: varchar("sourceId", { length: 64 }).notNull(),
  nonceHash: varchar("nonceHash", { length: 64 }).notNull(),
  expiresAtMs: double("expiresAtMs").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("attestation_challenge_installation_idx").on(table.installationId, table.expiresAtMs), index("attestation_challenge_source_idx").on(table.sourceId, table.expiresAtMs)]);

/** Accepted/rejected records retain evidence hashes and derived quality, never a raw signed envelope. */
export const operatorHealthAttestations = mysqlTable("operator_health_attestations", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: varchar("sourceId", { length: 64 }).notNull(),
  installationId: varchar("installationId", { length: 64 }).notNull(),
  envelopeHash: varchar("envelopeHash", { length: 64 }).notNull(),
  qualityBand: mysqlEnum("qualityBand", ["healthy", "watch", "degraded"]).notNull(),
  status: mysqlEnum("status", ["accepted", "rejected"]).notNull(),
  reasonCode: varchar("reasonCode", { length: 96 }),
  sampledAtMs: double("sampledAtMs").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("health_attestation_source_sampled_idx").on(table.sourceId, table.sampledAtMs), index("health_attestation_installation_idx").on(table.installationId, table.createdAt)]);

/** A source owner's review request is isolated from the public queue projection. */
export const sourceReviewApplications = mysqlTable("source_review_applications", {
  sourceId: varchar("sourceId", { length: 64 }).primaryKey(),
  applicantUserId: int("applicantUserId").notNull(),
  status: mysqlEnum("status", ["pending", "needs_attestation", "approved", "rejected", "withdrawn"]).default("pending").notNull(),
  capabilitiesJson: text("capabilitiesJson").notNull(),
  publicQueueOptIn: boolean("publicQueueOptIn").default(false).notNull(),
  requestedPublicLabel: varchar("requestedPublicLabel", { length: 48 }),
  publicRationale: varchar("publicRationale", { length: 280 }),
  submittedAtMs: double("submittedAtMs").notNull(),
  updatedAtMs: double("updatedAtMs").notNull(),
}, table => [index("review_application_status_idx").on(table.status, table.updatedAtMs), index("review_application_applicant_idx").on(table.applicantUserId, table.updatedAtMs)]);

/** Every state-changing review action has an auditable public and private rationale boundary. */
export const sourceReviewEvents = mysqlTable("source_review_events", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: varchar("sourceId", { length: 64 }).notNull(),
  reviewerUserId: int("reviewerUserId").notNull(),
  priorState: varchar("priorState", { length: 24 }).notNull(),
  nextState: varchar("nextState", { length: 24 }).notNull(),
  decision: mysqlEnum("decision", ["approve", "request_attestation", "quarantine", "reject", "withdraw"]).notNull(),
  reasonCode: varchar("reasonCode", { length: 96 }).notNull(),
  privateNote: varchar("privateNote", { length: 500 }),
  publicRationale: varchar("publicRationale", { length: 280 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("review_event_source_created_idx").on(table.sourceId, table.createdAt), index("review_event_reviewer_created_idx").on(table.reviewerUserId, table.createdAt)]);

/** Cached, coarse network metadata informs correlation penalties without exposing raw endpoints publicly. */
export const sourceNetworkMetadata = mysqlTable("source_network_metadata", {
  sourceId: varchar("sourceId", { length: 64 }).primaryKey(),
  asn: varchar("asn", { length: 24 }),
  countryCode: varchar("countryCode", { length: 8 }),
  regionCode: varchar("regionCode", { length: 24 }),
  lookupSource: varchar("lookupSource", { length: 48 }).notNull(),
  confidence: mysqlEnum("confidence", ["unknown", "low", "medium", "high"]).default("unknown").notNull(),
  observedAtMs: double("observedAtMs").notNull(),
  expiresAtMs: double("expiresAtMs").notNull(),
}, table => [index("network_metadata_expiry_idx").on(table.expiresAtMs)]);
