export type PublicStabilitySetup = {
  setupLabel: string;
  hardwareTags: string[];
  stabilityScore: number;
  offsetMs: number;
  jitterMs: number;
  uncertaintyMs: number;
  sampleCount: number;
};

export type SourceInsightExport = {
  generatedAt: number;
  model: string | null;
  analytics: { range: string };
  value: {
    summary: string;
    jitterTrend: string;
    offsetAssessment: string;
    evidence: Array<{ source: string; metric: string; value: number }>;
    limitation: string;
  };
};

export function normalizeLeaderboardTagFilter(tag: string | null | undefined) {
  const normalized = tag?.trim().replace(/\s+/g, " ").slice(0, 24) ?? "";
  return normalized || null;
}

export function filterPublicSetupsByTag<T extends { hardwareTags: string[] }>(entries: T[], tag: string | null | undefined) {
  const filter = normalizeLeaderboardTagFilter(tag)?.toLocaleLowerCase();
  if (!filter) return entries;
  return entries.filter(entry => entry.hardwareTags.some(hardwareTag => hardwareTag.toLocaleLowerCase() === filter));
}

export function getTopComparisonSetups(entries: PublicStabilitySetup[], count = 3) {
  return [...entries].sort((a, b) => b.stabilityScore - a.stabilityScore || Math.abs(a.offsetMs) - Math.abs(b.offsetMs)).slice(0, Math.max(0, count));
}

export function buildPeerComparisonPoint(timestamp: number, localOffsetMs: number, leaders: PublicStabilitySetup[]) {
  return {
    timestamp,
    localOffsetMs,
    ...Object.fromEntries(leaders.map((leader, index) => [`leader_${index}`, leader.offsetMs])),
  };
}

export function buildInsightCsvRows(insight: SourceInsightExport | undefined, capturedUtc: string) {
  if (!insight) return [] as Array<Array<string | number | null>>;
  const base = [capturedUtc, insight.analytics.range, insight.model ?? "fallback"];
  return [
    ["ai_jitter_summary", ...base, "summary", insight.value.summary],
    ["ai_jitter_summary", ...base, "jitter_trend", insight.value.jitterTrend],
    ["ai_jitter_summary", ...base, "offset_assessment", insight.value.offsetAssessment],
    ["ai_jitter_summary", ...base, "limitation", insight.value.limitation],
    ...insight.value.evidence.map(evidence => ["ai_jitter_evidence", ...base, `${evidence.source}:${evidence.metric}`, evidence.value]),
  ];
}
