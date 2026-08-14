import { describe, expect, it } from "vitest";
import { normalizeChronoPreferences } from "./chronoProfile";

describe("ChronoMesh saved preferences", () => {
  it("keeps a hardware template private unless the user explicitly opts in to save it", () => {
    const preferences = normalizeChronoPreferences({ alertEnabled: true, alertThresholdMs: 25, hardwareTemplateOptIn: false, hardwareTags: ["GPSDO"], hardwareDescription: "Bench receiver", worldZones: ["UTC", "UTC", "Asia/Kolkata"] });
    expect(preferences).toMatchObject({ hardwareTemplateOptIn: false, hardwareTags: [], hardwareDescription: null, worldZones: ["UTC", "Asia/Kolkata"] });
  });

  it("preserves a validated opt-in template without enabling live room sharing", () => {
    const preferences = normalizeChronoPreferences({ alertEnabled: true, alertThresholdMs: 10, hardwareTemplateOptIn: true, hardwareTags: ["GPSDO", "PPS"], hardwareDescription: "Disciplined reference", worldZones: ["UTC"] });
    expect(preferences).toMatchObject({ hardwareTemplateOptIn: true, hardwareTags: ["GPSDO", "PPS"], hardwareDescription: "Disciplined reference" });
  });
});
