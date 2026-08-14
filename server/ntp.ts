import dgram from "dgram";
import { promises as dns } from "node:dns";
import net from "node:net";

export type SourceTier = "authority" | "regional_pool" | "custom";
export type TimeSource = { id: string; name: string; host: string; tier: SourceTier; region?: string };

export const UPSTREAM_AUTHORITIES: TimeSource[] = [
  { id: "cloudflare", name: "Cloudflare", host: "time.cloudflare.com", tier: "authority" },
  { id: "google", name: "Google", host: "time.google.com", tier: "authority" },
  { id: "nist", name: "NIST", host: "time.nist.gov", tier: "authority" },
  { id: "ntp-pool", name: "NTP pool", host: "pool.ntp.org", tier: "authority" },
];

export const REGIONAL_NTP_POOL_SOURCES: TimeSource[] = [
  { id: "pool-africa", name: "Africa pool", host: "africa.pool.ntp.org", tier: "regional_pool", region: "Africa" },
  { id: "pool-antarctica", name: "Antarctica pool", host: "antarctica.pool.ntp.org", tier: "regional_pool", region: "Antarctica" },
  { id: "pool-asia", name: "Asia pool", host: "asia.pool.ntp.org", tier: "regional_pool", region: "Asia" },
  { id: "pool-europe", name: "Europe pool", host: "europe.pool.ntp.org", tier: "regional_pool", region: "Europe" },
  { id: "pool-north-america", name: "North America pool", host: "north-america.pool.ntp.org", tier: "regional_pool", region: "North America" },
  { id: "pool-oceania", name: "Oceania pool", host: "oceania.pool.ntp.org", tier: "regional_pool", region: "Oceania" },
  { id: "pool-south-america", name: "South America pool", host: "south-america.pool.ntp.org", tier: "regional_pool", region: "South America" },
];

export const CONTROLLED_TIME_SOURCES = [...UPSTREAM_AUTHORITIES, ...REGIONAL_NTP_POOL_SOURCES];

export type UpstreamHealth = TimeSource & {
  status: "reachable" | "unreachable" | "blocked";
  offsetMs: number | null;
  delayMs: number | null;
  uncertaintyMs: number | null;
  sampledAt: number;
  detail?: string;
};

const NTP_EPOCH_OFFSET_SECONDS = 2_208_988_800;
const CACHE_TTL_MS = 25_000;
let cachedAllHealth: { value: UpstreamHealth[]; expiresAt: number } | null = null;

function unavailable(source: TimeSource, status: UpstreamHealth["status"], detail: string): UpstreamHealth {
  return { ...source, status, offsetMs: null, delayMs: null, uncertaintyMs: null, sampledAt: Date.now(), detail };
}

function ntpTimestampToUnixMs(packet: Buffer, offset: number): number {
  const seconds = packet.readUInt32BE(offset);
  const fraction = packet.readUInt32BE(offset + 4);
  return (seconds - NTP_EPOCH_OFFSET_SECONDS) * 1000 + (fraction / 0x1_0000_0000) * 1000;
}

export function validateNtpHostname(input: string): { valid: true; host: string } | { valid: false; reason: string } {
  const host = input.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || net.isIP(host)) return { valid: false, reason: "Enter a public hostname, not an IP address." };
  const labels = host.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return { valid: false, reason: "The hostname format is invalid." };
  }
  return { valid: true, host };
}

export function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168 || (b === 0 && c === 2))) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

async function resolvePublicIpv4(host: string): Promise<{ address?: string; reason?: string }> {
  try {
    const answers = await dns.lookup(host, { family: 4, all: true, verbatim: true });
    const answer = answers.find(candidate => isPublicIpv4(candidate.address));
    return answer ? { address: answer.address } : { reason: "Hostname did not resolve to an approved public IPv4 address." };
  } catch {
    return { reason: "Hostname lookup failed." };
  }
}

function queryResolvedAddress(source: TimeSource, address: string): Promise<UpstreamHealth> {
  return new Promise(resolve => {
    const socket = dgram.createSocket("udp4");
    const t1 = Date.now();
    const packet = Buffer.alloc(48);
    packet[0] = 0x23;
    let completed = false;
    const complete = (result: UpstreamHealth) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      socket.close();
      resolve(result);
    };
    const timeout = setTimeout(() => complete(unavailable(source, "unreachable", "Timed out waiting for UDP/123.")), 1_800);
    socket.once("error", () => complete(unavailable(source, "unreachable", "UDP probe failed.")));
    socket.once("message", response => {
      const t4 = Date.now();
      if (response.length < 48) return complete(unavailable(source, "unreachable", "Received an invalid NTP packet."));
      const t2 = ntpTimestampToUnixMs(response, 32);
      const t3 = ntpTimestampToUnixMs(response, 40);
      if (!Number.isFinite(t2) || !Number.isFinite(t3)) return complete(unavailable(source, "unreachable", "Received unusable NTP timestamps."));
      const delayMs = Math.max(0, (t4 - t1) - (t3 - t2));
      const offsetMs = ((t2 - t1) + (t3 - t4)) / 2;
      complete({ ...source, status: "reachable", offsetMs, delayMs, uncertaintyMs: Math.max(0.5, delayMs / 2), sampledAt: t4 });
    });
    socket.connect(123, address, () => {
      socket.send(packet, error => {
        if (error) complete(unavailable(source, "unreachable", "Could not send the UDP probe."));
      });
    });
  });
}

async function queryTimeSource(source: TimeSource): Promise<UpstreamHealth> {
  const resolution = await resolvePublicIpv4(source.host);
  if (!resolution.address) return unavailable(source, "blocked", resolution.reason ?? "Host was not approved.");
  return queryResolvedAddress(source, resolution.address);
}

export async function getControlledTimeSourceHealth(force = false): Promise<UpstreamHealth[]> {
  if (!force && cachedAllHealth && cachedAllHealth.expiresAt > Date.now()) return cachedAllHealth.value;
  const value = await Promise.all(CONTROLLED_TIME_SOURCES.map(queryTimeSource));
  cachedAllHealth = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function getUpstreamNtpHealth(force = false): Promise<UpstreamHealth[]> {
  const readings = await getControlledTimeSourceHealth(force);
  return readings.filter(reading => reading.tier === "authority");
}

export async function queryCustomNtpHost(hostInput: string): Promise<UpstreamHealth> {
  const validation = validateNtpHostname(hostInput);
  if (!validation.valid) return unavailable({ id: "custom", name: "Custom host", host: hostInput.trim(), tier: "custom" }, "blocked", validation.reason);
  return queryTimeSource({ id: `custom-${validation.host}`, name: "Custom host", host: validation.host, tier: "custom" });
}
