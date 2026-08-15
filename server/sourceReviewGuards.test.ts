import { describe, expect, it } from "vitest";
import { requireSourceReviewer } from "./routers";

describe("source review authorization", () => {
  it("rejects contributor and ordinary user roles from reviewer decisions", () => {
    expect(() => requireSourceReviewer({ role: "user" })).toThrow("Source review requires an administrator account.");
    expect(() => requireSourceReviewer({ role: "contributor" })).toThrow("Source review requires an administrator account.");
  });

  it("allows the administrator role through the reviewer guard", () => {
    expect(() => requireSourceReviewer({ role: "admin" })).not.toThrow();
  });
});
