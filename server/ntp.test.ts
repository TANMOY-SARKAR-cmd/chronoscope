import { describe, expect, it } from "vitest";
import { isPublicIpv4, validateNtpHostname } from "./ntp";

describe("ChronoMesh custom NTP source safeguards", () => {
  it("accepts normalized hostnames but blocks malformed names and IP literals", () => {
    expect(validateNtpHostname(" Time.Example.NET. ")).toEqual({ valid: true, host: "time.example.net" });
    expect(validateNtpHostname("192.168.1.10").valid).toBe(false);
    expect(validateNtpHostname("localhost").valid).toBe(false);
    expect(validateNtpHostname("ntp..example.net").valid).toBe(false);
    expect(validateNtpHostname("bad_host.example.net").valid).toBe(false);
  });

  it("rejects private, loopback, carrier-grade, link-local, documentation, and multicast IPv4 results", () => {
    ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.0.2.1", "192.168.1.1", "198.51.100.1", "203.0.113.1", "224.0.0.1"].forEach(address => expect(isPublicIpv4(address)).toBe(false));
    expect(isPublicIpv4("1.1.1.1")).toBe(true);
  });
});
