import { describe, expect, it } from "vitest";
import { filterIanaTimezones, formatCorrectedZoneTime, getAvailableIanaTimezones, getTimezoneWindow } from "./timeZones";

describe("ChronoMesh IANA timezone helpers", () => {
  const zones = ["UTC", "America/New_York", "Asia/Kolkata", "Europe/London", "Pacific/Auckland"];

  it("includes UTC once, uses browser discovery, and has a no-discovery fallback", () => {
    expect(getAvailableIanaTimezones(() => ["UTC", "Europe/London", "Asia/Kolkata"])).toEqual(["UTC", "Europe/London", "Asia/Kolkata"]);
    expect(getAvailableIanaTimezones(undefined)).toContain("UTC");
  });

  it("finds IANA zone names without altering the full catalog", () => {
    expect(filterIanaTimezones(zones, "kolkata")).toEqual(["Asia/Kolkata"]);
    expect(filterIanaTimezones(zones, "")).toEqual(zones);
  });

  it("windows a long picker list instead of rendering every option", () => {
    const result = getTimezoneWindow(Array.from({ length: 410 }, (_, index) => `Zone/${index}`), 31 * 200, 31 * 8);
    expect(result.start).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThan(40);
    expect(result.items[0]).toBe("Zone/197");
  });

  it("formats a timezone directly from a corrected UTC epoch", () => {
    const epoch = Date.UTC(2026, 7, 14, 12, 34, 56);
    const expected = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" }).format(new Date(epoch));
    expect(formatCorrectedZoneTime(epoch, "UTC", "en-GB")).toBe(expected);
  });
});
