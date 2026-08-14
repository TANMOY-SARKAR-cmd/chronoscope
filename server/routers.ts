import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { calculateProbe, estimateTimeSync, validateRoomCode } from "../shared/timeMath";
import { getMeasurementHistory, storeMeasurementBurst, storeNtpHealthSnapshots } from "./db";
import { getControlledTimeSourceHealth, getUpstreamNtpHealth, queryCustomNtpHost } from "./ntp";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

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
  chronomesh: router({
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
