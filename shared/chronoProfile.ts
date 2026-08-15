import { normalizePeerHardwareProfile } from "./timeMath";

export type ChronoPreferenceInput = {
  alertEnabled: boolean;
  alertThresholdMs: number;
  hardwareTemplateOptIn: boolean;
  hardwareTags: string[];
  hardwareDescription: string | null;
  worldZones: string[];
  publicLeaderboardOptIn: boolean;
  publicSetupLabel: string | null;
  highContrastMode: boolean;
};

export function normalizeChronoPreferences(input: ChronoPreferenceInput) {
  const template = normalizePeerHardwareProfile({ shareHardwareContext: input.hardwareTemplateOptIn, tags: input.hardwareTags, description: input.hardwareDescription });
  if (!template || !Number.isFinite(input.alertThresholdMs) || input.alertThresholdMs <= 0 || input.worldZones.length < 1) return null;
  const publicSetupLabel = input.publicSetupLabel?.trim().replace(/\s+/g, " ").slice(0, 48) || null;
  if (input.publicLeaderboardOptIn && !publicSetupLabel) return null;
  return {
    alertEnabled: input.alertEnabled,
    alertThresholdMs: input.alertThresholdMs,
    hardwareTemplateOptIn: template.shareHardwareContext,
    hardwareTags: template.tags,
    hardwareDescription: template.description,
    worldZones: Array.from(new Set(input.worldZones)).slice(0, 24),
    publicLeaderboardOptIn: input.publicLeaderboardOptIn,
    publicSetupLabel: input.publicLeaderboardOptIn ? publicSetupLabel : null,
    highContrastMode: input.highContrastMode,
  };
}

export type PublicStabilitySubmissionInput = {
  setupLabel: string;
  hardwareTags: string[];
  stabilityScore: number;
  offsetMs: number;
  jitterMs: number;
  uncertaintyMs: number;
  sampleCount: number;
};

export function normalizePublicStabilitySubmission(input: PublicStabilitySubmissionInput) {
  const setupLabel = input.setupLabel.trim().replace(/\s+/g, " ").slice(0, 48);
  const profile = normalizePeerHardwareProfile({ shareHardwareContext: true, tags: input.hardwareTags, description: null });
  if (!setupLabel || !profile || ![input.stabilityScore, input.offsetMs, input.jitterMs, input.uncertaintyMs, input.sampleCount].every(Number.isFinite)) return null;
  if (input.stabilityScore < 0 || input.stabilityScore > 100 || Math.abs(input.offsetMs) > 86_400_000 || input.jitterMs < 0 || input.uncertaintyMs < 0 || input.sampleCount < 1 || input.sampleCount > 1_000) return null;
  return { setupLabel, hardwareTags: profile.tags, stabilityScore: input.stabilityScore, offsetMs: input.offsetMs, jitterMs: input.jitterMs, uncertaintyMs: input.uncertaintyMs, sampleCount: Math.floor(input.sampleCount) };
}
