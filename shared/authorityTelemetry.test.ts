import { describe, expect, it } from "vitest";
import { authoritySeriesKey, buildAuthorityTelemetryPoint, getAuthorityTooltipRows } from "./authorityTelemetry";

describe("ChronoMesh authority telemetry", () => {
  const readings = [
    { id: "cloudflare", name: "Cloudflare", status: "reachable" as const, offsetMs: 1.25, delayMs: 8, uncertaintyMs: 1 },
    { id: "google", name: "Google", status: "unreachable" as const, offsetMs: null, delayMs: null, uncertaintyMs: null },
    { id: "private-host", name: "Private", status: "reachable" as const, offsetMs: 99, delayMs: 1, uncertaintyMs: 1 },
  ];

  it("records only the four documented authorities and keeps offset distinct from RTT delay", () => {
    const point = buildAuthorityTelemetryPoint(100, readings);
    expect(point).toMatchObject({ timestamp: 100, offset_cloudflare: 1.25, delay_cloudflare: 8, uncertainty_cloudflare: 1 });
    expect(point).not.toHaveProperty("offset_private-host");
    expect(authoritySeriesKey("google", "delay")).toBe("delay_google");
  });

  it("exposes tooltip rows only for sampled authority offsets with their matching delay and uncertainty", () => {
    const point = buildAuthorityTelemetryPoint(100, readings)!;
    expect(getAuthorityTooltipRows(point, readings)).toEqual([{ id: "cloudflare", name: "Cloudflare", offsetMs: 1.25, delayMs: 8, uncertaintyMs: 1 }]);
    expect(buildAuthorityTelemetryPoint(100, [{ ...readings[0], status: "unreachable", offsetMs: null }])).toBeNull();
  });
});
