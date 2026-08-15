import { createHash, createPublicKey, verify } from "node:crypto";
import { isAttestationFresh, isValidAgentPublicKey, serializeAttestationPayload, type AgentAttestationEnvelope } from "../shared/agentTrust";
import { getAttestationVerificationContext, recordVerifiedAttestation } from "./db";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function envelopeHash(envelope: AgentAttestationEnvelope): string {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

function parsePublicKey(rawKey: string) {
  if (!isValidAgentPublicKey(rawKey)) return null;
  try { return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rawKey, "base64")]), format: "der", type: "spki" }); } catch { return null; }
}

/** Validates freshness, scope, signature, and one-time challenge consumption before persisting derived evidence. */
export async function submitSignedAgentAttestation(installationId: string, nonce: string, envelope: AgentAttestationEnvelope) {
  const context = await getAttestationVerificationContext(installationId, envelope.challengeId);
  if (!context) return { accepted: false as const, reason: "challenge_unavailable" };
  if (context.challenge.expiresAtMs < Date.now()) return { accepted: false as const, reason: "challenge_expired" };
  if (context.challenge.sourceId !== envelope.sourceId) return { accepted: false as const, reason: "source_mismatch" };
  if (!isAttestationFresh(envelope.sampledAtMs, Date.now())) return { accepted: false as const, reason: "sample_outside_freshness_window" };
  if (!Number.isFinite(envelope.offsetMs) || !Number.isFinite(envelope.delayMs) || !Number.isFinite(envelope.uncertaintyMs) || envelope.delayMs < 0 || envelope.uncertaintyMs < 0 || envelope.delayMs > 10_000 || envelope.uncertaintyMs > 5_000) return { accepted: false as const, reason: "measurement_out_of_bounds" };
  const publicKey = parsePublicKey(context.installation.publicKey);
  if (!publicKey) return { accepted: false as const, reason: "invalid_installation_key" };
  const signedPayload = serializeAttestationPayload({ id: context.challenge.id, sourceId: context.challenge.sourceId, nonce, expiresAtMs: context.challenge.expiresAtMs }, { ...envelope, signatureBase64: undefined } as Omit<AgentAttestationEnvelope, "signatureBase64">);
  const signature = Buffer.from(envelope.signatureBase64, "base64");
  if (!signature.length || !verify(null, Buffer.from(signedPayload), publicKey, signature)) return { accepted: false as const, reason: "signature_invalid" };
  return recordVerifiedAttestation({ installationId, challengeId: envelope.challengeId, nonce, envelopeHash: envelopeHash(envelope), envelope });
}
