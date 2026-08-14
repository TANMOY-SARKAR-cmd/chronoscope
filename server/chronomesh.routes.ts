import type { Express } from "express";
import { storeNtpHealthSnapshots } from "./db";
import { getControlledTimeSourceHealth } from "./ntp";
import { sdk } from "./_core/sdk";

export function registerChronoMeshRoutes(app: Express) {
  app.get("/api/timesync", (_req, res) => {
    const serverReceiveMs = Date.now(); const monotonicReceiveNs = process.hrtime.bigint().toString(); const serverSendMs = Date.now();
    res.setHeader("Cache-Control", "no-store, max-age=0"); res.json({ serverReceiveMs, serverSendMs, monotonicReceiveNs });
  });
  app.get("/api/chronomesh/health", (_req, res) => res.status(200).json({ ok: true, service: "chronomesh-time-edge", timestampMs: Date.now() }));
  app.post("/api/scheduled/chronomesh-source-refresh", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) return res.status(403).json({ error: "cron-only" });
      const readings = await getControlledTimeSourceHealth(true); await storeNtpHealthSnapshots(readings);
      return res.json({ ok: true, refreshed: readings.length, timestamp: Date.now() });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Source refresh failed.", timestamp: Date.now() });
    }
  });
}
