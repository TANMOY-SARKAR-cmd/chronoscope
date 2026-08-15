import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("hardening configuration", () => {
  it("keeps pnpm overrides and the Wouter patch in the workspace configuration", () => {
    const workspace = readProjectFile("pnpm-workspace.yaml");
    const packageJson = JSON.parse(readProjectFile("package.json")) as { packageManager: string; dependencies: Record<string, string> };

    expect(workspace).toContain('"fast-xml-parser": "5.10.1"');
    expect(workspace).toContain('"tailwindcss>nanoid": "3.3.7"');
    expect(workspace).toContain('"wouter@3.7.1": "patches/wouter@3.7.1.patch"');
    expect(packageJson.packageManager).toBe("pnpm@10.18.0");
    expect(packageJson.dependencies["@trpc/client"]).toBe("^11.8.0");
    expect(packageJson.dependencies["@trpc/react-query"]).toBe("^11.8.0");
    expect(packageJson.dependencies["@trpc/server"]).toBe("^11.8.0");
  });

  it("keeps non-critical leaderboard and reviewer screens behind React lazy boundaries", () => {
    const app = readProjectFile("client/src/App.tsx");

    expect(app).toContain('const Leaderboard = lazy(() => import("./pages/Leaderboard"));');
    expect(app).toContain('const SourceReview = lazy(() => import("./pages/SourceReview"));');
    expect(app).toContain('<Suspense fallback={<RouteLoading />}><Router /></Suspense>');
  });
});
