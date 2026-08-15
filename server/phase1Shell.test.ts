import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("Phase 1 product-clarity shell", () => {
  it("keeps corrected UTC in the dedicated crown and passes its frozen presentation input", () => {
    const home = source("client/src/pages/Home.tsx");
    const crown = source("client/src/components/CorrectedTimeCrown.tsx");

    expect(home).toContain("<CorrectedTimeCrown correctedUtcMs={clockEpoch}");
    expect(home).not.toContain("renderPreciseUtc(clockEpoch)");
    expect(crown).toContain("CORRECTED UTC / MESH SOLUTION");
    expect(crown).toContain("CORRECTED_TIME_CAVEAT");
    expect(crown).toContain("cohortSummary");
    expect(crown).toContain("formatUncertainty(props.uncertaintyMs)");
  });

  it("keeps primary workflow routes explicit, privacy-safe, and reachable by keyboard-visible navigation", () => {
    const app = source("client/src/App.tsx");
    const styles = source("client/src/index.css");
    const evidence = source("docs/phase-1-first-visit-evidence.md");
    const home = source("client/src/pages/Home.tsx");
    const navigation = source("client/src/components/ChronoMeshSectionNav.tsx");
    const guide = source("client/src/components/FirstRunGuide.tsx");

    expect(app).toContain('path={"/leaderboard"}');
    expect(app).toContain('const SyncView = lazy(() => import("./pages/sections/SyncView"))');
    expect(app).toContain('const ContributeView = lazy(() => import("./pages/sections/ContributeView"))');
    expect(app).toContain('path={"/observability"} component={ObservabilityView}');
    expect(app).toContain('path={"/contribute"} component={ContributeView}');
    expect(app).not.toContain('path={"/:section"}');
    expect(navigation).toContain('href={`/${section}`}');
    expect(navigation).toContain("focus-visible:ring-2");
    expect(navigation).toContain('"contribute"');
    expect(home).toContain('const currentSection = activeSection ?? "sync"');
    expect(home).toContain('currentSection === "observability"');
    expect(home).toContain('currentSection === "mesh" || currentSection === "contribute"');
    expect(home).toContain('lazy(() => import("@/components/FusionObservabilityPanel")');
    expect(home).toContain('lazy(() => import("@/components/GlobalSourceMeshPanel")');
    expect(styles).toContain(".section-route-sync > #sync");
    expect(styles).not.toMatch(/section-route-[^{]*nth-child/);
    expect(evidence).toContain("On a first visit");
    expect(evidence).toContain("RUN SYNCHRONIZATION");
    expect(guide).toContain("stated uncertainty");
    expect(guide).toContain("anonymous peer room");
    expect(guide).not.toMatch(/IP address|hostname|contributor identity/i);
  });
});
