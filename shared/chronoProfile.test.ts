import { describe, expect, it } from "vitest";
import { normalizeChronoPreferences, normalizePublicStabilitySubmission } from "./chronoProfile";

describe("ChronoMesh saved preferences", () => {
  it("keeps a hardware template private unless the user explicitly opts in to save it", () => {
    const preferences = normalizeChronoPreferences({ alertEnabled: true, alertThresholdMs: 25, hardwareTemplateOptIn: false, hardwareTags: ["GPSDO"], hardwareDescription: "Bench receiver", worldZones: ["UTC", "UTC", "Asia/Kolkata"], publicLeaderboardOptIn: false, publicSetupLabel: "Private bench", highContrastMode: true });
    expect(preferences).toMatchObject({ hardwareTemplateOptIn: false, hardwareTags: [], hardwareDescription: null, worldZones: ["UTC", "Asia/Kolkata"], publicLeaderboardOptIn: false, publicSetupLabel: null, highContrastMode: true });
  });

  it("preserves a validated opt-in template without enabling live room sharing", () => {
    const preferences = normalizeChronoPreferences({ alertEnabled: true, alertThresholdMs: 10, hardwareTemplateOptIn: true, hardwareTags: ["GPSDO", "PPS"], hardwareDescription: "Disciplined reference", worldZones: ["UTC"], publicLeaderboardOptIn: true, publicSetupLabel: "  PPS   bench  ", highContrastMode: false });
    expect(preferences).toMatchObject({ hardwareTemplateOptIn: true, hardwareTags: ["GPSDO", "PPS"], hardwareDescription: "Disciplined reference", publicLeaderboardOptIn: true, publicSetupLabel: "PPS bench" });
  });

  it("rejects public sharing without a specific anonymous label and validates bounded public measurements", () => {
    expect(normalizeChronoPreferences({ alertEnabled: true, alertThresholdMs: 10, hardwareTemplateOptIn: false, hardwareTags: [], hardwareDescription: null, worldZones: ["UTC"], publicLeaderboardOptIn: true, publicSetupLabel: null, highContrastMode: false })).toBeNull();
    expect(normalizePublicStabilitySubmission({ setupLabel: "PPS", hardwareTags: ["GPSDO"], stabilityScore: 92, offsetMs: -0.5, jitterMs: 0.2, uncertaintyMs: 1, sampleCount: 12 })).toMatchObject({ setupLabel: "PPS", hardwareTags: ["GPSDO"] });
    expect(normalizePublicStabilitySubmission({ setupLabel: "", hardwareTags: [], stabilityScore: 101, offsetMs: 0, jitterMs: 0, uncertaintyMs: 0, sampleCount: 1 })).toBeNull();
  });
});
