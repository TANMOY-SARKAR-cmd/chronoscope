import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { normalizeChronoPreferences } from "../shared/chronoProfile";
import { calculateProbe, estimateTimeSync, validateRoomCode } from "../shared/timeMath";
import { createAgentInstallation, createAttestationChallenge, createCommunitySource, decideSourceReviewApplication, getAgentInstallationByCredential, getAgentInstallations, getChronoPreferences, getCommunitySourceVerification, getFusionObservability, getGlobalMeshSources, getMeasurementHistory, getPublicGlobalMeshRegistry, getPublicSourceReviewApplications, getPublicStabilityLeaderboard, getPublicStabilityTags, getReviewerSourceApplications, getSourceAccuracyAnalytics, publishPublicStabilityEntry, revokeAgentInstallation, saveChronoPreferences, setCommunitySourceState, storeMeasurementBurst, storeNtpHealthSnapshots, upsertSourceReviewApplication, verifyCommunitySource } from "./db";
import { getSourceHistoryInsight } from "./sourceInsight";
import { getControlledTimeSourceHealth, getUpstreamNtpHealth, queryCustomNtpHost, validateNtpHostname, verifyNtpDnsOwnership } from "./ntp";
import { getChronoMeshRealtimeDiagnostics } from "./realtime";
import { clearGlobalSourceMeshCache, getGlobalSourceMesh } from "./globalMeshService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { AGENT_PLATFORMS, isValidAgentPublicKey, REVIEW_DECISIONS } from "../shared/agentTrust";
import { submitSignedAgentAttestation } from "./agentTrustService";
import { FUSION_OBSERVABILITY_RANGES } from "../shared/fusionObservability";

