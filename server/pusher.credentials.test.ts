import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

function signedChannelsUrl() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) throw new Error("Pusher Channels credentials are not configured.");

  const path = `/apps/${appId}/channels`;
  const query = new URLSearchParams({ auth_key: key, auth_timestamp: String(Math.floor(Date.now() / 1000)), auth_version: "1.0" });
  const signature = createHmac("sha256", secret).update(`GET\n${path}\n${query.toString()}`).digest("hex");
  query.set("auth_signature", signature);
  return `https://api-${cluster}.pusher.com${path}?${query.toString()}`;
}

describe("ChronoMesh managed realtime credentials", () => {
  it("authenticates the configured Pusher Channels app with a lightweight channels request", async () => {
    const response = await fetch(signedChannelsUrl());
    expect(response.ok, `Pusher returned ${response.status}: ${await response.text()}`).toBe(true);
  }, 10_000);
});
