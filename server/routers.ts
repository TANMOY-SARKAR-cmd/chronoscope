import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { normalizeChronoPreferences } from "../shared/chronoProfile";
import { calculateProbe, estimateTimeSync, validateRoomCode } from "../shared/timeMath";
import { createCommunitySource, getChronoPreferences, getCommunitySourceVerification, getGlobalMeshSources, getMeasurementHistory, getPublicGlobalMeshRegistry, getPublicStabilityLeaderboard, getPublicStabilityTags, getSourceAccuracyAnalytics, publishPublicStabilityEntry, saveChronoPreferences, setCommunitySourceState, storeMeasurementBurst, storeNtpHealthSnapshots, verifyCommunitySource } from "./db";
import { getSourceHistoryInsight } from "./sourceInsight";
import { getControlledTimeSourceHealth, getUpstreamNtpHealth, queryCustomNtpHost, validateNtpHostname, verifyNtpDnsOwnership } from "./ntp";
import { getChronoMeshRealtimeDiagnostics } from "./realtime";
import { clearGlobalSourceMeshCache, getGlobalSourceMesh } from "./globalMeshService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const customProbeWindows = new Map<string, { lastAt: number; count: number; resetAt: number }>();
function enforceCustomProbeLimit(key: string) {
  const now = Date.now(); const current = customProbeWindows.get(key);
  if (!current || current.resetAt < now) { customProbeWindows.set(key, { lastAt: now, count: 1, resetAt: now + 3_600_000 }); return; }
  if (now - current.lastAt < 10_000) throw new Error("Wait 10 seconds before probing another custom host.");
  if (current.count >= 12) throw new Error("Custom probe limit reached for this hour.");
  current.lastAt = now; current.count += 1;
}

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
    myCommunitySources: protectedProcedure.query(({ ctx }) => getGlobalMeshSources(ctx.user.id)),
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
