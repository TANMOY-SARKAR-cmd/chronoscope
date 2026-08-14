import { describe, expect, it } from "vitest";
import { calculateProbe, calculateStabilityScore, escapeCsvValue, estimateTimeSync, evaluateOffsetAlert, median, normalizePeerHardwareProfile, validateRoomCode } from "./timeMath";

describe("ChronoMesh four-timestamp timing math", () => {
  it("computes NTP offset and network delay from T1 through T4", () => {
    const probe = calculateProbe(1, 100, 105, 106, 112);

    expect(probe.offsetMs).toBe(-0.5);
    expect(probe.delayMs).toBe(11);
    expect(probe.rttMs).toBe(12);
  });

  it("uses the median of the lowest-delay quartile and returns conservative uncertainty", () => {
    const estimate = estimateTimeSync([
      { sampleIndex: 1, t1: 0, t2: 1, t3: 1, t4: 2, offsetMs: 1, delayMs: 1, rttMs: 2 },
      { sampleIndex: 2, t1: 0, t2: 2, t3: 2, t4: 4, offsetMs: 2, delayMs: 2, rttMs: 4 },
      { sampleIndex: 3, t1: 0, t2: 3, t3: 3, t4: 6, offsetMs: 3, delayMs: 3, rttMs: 6 },
      { sampleIndex: 4, t1: 0, t2: 90, t3: 90, t4: 100, offsetMs: 90, delayMs: 100, rttMs: 100 },
    ]);

    expect(estimate.retainedSamples.map(sample => sample.sampleIndex)).toEqual([1, 2, 3]);
    expect(estimate.offsetMs).toBe(2);
    expect(estimate.uncertaintyMs).toBeGreaterThan(estimate.delayMs / 2);
    expect(estimate.confidence).toBe("high");
  });

  it("handles basic numeric and stability helpers deterministically", () => {
    expect(median([7, 1, 3, 9])).toBe(5);
    expect(calculateStabilityScore(0, 10)).toBe(100);
    expect(calculateStabilityScore(5, 2)).toBe(49);
  });
});

describe("ChronoMesh room-code validation", () => {
  it("accepts exactly five uppercase alphanumeric identifiers only", () => {
    expect(validateRoomCode("MESH1")).toBe(true);
    expect(validateRoomCode("a9z02")).toBe(true);
    expect(validateRoomCode("FOUR")).toBe(false);
    expect(validateRoomCode("TOOLONG")).toBe(false);
    expect(validateRoomCode("M-5H1")).toBe(false);
  });
});

describe("ChronoMesh enhancement guardrails", () => {
  it("normalizes opted-in peer hardware context and clears it when sharing is disabled", () => {
    expect(normalizePeerHardwareProfile({ shareHardwareContext: true, tags: [" GPSDO ", "PPS"], description: "  Linux  timing host  " })).toEqual({ shareHardwareContext: true, tags: ["GPSDO", "PPS"], description: "Linux timing host" });
    expect(normalizePeerHardwareProfile({ shareHardwareContext: false, tags: ["GPSDO"], description: "ignored" })).toEqual({ shareHardwareContext: false, tags: [], description: null });
    expect(normalizePeerHardwareProfile({ shareHardwareContext: true, tags: ["GPSDO", "gpsdo"] })).toBeNull();
    expect(normalizePeerHardwareProfile({ shareHardwareContext: true, tags: ["not%allowed"] })).toBeNull();
  });

  it("uses uncertainty-aware threshold alerts with a recovery hysteresis", () => {
    expect(evaluateOffsetAlert(31, 3, 25)).toBe("alert");
    expect(evaluateOffsetAlert(26, 3, 25)).toBe("indeterminate");
    expect(evaluateOffsetAlert(20, 3, 25)).toBe("safe");
    expect(evaluateOffsetAlert(17, 3, 25, true)).toBe("safe");
    expect(evaluateOffsetAlert(100, 1, -1)).toBe("safe");
  });

  it("escapes CSV special characters and neutralizes spreadsheet formulas", () => {
    expect(escapeCsvValue('hello, "mesh"')).toBe('"hello, ""mesh"""');
    expect(escapeCsvValue("=HYPERLINK(\"https://invalid\")")).toBe('"\'=HYPERLINK(""https://invalid"")"');
    expect(escapeCsvValue(12.5)).toBe("12.5");
  });
});
