export type TimeProbe = {
  sampleIndex: number;
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  offsetMs: number;
  delayMs: number;
  rttMs: number;
};

export type SyncEstimate = {
  samples: TimeProbe[];
  retainedSamples: TimeProbe[];
  offsetMs: number;
  delayMs: number;
  jitterMs: number;
  uncertaintyMs: number;
  confidence: "high" | "medium" | "low";
};

export type OffsetAlertState = "safe" | "indeterminate" | "alert";

export type PeerHardwareProfile = {
  shareHardwareContext: boolean;
  tags: string[];
  description: string | null;
};

const sortNumeric = (values: number[]) => [...values].sort((a, b) => a - b);
const HARDWARE_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .:/_+-]{0,23}$/;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = sortNumeric(values);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}

export function calculateProbe(sampleIndex: number, t1: number, t2: number, t3: number, t4: number): TimeProbe {
  const delayMs = Math.max(0, (t4 - t1) - (t3 - t2));
  const offsetMs = ((t2 - t1) + (t3 - t4)) / 2;
  return { sampleIndex, t1, t2, t3, t4, offsetMs, delayMs, rttMs: Math.max(0, t4 - t1) };
}

export function estimateTimeSync(samples: TimeProbe[]): SyncEstimate {
  const valid = samples.filter(sample => Number.isFinite(sample.offsetMs) && Number.isFinite(sample.delayMs) && sample.delayMs >= 0);
  if (valid.length === 0) {
    return { samples: [], retainedSamples: [], offsetMs: 0, delayMs: 0, jitterMs: 0, uncertaintyMs: Infinity, confidence: "low" };
  }

  const byDelay = [...valid].sort((a, b) => a.delayMs - b.delayMs);
  const keepCount = Math.min(byDelay.length, Math.max(3, Math.ceil(byDelay.length / 4)));
  const retainedSamples = byDelay.slice(0, keepCount);
  const offsetMs = median(retainedSamples.map(sample => sample.offsetMs));
  const delayMs = median(retainedSamples.map(sample => sample.delayMs));
  const jitterMs = standardDeviation(retainedSamples.map(sample => sample.offsetMs));
  const uncertaintyMs = Math.max(0.005, delayMs / 2 + jitterMs);
  const confidence = uncertaintyMs <= 3 && retainedSamples.length >= 3 ? "high" : uncertaintyMs <= 15 && retainedSamples.length >= 3 ? "medium" : "low";

  return { samples: valid, retainedSamples, offsetMs, delayMs, jitterMs, uncertaintyMs, confidence };
}

export function calculateStabilityScore(jitterMs: number, sampleCount: number): number {
  const jitterPenalty = Math.min(72, Math.max(0, jitterMs) * 7);
  const sampleCredit = Math.min(20, Math.max(0, sampleCount) * 2);
  return Math.round(Math.max(0, Math.min(100, 80 - jitterPenalty + sampleCredit)));
}

export function validateRoomCode(value: string): boolean {
  return /^[A-Z0-9]{5}$/.test(value.trim().toUpperCase());
}

export function normalizePeerHardwareProfile(input: unknown): PeerHardwareProfile | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const shareHardwareContext = value.shareHardwareContext === true;
  if (!shareHardwareContext) return { shareHardwareContext: false, tags: [], description: null };
  const rawTags = value.tags === undefined ? [] : value.tags;
  if (!Array.isArray(rawTags) || rawTags.length > 5) return null;
  const tags: string[] = [];
  for (const rawTag of rawTags) {
    if (typeof rawTag !== "string") return null;
    const tag = rawTag.trim().replace(/\s+/g, " ");
    if (!HARDWARE_TAG_PATTERN.test(tag) || tags.some(existing => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) return null;
    tags.push(tag);
  }
  if (value.description !== undefined && value.description !== null && typeof value.description !== "string") return null;
  const description = typeof value.description === "string" ? value.description.trim().replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").slice(0, 160) : null;
  return { shareHardwareContext: true, tags, description: description || null };
}

export function evaluateOffsetAlert(offsetMs: number, uncertaintyMs: number, thresholdMs: number, wasAlerting = false): OffsetAlertState {
  if (![offsetMs, uncertaintyMs, thresholdMs].every(Number.isFinite) || thresholdMs <= 0 || uncertaintyMs < 0) return "safe";
  const magnitude = Math.abs(offsetMs);
  const lowerBound = Math.max(0, magnitude - uncertaintyMs);
  const upperBound = magnitude + uncertaintyMs;
  if (wasAlerting && upperBound <= thresholdMs * 0.85) return "safe";
  if (lowerBound > thresholdMs) return "alert";
  return upperBound > thresholdMs ? "indeterminate" : "safe";
}

export function escapeCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
