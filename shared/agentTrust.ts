import type { GlobalMeshSourceState } from "./globalMesh";

export const AGENT_PLATFORMS = ["linux", "windows", "ios"] as const;
export type AgentPlatform = (typeof AGENT_PLATFORMS)[number];

export const REVIEW_DECISIONS = ["approve", "request_attestation", "quarantine", "reject", "withdraw"] as const;
export type SourceReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const ATTESTATION_QUALITY_BANDS = ["healthy", "watch", "degraded"] as const;
export type AttestationQualityBand = (typeof ATTESTATION_QUALITY_BANDS)[number];

export type AgentInstallation = {
  id: string;
  platform: AgentPlatform;
  keyFingerprint: string;
  agentVersion: string;
  coarseRegion: string | null;
  lastSeenAtMs: number | null;
  revokedAtMs: number | null;
};

export type AgentAttestationChallenge = {
  id: string;
  installationId: string;
  sourceId: string;
  nonce: string;
  expiresAtMs: number;
};

export type AgentAttestationEnvelope = {
  protocolVersion: 1;
  challengeId: string;
  sourceId: string;
  sampledAtMs: number;
  offsetMs: number;
  delayMs: number;
  uncertaintyMs: number;
  stratum: number | null;
  agentVersion: string;
  signatureBase64: string;
};

export type SourceNetworkMetadata = {
  sourceId: string;
  asn: string | null;
  countryCode: string | null;
  regionCode: string | null;
  confidence: "unknown" | "low" | "medium" | "high";
  observedAtMs: number;
  expiresAtMs: number;
};

export type PublicSourceApplication = {
  sourceId: string;
  publicLabel: string;
  region: string | null;
  status: "pending" | "needs_attestation" | "approved" | "rejected" | "withdrawn";
  submittedAtMs: number;
  updatedAtMs: number;
  publicRationale: string | null;
};

export const MAX_ATTESTATION_AGE_MS = 24 * 60 * 60 * 1_000;
export const ATTESTATION_CHALLENGE_TTL_MS = 10 * 60 * 1_000;

/** Produces a stable, whitespace-free value for Ed25519 signing and verification. */
export function serializeAttestationPayload(challenge: Pick<AgentAttestationChallenge, "id" | "sourceId" | "nonce" | "expiresAtMs">, envelope: Omit<AgentAttestationEnvelope, "signatureBase64">): string {
  return JSON.stringify({
    agentVersion: envelope.agentVersion,
    challengeId: challenge.id,
    challengeNonce: challenge.nonce,
    challengeExpiresAtMs: challenge.expiresAtMs,
    delayMs: envelope.delayMs,
    offsetMs: envelope.offsetMs,
    protocolVersion: envelope.protocolVersion,
    sampledAtMs: envelope.sampledAtMs,
    sourceId: envelope.sourceId,
    stratum: envelope.stratum,
    uncertaintyMs: envelope.uncertaintyMs,
  });
}

export function deriveAttestationQualityBand(input: Pick<AgentAttestationEnvelope, "delayMs" | "uncertaintyMs">): AttestationQualityBand {
  if (input.delayMs <= 250 && input.uncertaintyMs <= 50) return "healthy";
  if (input.delayMs <= 750 && input.uncertaintyMs <= 250) return "watch";
  return "degraded";
}

export function isAttestationFresh(attestedAtMs: number | null, nowMs: number): boolean {
  return typeof attestedAtMs === "number" && nowMs >= attestedAtMs && nowMs - attestedAtMs <= MAX_ATTESTATION_AGE_MS;
}

export function sourceStateForReview(decision: SourceReviewDecision): GlobalMeshSourceState {
  if (decision === "approve") return "active";
  if (decision === "quarantine") return "quarantined";
  if (decision === "withdraw" || decision === "reject") return "withdrawn";
  return "pending";
}

export function isValidAgentPublicKey(value: string): boolean {
  return /^[A-Za-z0-9+/]{43}=$/.test(value.trim());
}

export function sanitizePublicRationale(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized ? normalized.slice(0, 280) : null;
}
