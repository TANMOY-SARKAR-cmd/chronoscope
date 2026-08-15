export const CHRONOMESH_AUTHORITIES = ["cloudflare", "google", "nist", "ntp_pool"] as const;

export type AuthorityTelemetryReading = {
  id: string;
  name: string;
  status: "reachable" | "unreachable" | "blocked";
  offsetMs: number | null;
  delayMs: number | null;
  uncertaintyMs: number | null;
};

export type AuthorityTelemetryPoint = { timestamp: number } & Record<string, number | undefined>;

export function authoritySeriesKey(authorityId: string, metric: "offset" | "delay" | "uncertainty") {
  return `${metric}_${authorityId}`;
}

export function buildAuthorityTelemetryPoint(timestamp: number, readings: AuthorityTelemetryReading[]): AuthorityTelemetryPoint | null {
  const point: AuthorityTelemetryPoint = { timestamp };
  let hasReadableAuthority = false;
  for (const reading of readings) {
    if (!CHRONOMESH_AUTHORITIES.includes(reading.id as (typeof CHRONOMESH_AUTHORITIES)[number]) || reading.status !== "reachable") continue;
    if (Number.isFinite(reading.offsetMs)) point[authoritySeriesKey(reading.id, "offset")] = Number(reading.offsetMs);
    if (Number.isFinite(reading.delayMs)) point[authoritySeriesKey(reading.id, "delay")] = Number(reading.delayMs);
    if (Number.isFinite(reading.uncertaintyMs)) point[authoritySeriesKey(reading.id, "uncertainty")] = Number(reading.uncertaintyMs);
    hasReadableAuthority = hasReadableAuthority || Number.isFinite(reading.offsetMs);
  }
  return hasReadableAuthority ? point : null;
}

export function getAuthorityTooltipRows(point: AuthorityTelemetryPoint, readings: AuthorityTelemetryReading[]) {
  return readings
    .filter(reading => CHRONOMESH_AUTHORITIES.includes(reading.id as (typeof CHRONOMESH_AUTHORITIES)[number]))
    .flatMap(reading => {
      const offsetMs = point[authoritySeriesKey(reading.id, "offset")];
      if (!Number.isFinite(offsetMs)) return [];
      return [{
        id: reading.id,
        name: reading.name,
        offsetMs: Number(offsetMs),
        delayMs: point[authoritySeriesKey(reading.id, "delay")],
        uncertaintyMs: point[authoritySeriesKey(reading.id, "uncertainty")],
      }];
    });
}
