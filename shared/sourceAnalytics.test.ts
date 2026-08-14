import { describe, expect, it } from "vitest";
import { aggregateSourceAccuracy, getSourceRangeStart } from "./sourceAnalytics";

describe("ChronoMesh source-accuracy aggregation", () => {
  it("summarizes availability, median offset, jitter, uncertainty, and time buckets without filling missing data", () => {
    const start = 1_700_000_000_000;
    const result = aggregateSourceAccuracy([
      { authority: "cloudflare", status: "reachable", offsetMs: 2, uncertaintyMs: 1, sampledAtMs: start },
      { authority: "cloudflare", status: "reachable", offsetMs: 4, uncertaintyMs: 3, sampledAtMs: start + 1_000 },
      { authority: "cloudflare", status: "unreachable", offsetMs: null, uncertaintyMs: null, sampledAtMs: start + 3_700_000 },
      { authority: "google", status: "reachable", offsetMs: -1, uncertaintyMs: 2, sampledAtMs: start + 3_800_000 },
    ], new Map([["cloudflare", "Cloudflare"], ["google", "Google"]]), "24h");

    const cloudflare = result.sources.find(source => source.id === "cloudflare");
    expect(cloudflare).toMatchObject({ name: "Cloudflare", samples: 3, availabilityPct: expect.closeTo(66.667, 2), medianOffsetMs: 3, medianUncertaintyMs: 2 });
    expect(cloudflare?.jitterMs).toBeCloseTo(1);
    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0]).toMatchObject({ samples: 2, availabilityPct: 100, medianOffsetMs: 3 });
    expect(result.timeline[1]).toMatchObject({ samples: 2, availabilityPct: 50, medianOffsetMs: -1 });
  });

  it("returns an empty analytic result for an empty range and computes fixed range boundaries", () => {
    expect(aggregateSourceAccuracy([], new Map(), "7d")).toEqual({ sources: [], timeline: [] });
    expect(getSourceRangeStart("24h", 100_000_000)).toBe(13_600_000);
    expect(getSourceRangeStart("30d", 3_000_000_000)).toBe(408_000_000);
  });
});
