import { normalizePeerHardwareProfile } from "./timeMath";

export type ChronoPreferenceInput = {
  alertEnabled: boolean;
  alertThresholdMs: number;
  hardwareTemplateOptIn: boolean;
  hardwareTags: string[];
  hardwareDescription: string | null;
  worldZones: string[];
};

export function normalizeChronoPreferences(input: ChronoPreferenceInput) {
  const template = normalizePeerHardwareProfile({ shareHardwareContext: input.hardwareTemplateOptIn, tags: input.hardwareTags, description: input.hardwareDescription });
  if (!template || !Number.isFinite(input.alertThresholdMs) || input.alertThresholdMs <= 0 || input.worldZones.length < 1) return null;
  return {
    alertEnabled: input.alertEnabled,
    alertThresholdMs: input.alertThresholdMs,
    hardwareTemplateOptIn: template.shareHardwareContext,
    hardwareTags: template.tags,
    hardwareDescription: template.description,
    worldZones: Array.from(new Set(input.worldZones)).slice(0, 24),
  };
}
