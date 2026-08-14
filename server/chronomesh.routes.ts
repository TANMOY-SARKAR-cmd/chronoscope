import type { Express } from "express";

export function registerChronoMeshRoutes(app: Express) {
  app.get("/api/timesync", (_req, res) => {
    const serverReceiveMs = Date.now();
    const monotonicReceiveNs = process.hrtime.bigint().toString();
    const serverSendMs = Date.now();
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json({ serverReceiveMs, serverSendMs, monotonicReceiveNs });
  });

  app.get("/api/chronomesh/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "chronomesh-time-edge", timestampMs: Date.now() });
  });
}
