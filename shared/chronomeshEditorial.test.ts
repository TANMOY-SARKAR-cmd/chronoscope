import { describe, expect, it } from "vitest";
import { CORRECTED_TIME_CAVEAT, FRESHNESS_COPY, coverageExplanation } from "./chronomeshEditorial";

describe("ChronoMesh editorial contract", () => {
  it("keeps the crown caveat uncertainty-first and avoids absolute-accuracy claims", () => {
    expect(CORRECTED_TIME_CAVEAT).toContain("stated uncertainty");
    expect(CORRECTED_TIME_CAVEAT).toContain("not a claim of absolute accuracy");
  });

  it("gives every freshness state an implication and a safe next action", () => {
    for (const state of Object.values(FRESHNESS_COPY)) {
      expect(state.implication.length).toBeGreaterThan(20);
      expect(state.nextAction.length).toBeGreaterThan(10);
    }
  });

  it("explains zero metadata and partial time-window coverage without treating gaps as failures", () => {
    expect(coverageExplanation(72.5, 0).implication).toContain("understated");
    expect(coverageExplanation(72.5, 80).implication).toContain("missing buckets are not treated as source failures");
  });
});
