import { describe, expect, it } from "vitest";
import { createBoundedInsightCache } from "./insightCache";

describe("ChronoMesh bounded insight cache", () => {
  it("reuses a matching fresh entry, expires it at its TTL, and rejects changed data signatures", () => {
    const cache = createBoundedInsightCache<string>();
    cache.set("24h", { value: "first", signature: "v1", expiresAt: 1_000 });
    expect(cache.get("24h", "v1", 999)?.value).toBe("first");
    expect(cache.get("24h", "v1", 1_000)).toBeUndefined();
    cache.set("24h", { value: "fresh", signature: "v1", expiresAt: 2_000 });
    expect(cache.get("24h", "v2", 1_001)).toBeUndefined();
  });

  it("bounds the key space by evicting the oldest range entry", () => {
    const cache = createBoundedInsightCache<number>(2);
    cache.set("24h", { value: 1, signature: "a", expiresAt: 1_000 });
    cache.set("7d", { value: 2, signature: "b", expiresAt: 1_000 });
    cache.set("30d", { value: 3, signature: "c", expiresAt: 1_000 });
    expect(cache.size()).toBe(2);
    expect(cache.get("24h", "a", 1)).toBeUndefined();
    expect(cache.get("30d", "c", 1)?.value).toBe(3);
  });
});
