import dgram from "dgram";

export const UPSTREAM_AUTHORITIES = [
  { id: "cloudflare", name: "Cloudflare", host: "time.cloudflare.com" },
  { id: "google", name: "Google", host: "time.google.com" },
  { id: "nist", name: "NIST", host: "time.nist.gov" },
  { id: "ntp-pool", name: "NTP pool", host: "pool.ntp.org" },
] as const;

export type UpstreamHealth = {
  id: (typeof UPSTREAM_AUTHORITIES)[number]["id"];
  name: string;
  host: string;
  status: "reachable" | "unreachable";
  offsetMs: number | null;
  delayMs: number | null;
  uncertaintyMs: number | null;
  sampledAt: number;
};

const NTP_EPOCH_OFFSET_SECONDS = 2_208_988_800;
const CACHE_TTL_MS = 25_000;
let cachedHealth: { value: UpstreamHealth[]; expiresAt: number } | null = null;

function ntpTimestampToUnixMs(packet: Buffer, offset: number): number {
  const seconds = packet.readUInt32BE(offset);
  const fraction = packet.readUInt32BE(offset + 4);
  return (seconds - NTP_EPOCH_OFFSET_SECONDS) * 1000 + (fraction / 0x1_0000_0000) * 1000;
}

function queryAuthority(authority: (typeof UPSTREAM_AUTHORITIES)[number]): Promise<UpstreamHealth> {
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

    const timeout = setTimeout(() => complete({
      ...authority,
      status: "unreachable",
      offsetMs: null,
      delayMs: null,
      uncertaintyMs: null,
      sampledAt: Date.now(),
    }), 1_800);

    socket.once("error", () => complete({
      ...authority,
      status: "unreachable",
      offsetMs: null,
      delayMs: null,
      uncertaintyMs: null,
      sampledAt: Date.now(),
    }));

    socket.once("message", response => {
      const t4 = Date.now();
      if (response.length < 48) {
        complete({ ...authority, status: "unreachable", offsetMs: null, delayMs: null, uncertaintyMs: null, sampledAt: t4 });
        return;
      }
      const t2 = ntpTimestampToUnixMs(response, 32);
      const t3 = ntpTimestampToUnixMs(response, 40);
      const delayMs = Math.max(0, (t4 - t1) - (t3 - t2));
      const offsetMs = ((t2 - t1) + (t3 - t4)) / 2;
      complete({
        ...authority,
        status: "reachable",
        offsetMs,
        delayMs,
        uncertaintyMs: Math.max(0.5, delayMs / 2),
        sampledAt: t4,
      });
    });

    socket.send(packet, 123, authority.host, error => {
      if (error) {
        complete({ ...authority, status: "unreachable", offsetMs: null, delayMs: null, uncertaintyMs: null, sampledAt: Date.now() });
      }
    });
  });
}

export async function getUpstreamNtpHealth(force = false): Promise<UpstreamHealth[]> {
  if (!force && cachedHealth && cachedHealth.expiresAt > Date.now()) return cachedHealth.value;
  const value = await Promise.all(UPSTREAM_AUTHORITIES.map(queryAuthority));
  cachedHealth = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
