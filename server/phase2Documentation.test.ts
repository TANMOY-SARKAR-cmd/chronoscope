import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 2 documentation and methodology contract", () => {
  it("exposes one public methodology route and links dashboard education to it", () => {
    const app = source("client/src/App.tsx");
    const crown = source("client/src/components/CorrectedTimeCrown.tsx");
    const guide = source("client/src/components/FirstRunGuide.tsx");
    const page = source("client/src/pages/Methodology.tsx");
    expect(app).toContain('path={"/methodology"}');
    expect(crown).toContain('href="/methodology"');
    expect(guide).toContain('href="/methodology"');
    expect(page).toContain("SINGLE SOURCE OF TRUTH");
    expect(page).toContain("four-timestamp exchange");
    expect(page).toContain("aggregate-only");
  });

  it("keeps root orientation and agent lifecycle instructions privacy-first", () => {
    const readme = source("README.md");
    const lifecycle = source("docs/agent-key-lifecycle.md");
    const agentReadme = source("community-agent/README.md");
    expect(readme).toContain("Methodology page");
    expect(lifecycle).toContain("10 minutes");
    expect(lifecycle).toContain("Revoke first");
    expect(lifecycle).toContain("Never transmit, commit, or log the private key");
    expect(agentReadme).toContain("agent key-lifecycle guide");
  });
});
