export type RelayTransportMode = "auto" | "database" | "single";
export type RelayReport = { id: string; offsetMs: number; uncertaintyMs: number; jitterMs: number; sampleCount: number; updatedAt: number; tags: string[]; description: string | null };
export const MAX_RELAY_PAYLOAD_BYTES = 3_072;

export function resolveRelayTransport(mode: RelayTransportMode, managedAvailable: boolean) { return mode === "single" ? "single" : mode === "database" || !managedAvailable ? "database" : "managed"; }

export function isValidRelayReport(value: unknown, peerId: string): value is RelayReport {
  if (!value || typeof value !== "object") return false;
  const report = value as RelayReport;
  return report.id === peerId && /^[A-Z0-9-]{4,16}$/i.test(report.id) && [report.offsetMs, report.uncertaintyMs, report.jitterMs, report.sampleCount, report.updatedAt].every(Number.isFinite) && Math.abs(report.offsetMs) <= 86_400_000 && report.uncertaintyMs >= 0 && report.jitterMs >= 0 && report.sampleCount >= 1 && report.sampleCount <= 1_000 && Array.isArray(report.tags) && report.tags.length <= 5 && (report.description === null || typeof report.description === "string") && JSON.stringify(report).length <= MAX_RELAY_PAYLOAD_BYTES;
}

export function shouldApplyRemoteRelay(event: { originId: string; peerId: string; payload: unknown }, localOriginId: string, localPeerId: string | null) { return event.originId !== localOriginId && event.peerId !== localPeerId && isValidRelayReport(event.payload, event.peerId); }
