import { invokeLLM } from "./_core/llm";
import { getSourceAccuracyAnalytics } from "./db";
import { buildSourceInsightPrompt, getSourceInsightDataSignature, parseSourceInsightJson, sourceInsightFallback, type SourceInsight, validateSourceInsight } from "../shared/sourceInsight";
import { createBoundedInsightCache } from "../shared/insightCache";
import type { SourceAccuracyRange } from "../shared/sourceAnalytics";

const CACHE_MS = 5 * 60_000;
type CachedInsightValue = { value: SourceInsight; generatedAt: number; model: string | null };
const cache = createBoundedInsightCache<CachedInsightValue>(3);

export function clearSourceHistoryInsightCache(range?: SourceAccuracyRange) {
  if (range) cache.delete(range);
  else cache.clear();
}

const outputSchema = {
  name: "chronomesh_source_history_summary",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "jitterTrend", "offsetAssessment", "evidence", "limitation"],
    properties: {
      summary: { type: "string" },
      jitterTrend: { type: "string", enum: ["stable", "rising", "variable", "insufficient_data"] },
      offsetAssessment: { type: "string", enum: ["no_clear_anomaly", "possible_anomaly", "insufficient_data"] },
      evidence: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["source", "metric", "value"], properties: { source: { type: "string" }, metric: { type: "string", enum: ["availabilityPct", "medianOffsetMs", "jitterMs", "medianUncertaintyMs", "samples"] }, value: { type: "number" } } } },
      limitation: { type: "string" },
    },
  },
} as const;

export async function getSourceHistoryInsight(range: SourceAccuracyRange) {
  const analytics = await getSourceAccuracyAnalytics(range);
  const signature = getSourceInsightDataSignature(analytics);
  const cached = cache.get(range, signature);
  if (cached) return { ...cached.value, expiresAt: cached.expiresAt, cached: true, analytics };
  const fallback = sourceInsightFallback(analytics);
  if (analytics.sources.reduce((total, source) => total + source.samples, 0) < 4) {
    const entry = { value: fallback, generatedAt: Date.now(), model: null, expiresAt: Date.now() + CACHE_MS, signature };
    cache.set(range, { expiresAt: entry.expiresAt, signature, value: { value: entry.value, generatedAt: entry.generatedAt, model: entry.model } });
    return { ...entry, cached: false, analytics };
  }
  try {
    const response = await invokeLLM({ messages: [{ role: "system", content: "You are a cautious network-time analyst. Keep every statement grounded in the supplied aggregate data. Be concise: one short paragraph, at most three evidence items, and one short limitation." }, { role: "user", content: buildSourceInsightPrompt(analytics) }], outputSchema, maxTokens: 560 });
    const content = response.choices[0]?.message.content;
    const raw = typeof content === "string" ? parseSourceInsightJson(content) : null;
    const value = validateSourceInsight(raw, analytics) ?? fallback;
    const entry = { value, generatedAt: Date.now(), model: response.model || null, expiresAt: Date.now() + CACHE_MS, signature };
    cache.set(range, { expiresAt: entry.expiresAt, signature, value: { value: entry.value, generatedAt: entry.generatedAt, model: entry.model } });
    return { ...entry, cached: false, analytics };
  } catch (error) {
    console.warn("[ChronoMesh] source insight fallback:", error instanceof Error ? error.message : error);
    const entry = { value: fallback, generatedAt: Date.now(), model: null, expiresAt: Date.now() + 60_000, signature };
    cache.set(range, { expiresAt: entry.expiresAt, signature, value: { value: entry.value, generatedAt: entry.generatedAt, model: entry.model } });
    return { ...entry, cached: false, analytics };
  }
}
