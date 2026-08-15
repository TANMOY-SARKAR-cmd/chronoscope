import { describe, expect, it } from "vitest";
import { buildSourceInsightPrompt, getSourceInsightDataSignature, parseSourceInsightJson, sourceInsightFallback, validateSourceInsight } from "./sourceInsight";

const analytics = {
  range: "24h" as const,
  generatedAt: 1_700_000_000_000,
  sources: [{ id: "cloudflare", name: "Cloudflare", samples: 12, availabilityPct: 100, medianOffsetMs: 1.5, jitterMs: 0.2, medianUncertaintyMs: 0.8, lastSampledAt: 1_700_000_000_000 }],
  timeline: [],
};

describe("ChronoMesh source-history insight contracts", () => {
  it("accepts only evidence tied to observed sources and schema metrics", () => {
    const result = validateSourceInsight({ summary: "Observed jitter remains low in this window.", jitterTrend: "stable", offsetAssessment: "no_clear_anomaly", evidence: [{ source: "Cloudflare", metric: "jitterMs", value: 0.2 }, { source: "Invented", metric: "samples", value: 9 }], limitation: "This describes aggregate server-side observations only." }, analytics);
    expect(result?.evidence).toEqual([{ source: "Cloudflare", metric: "jitterMs", value: 0.2 }]);
  });

  it("uses a cautious fallback and limits the model prompt to supplied measurements", () => {
    expect(sourceInsightFallback(analytics).limitation).toContain("server-side samples");
    const prompt = buildSourceInsightPrompt(analytics);
    expect(prompt).toContain("Cloudflare");
    expect(prompt).toContain("Do not claim causation");
  });

  it("extracts a fenced response object while rejecting incomplete model output", () => {
    expect(parseSourceInsightJson("```json\n{\"summary\":\"ok\"}\n```" )).toEqual({ summary: "ok" });
    expect(parseSourceInsightJson("{\"summary\":\"unterminated" )).toBeNull();
  });

  it("changes its bounded cache signature whenever source-history evidence changes", () => {
    const before = getSourceInsightDataSignature(analytics);
    const after = getSourceInsightDataSignature({ ...analytics, sources: [{ ...analytics.sources[0], samples: 13, lastSampledAt: analytics.sources[0].lastSampledAt + 1 }] });
    expect(after).not.toBe(before);
    expect(getSourceInsightDataSignature(analytics)).toBe(before);
  });
});