const customProbeWindows = new Map<string, { lastAt: number; count: number; resetAt: number }>();
function enforceCustomProbeLimit(key: string) {
  const now = Date.now(); const current = customProbeWindows.get(key);
  if (!current || current.resetAt < now) { customProbeWindows.set(key, { lastAt: now, count: 1, resetAt: now + 3_600_000 }); return; }
  if (now - current.lastAt < 10_000) throw new Error("Wait 10 seconds before probing another custom host.");
  if (current.count >= 12) throw new Error("Custom probe limit reached for this hour.");
  current.lastAt = now; current.count += 1;
}
export function requireSourceReviewer(user: { role: string }) { if (user.role !== "admin") throw new Error("Source review requires an administrator account."); }

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  profile: router({
    getChronoPreferences: protectedProcedure.query(({ ctx }) => getChronoPreferences(ctx.user.id)),
    saveChronoPreferences: protectedProcedure.input(z.object({
      alertEnabled: z.boolean(),
      alertThresholdMs: z.number().finite().min(0.1).max(86_400_000),
      hardwareTemplateOptIn: z.boolean(),
      hardwareTags: z.array(z.string().max(24)).max(5),
      hardwareDescription: z.string().max(160).nullable(),
      worldZones: z.array(z.string().min(1).max(64)).min(1).max(24),
      publicLeaderboardOptIn: z.boolean(),
      publicSetupLabel: z.string().max(48).nullable(),
      highContrastMode: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const preferences = normalizeChronoPreferences(input);
      if (!preferences) throw new Error("Saved preferences are invalid.");
      const stored = await saveChronoPreferences(ctx.user.id, preferences);
      return { stored, preferences };
    }),
  }),
  chronomesh: router({
    globalMesh: publicProcedure.query(() => getGlobalSourceMesh()),
    globalMeshRegistry: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(({ input }) => getPublicGlobalMeshRegistry(input?.limit ?? 100)),
    publicSourceReviewQueue: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()).query(({ input }) => getPublicSourceReviewApplications(input?.limit ?? 50)),
    myCommunitySources: protectedProcedure.query(({ ctx }) => getGlobalMeshSources(ctx.user.id)),
    myAgentInstallations: protectedProcedure.query(({ ctx }) => getAgentInstallations(ctx.user.id)),
    enrollAgentInstallation: protectedProcedure.input(z.object({ publicKey: z.string().trim().max(96), platform: z.enum(AGENT_PLATFORMS), agentVersion: z.string().trim().min(1).max(32), coarseRegion: z.string().trim().min(2).max(48).nullable() })).mutation(async ({ ctx, input }) => {
      if (!isValidAgentPublicKey(input.publicKey)) throw new Error("Provide a base64 Ed25519 public key.");
      return createAgentInstallation(ctx.user.id, input);
    }),
    revokeAgentInstallation: protectedProcedure.input(z.object({ installationId: z.string().min(12).max(64) })).mutation(({ ctx, input }) => revokeAgentInstallation(ctx.user.id, input.installationId)),
    requestAgentAttestationChallenge: publicProcedure.input(z.object({ installationId: z.string().min(12).max(64), enrollmentCredential: z.string().min(40).max(128), sourceId: z.string().min(12).max(64) })).mutation(async ({ input }) => {
      const installation = await getAgentInstallationByCredential(input.installationId, input.enrollmentCredential);
      if (!installation) throw new Error("Invalid or revoked contributor credential.");
      return createAttestationChallenge(installation.ownerUserId, { installationId: input.installationId, sourceId: input.sourceId });
    }),
    submitAgentAttestation: publicProcedure.input(z.object({ installationId: z.string().min(12).max(64), enrollmentCredential: z.string().min(40).max(128), nonce: z.string().min(32).max(64), envelope: z.object({ protocolVersion: z.literal(1), challengeId: z.string().min(12).max(64), sourceId: z.string().min(12).max(64), sampledAtMs: z.number().finite(), offsetMs: z.number().finite(), delayMs: z.number().finite(), uncertaintyMs: z.number().finite(), stratum: z.number().int().min(1).max(16).nullable(), agentVersion: z.string().trim().min(1).max(32), signatureBase64: z.string().min(64).max(128) }) })).mutation(async ({ input }) => {
      const installation = await getAgentInstallationByCredential(input.installationId, input.enrollmentCredential);
      if (!installation) throw new Error("Invalid or revoked contributor credential.");
      return submitSignedAgentAttestation(input.installationId, input.nonce, input.envelope);
    }),
    registerCommunitySource: protectedProcedure.input(z.object({ host: z.string().min(1).max(253), displayName: z.string().trim().min(2).max(80), publicMetadataOptIn: z.boolean(), publicLabel: z.string().trim().min(2).max(48).nullable(), region: z.string().trim().min(2).max(48).nullable() })).mutation(async ({ ctx, input }) => {
      const validated = validateNtpHostname(input.host);
      if (!validated.valid) throw new Error(validated.reason);
      if (input.publicMetadataOptIn && !input.publicLabel) throw new Error("Provide a public label or keep community metadata private.");
      const result = await createCommunitySource(ctx.user.id, { ...input, host: validated.host, publicLabel: input.publicMetadataOptIn ? input.publicLabel : null });
      clearGlobalSourceMeshCache();
      return result;
    }),
    verifyCommunitySource: protectedProcedure.input(z.object({ sourceId: z.string().min(12).max(64) })).mutation(async ({ ctx, input }) => {
      const verification = await getCommunitySourceVerification(ctx.user.id, input.sourceId);
      if (!verification || verification.state !== "pending" || !verification.verificationToken) throw new Error("This source is not awaiting DNS verification.");
      const verified = await verifyNtpDnsOwnership(verification.host, verification.verificationToken);
      if (!verified) throw new Error(`Publish DNS TXT _chronomesh.${verification.host} with chronomesh-verify=<your token>, then try again.`);
      const activated = await verifyCommunitySource(ctx.user.id, input.sourceId);
      clearGlobalSourceMeshCache();
      return { activated };
    }),
    setCommunitySourceState: protectedProcedure.input(z.object({ sourceId: z.string().min(12).max(64), state: z.enum(["paused", "withdrawn"]) })).mutation(async ({ ctx, input }) => {
      const updated = await setCommunitySourceState(ctx.user.id, input.sourceId, input.state);
      clearGlobalSourceMeshCache();
      return { updated };
    }),
    submitSourceReviewApplication: protectedProcedure.input(z.object({ sourceId: z.string().min(12).max(64), capabilities: z.array(z.string().trim().min(2).max(48)).min(1).max(8), publicQueueOptIn: z.boolean(), requestedPublicLabel: z.string().trim().min(2).max(48).nullable() })).mutation(async ({ ctx, input }) => {
      const stored = await upsertSourceReviewApplication(ctx.user.id, input);
      clearGlobalSourceMeshCache();
      return { stored };
    }),
    reviewerSourceApplications: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()).query(async ({ ctx, input }) => { requireSourceReviewer(ctx.user); return getReviewerSourceApplications(input?.limit ?? 50); }),
    decideSourceReviewApplication: protectedProcedure.input(z.object({ sourceId: z.string().min(12).max(64), decision: z.enum(REVIEW_DECISIONS), reasonCode: z.string().trim().min(2).max(96), privateNote: z.string().trim().max(500).nullable(), publicRationale: z.string().trim().max(280).nullable() })).mutation(async ({ ctx, input }) => {
      requireSourceReviewer(ctx.user); const updated = await decideSourceReviewApplication(ctx.user.id, input); clearGlobalSourceMeshCache(); return { updated };
    }),
    upstreamHealth: publicProcedure.query(async () => {
      const readings = await getUpstreamNtpHealth();
      try { await storeNtpHealthSnapshots(readings); } catch (error) { console.warn("[ChronoMesh] authority snapshot persistence skipped:", error); }
      return { generatedAt: Date.now(), readings };
    }),
    sourceHealth: publicProcedure.query(async () => {
      const readings = await getControlledTimeSourceHealth();
      try { await storeNtpHealthSnapshots(readings); } catch (error) { console.warn("[ChronoMesh] source snapshot persistence skipped:", error); }
      return { generatedAt: Date.now(), readings };
    }),
    sourceAnalytics: publicProcedure.input(z.object({ range: z.enum(["24h", "7d", "30d"]).default("24h") })).query(({ input }) => getSourceAccuracyAnalytics(input.range)),
    fusionObservability: publicProcedure.input(z.object({ range: z.enum(FUSION_OBSERVABILITY_RANGES).default("24h") }).optional()).query(({ input }) => getFusionObservability(input?.range ?? "24h")),
    sourceHistoryInsight: publicProcedure.input(z.object({ range: z.enum(["24h", "7d", "30d"]).default("24h") })).query(({ input }) => getSourceHistoryInsight(input.range)),
    publicStabilityLeaderboard: publicProcedure.input(z.object({ tag: z.string().trim().max(24).optional(), limit: z.number().int().min(1).max(100).default(100) }).optional()).query(({ input }) => getPublicStabilityLeaderboard(input?.tag, input?.limit ?? 100)),
    publicStabilityTags: publicProcedure.query(() => getPublicStabilityTags()),
    publishPublicStability: protectedProcedure.input(z.object({ offsetMs: z.number().finite().min(-86_400_000).max(86_400_000), jitterMs: z.number().finite().min(0), uncertaintyMs: z.number().finite().min(0), sampleCount: z.number().int().min(1).max(1_000) })).mutation(({ ctx, input }) => publishPublicStabilityEntry(ctx.user.id, input)),
    realtimeDiagnostics: publicProcedure.query(() => getChronoMeshRealtimeDiagnostics()),
    probeCustomSource: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(64), host: z.string().min(1).max(253) })).mutation(async ({ ctx, input }) => {
      enforceCustomProbeLimit(`${input.sessionId}:${ctx.req.ip ?? "unknown"}`);
      return queryCustomNtpHost(input.host);
    }),
    measurementHistory: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(64), limit: z.number().int().min(1).max(2_000).default(2_000) })).query(({ input }) => getMeasurementHistory(input.sessionId, input.limit)),
    recordBurst: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(64), burstId: z.string().min(8).max(64), roomCode: z.string().optional().nullable(), samples: z.array(z.object({ sampleIndex: z.number().int().min(1).max(50), t1: z.number().finite(), t2: z.number().finite(), t3: z.number().finite(), t4: z.number().finite() })).min(1).max(15) })).mutation(async ({ input }) => {
      const roomCode = input.roomCode?.trim().toUpperCase() || null;
      if (roomCode && !validateRoomCode(roomCode)) throw new Error("Room code must have exactly five characters.");
      const estimate = estimateTimeSync(input.samples.map(sample => calculateProbe(sample.sampleIndex, sample.t1, sample.t2, sample.t3, sample.t4)));
      const stored = await storeMeasurementBurst({ sessionId: input.sessionId, burstId: input.burstId, roomCode, estimate });
      return { stored, offsetMs: estimate.offsetMs, uncertaintyMs: estimate.uncertaintyMs };
    }),
  }),
});

export type AppRouter = typeof appRouter;
