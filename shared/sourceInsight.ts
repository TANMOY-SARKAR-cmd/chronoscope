import { z } from "zod";
import type { getSourceAccuracyAnalytics } from "../server/db";

export const SOURCE_INSIGHT_METRICS = ["availabilityPct", "medianOffsetMs", "jitterMs", "medianUncertaintyMs", "samples"] as const;

export const sourceInsightSchema = z.object({
  summary: z.string().trim().min(1).max(420),
  jitterTrend: z.enum(["stable", "rising", "variable", "insufficient_data"]),
  offsetAssessment: z.enum(["no_clear_anomaly", "possible_anomaly", "insufficient_data"]),
  evidence: z.array(z.object({ source: z.string().min(1).max(80), metric: z.enum(SOURCE_INSIGHT_METRICS), value: z.number().finite() })).min(1).max(3),
  limitation: z.string().trim().min(1).max(160),
});

export type SourceInsight = z.infer<typeof sourceInsightSchema>;
export type SourceAnalytics = Awaited<ReturnType<typeof getSourceAccuracyAnalytics>>;

export function validateSourceInsight(input: unknown, analytics: SourceAnalytics): SourceInsight | null {
  const parsed = sourceInsightSchema.safeParse(input);
  if (!parsed.success) return null;
  const sources = new Map(analytics.sources.map(source => [source.name, source]));
  const validEvidence = parsed.data.evidence.filter(item => {
    const source = sources.get(item.source);
    if (!source) return false;
    return item.metric in source && Number.isFinite(item.value);
  });
  return validEvidence.length ? { ...parsed.data, evidence: validEvidence } : null;
}

export function buildSourceInsightPrompt(analytics: SourceAnalytics) {
  const evidence = analytics.sources.map(source => ({ source: source.name, samples: source.samples, availabilityPct: Number(source.availabilityPct.toFixed(3)), medianOffsetMs: source.medianOffsetMs, jitterMs: source.jitterMs, medianUncertaintyMs: source.medianUncertaintyMs }));
  return `Explain only the supplied ChronoMesh source-history evidence. Do not claim causation, absolute accuracy, or predict future performance. Say insufficient_data when appropriate. A possible anomaly is a descriptive observation, not a fault diagnosis. Return JSON matching the schema. Data: ${JSON.stringify({ range: analytics.range, generatedAt: analytics.generatedAt, sources: evidence, timelineBuckets: analytics.timeline.length })}`;
}

export function sourceInsightFallback(analytics: SourceAnalytics): SourceInsight {
  const evidence = analytics.sources.slice(0, 3).flatMap(source => [{ source: source.name, metric: "samples" as const, value: source.samples }]);
  return { summary: analytics.sources.length ? "Source history is available, but an automated narrative is temporarily unavailable. Inspect the measured availability, offset, jitter, and uncertainty values directly." : "No source-history observations exist in this selected window.", jitterTrend: "insufficient_data", offsetAssessment: "insufficient_data", evidence: evidence.length ? evidence : [{ source: "ChronoMesh", metric: "samples", value: 0 }], limitation: "This view reports observed server-side samples only; it does not establish hardware-clock accuracy or root cause." };
}

export function getSourceInsightDataSignature(analytics: SourceAnalytics) {
  return JSON.stringify({
    range: analytics.range,
    sources: analytics.sources.map(source => ({
      id: source.id,
      samples: source.samples,
      lastSampledAt: source.lastSampledAt,
      availabilityPct: source.availabilityPct,
      medianOffsetMs: source.medianOffsetMs,
      jitterMs: source.jitterMs,
      medianUncertaintyMs: source.medianUncertaintyMs,
    })),
  });
}

export function parseSourceInsightJson(content: string) {
  const unfenced = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(unfenced.slice(start, end + 1)); }
  catch { return null; }
}
