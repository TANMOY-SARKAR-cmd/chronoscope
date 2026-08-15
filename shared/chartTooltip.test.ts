import { describe, expect, it } from "vitest";
import { getChartSeriesTransition, getConsentedTooltipRows } from "./chartTooltip";

describe("ChronoMesh chart tooltip privacy and motion", () => {
  it("emits only consented, visible public hardware tags for a hovered point", () => {
    const rows = getConsentedTooltipRows({ leader_0: 1.2, leader_1: -0.5 }, [
      { setupLabel: "Public PPS", hardwareTags: ["PPS", "GPSDO"], uncertaintyMs: 0.4, isConsented: true },
      { setupLabel: "Private bench", hardwareTags: ["secret-tag"], uncertaintyMs: 0.1, isConsented: false },
    ], { leader_0: true, leader_1: true });
    expect(rows).toEqual([{ label: "Public PPS", offsetMs: 1.2, uncertaintyMs: 0.4, hardwareTags: ["PPS", "GPSDO"] }]);
  });

  it("uses a visible fade by default and disables chart animation for reduced motion", () => {
    expect(getChartSeriesTransition(false, false)).toEqual({ strokeOpacity: 0, animationDuration: 220 });
    expect(getChartSeriesTransition(true, true)).toEqual({ strokeOpacity: 1, animationDuration: 0 });
  });
});
