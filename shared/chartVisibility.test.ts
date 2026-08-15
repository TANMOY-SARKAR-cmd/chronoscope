import { describe, expect, it } from "vitest";
import { reconcileSeriesVisibility } from "./chartVisibility";

describe("ChronoMesh comparison-series visibility", () => {
  it("enables newly available traces while preserving explicit user choices and removing stale series", () => {
    expect(reconcileSeriesVisibility({}, ["localOffsetMs", "leader_0"])).toEqual({ localOffsetMs: true, leader_0: true });
    expect(reconcileSeriesVisibility({ localOffsetMs: false, leader_0: true, stale: false }, ["localOffsetMs", "leader_1"])).toEqual({ localOffsetMs: false, leader_1: true });
  });
});
