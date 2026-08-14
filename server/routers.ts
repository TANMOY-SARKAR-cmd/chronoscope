import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { calculateProbe, estimateTimeSync, validateRoomCode } from "../shared/timeMath";
import { storeMeasurementBurst, storeNtpHealthSnapshots } from "./db";
import { getUpstreamNtpHealth } from "./ntp";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  chronomesh: router({
    upstreamHealth: publicProcedure.query(async () => {
      const readings = await getUpstreamNtpHealth();
      try {
        await storeNtpHealthSnapshots(readings);
      } catch (error) {
        console.warn("[ChronoMesh] NTP health snapshot persistence skipped:", error);
      }
      return { generatedAt: Date.now(), readings };
    }),
    recordBurst: publicProcedure.input(z.object({
      sessionId: z.string().min(8).max(64),
      burstId: z.string().min(8).max(64),
      roomCode: z.string().optional().nullable(),
      samples: z.array(z.object({
        sampleIndex: z.number().int().min(1).max(50),
        t1: z.number().finite(),
        t2: z.number().finite(),
        t3: z.number().finite(),
        t4: z.number().finite(),
      })).min(1).max(15),
    })).mutation(async ({ input }) => {
      const roomCode = input.roomCode?.trim().toUpperCase() || null;
      if (roomCode && !validateRoomCode(roomCode)) throw new Error("Room code must have exactly five characters.");
      const estimate = estimateTimeSync(input.samples.map(sample => calculateProbe(sample.sampleIndex, sample.t1, sample.t2, sample.t3, sample.t4)));
      const stored = await storeMeasurementBurst({ sessionId: input.sessionId, burstId: input.burstId, roomCode, estimate });
      return { stored, offsetMs: estimate.offsetMs, uncertaintyMs: estimate.uncertaintyMs };
    }),
  }),
});

export type AppRouter = typeof appRouter;
