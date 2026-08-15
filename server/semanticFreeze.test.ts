import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateProbe, estimateTimeSync, normalizePeerHardwareProfile, validateRoomCode } from "../shared/timeMath";
import { buildFusionObservability } from "../shared/fusionObservability";
import { fuseGlobalTime, safePublicSourceLabel } from "../shared/globalMesh";
import { buildAuthorityTelemetryPoint, CHRONOMESH_AUTHORITIES } from "../shared/authorityTelemetry";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("Phase 0 semantic freeze", () => {
  it("keeps the versioned freeze document and merge rule present for CI review", () => {
    const freeze = readProjectFile("docs/semantic-freeze.md");
    expect(freeze).toContain("`docs/semantic-freeze.md`");
    expect(freeze).toContain("No Phase 1 pull request may merge");
    expect(freeze).toContain("Cloudflare, Google, NIST, and NTP Pool");
  });

  it("preserves representative local, aggregate, and diversity-aware contract outputs", () => {
    const probe = calculateProbe(1, 1_000, 1_006, 1_008, 1_016);
    expect(probe).toMatchObject({ offsetMs: -1, delayMs: 14, rttMs: 16 });
    expect(estimateTimeSync([probe, { ...probe, sampleIndex: 2 }, { ...probe, sampleIndex: 3 }]).uncertaintyMs).toBeGreaterThanOrEqual(7);

    const observability = buildFusionObservability({ range: "6h", generatedAtMs: 20_000_000, sources: [], readings: [], freshAttestationSourceIds: [], reviewStatuses: [] });
    expect(observability.summary.caveats).toContain("No probe samples fall inside the selected window.");

    const consensus = fuseGlobalTime([{ sourceId: "one", sourceClass: "authority", groupKey: "group-a", status: "reachable", offsetMs: 1, delayMs: 8, uncertaintyMs: 1, sampledAtMs: 1 }]);
    expect(consensus).toMatchObject({ qualityState: "degraded", diversityState: "unknown", contributorCount: 1 });
  });

  it("keeps authority telemetry, anonymous rooms, and public projections within the frozen privacy boundary", () => {
    expect(CHRONOMESH_AUTHORITIES).toEqual(["cloudflare", "google", "nist", "ntp_pool"]);
    expect(buildAuthorityTelemetryPoint(10, [
      { id: "cloudflare", name: "Cloudflare", status: "reachable", offsetMs: 1.25, delayMs: 9, uncertaintyMs: 2 },
      { id: "unapproved", name: "Unapproved", status: "reachable", offsetMs: 99, delayMs: 99, uncertaintyMs: 99 },
    ])).toEqual({ timestamp: 10, offset_cloudflare: 1.25, delay_cloudflare: 9, uncertainty_cloudflare: 2 });

    expect(validateRoomCode("A9Z02")).toBe(true);
    expect(validateRoomCode("A9-Z2")).toBe(false);
    expect(normalizePeerHardwareProfile({ shareHardwareContext: false, tags: ["private"], description: "private details" })).toEqual({ shareHardwareContext: false, tags: [], description: null });

    const aggregateOnly = buildFusionObservability({
      range: "6h", generatedAtMs: 20_000_000, sources: [{ id: "private-source.example", state: "active", groupKey: "owner-group", asn: null, regionCode: null }],
      readings: [{ sourceId: "private-source.example", status: "reachable", offsetMs: 1, delayMs: 8, uncertaintyMs: 2, sampledAtMs: 19_999_000 }], freshAttestationSourceIds: [], reviewStatuses: [],
    });
    expect(JSON.stringify(aggregateOnly)).not.toContain("private-source.example");
    expect(safePublicSourceLabel({ publicMetadataOptIn: false, publicLabel: "Operator Alpha", displayName: "internal-host.example", sourceClass: "community" })).toBe("Verified community source");
  });
});
