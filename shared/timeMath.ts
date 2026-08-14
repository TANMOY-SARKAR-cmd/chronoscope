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

const sortNumeric = (values: number[]) => [...values].sort((a, b) => a - b);

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
  return Math.sqrt(
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  );
}

export function calculateProbe(
  sampleIndex: number,
  t1: number,
  t2: number,
  t3: number,
  t4: number
): TimeProbe {
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
  const confidence = uncertaintyMs <= 3 && retainedSamples.length >= 3
    ? "high"
    : uncertaintyMs <= 15 && retainedSamples.length >= 3
      ? "medium"
      : "low";

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
