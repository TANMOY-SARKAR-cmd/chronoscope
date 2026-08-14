import { randomBytes } from "crypto";
import type { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { normalizePeerHardwareProfile, validateRoomCode } from "../shared/timeMath";

type PeerReport = { id: string; offsetMs: number; uncertaintyMs: number; jitterMs: number; sampleCount: number; updatedAt: number; tags: string[]; description: string | null };
type ConnectedPeer = { ws: WebSocket; roomCode: string | null; id: string; lastReportAt: number; lastProfileAt: number; tags: string[]; description: string | null };

const MAX_PEERS_PER_ROOM = 64;
const REPORT_INTERVAL_MS = 900;
const PROFILE_INTERVAL_MS = 900;

function newAnonymousPeerId(): string { return `P-${randomBytes(3).toString("hex").toUpperCase()}`; }
function send(ws: WebSocket, payload: unknown) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }

export function attachChronoMeshRealtime(server: HttpServer) {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 4_096 });
  const rooms = new Map<string, Map<string, PeerReport>>();
  const peers = new Map<WebSocket, ConnectedPeer>();
  const broadcastRoom = (roomCode: string) => {
    const reports = Array.from(rooms.get(roomCode)?.values() ?? []).sort((a, b) => Math.abs(a.offsetMs) - Math.abs(b.offsetMs));
    for (const peer of Array.from(peers.values())) if (peer.roomCode === roomCode) send(peer.ws, { type: "roomState", roomCode, peers: reports });
  };
  const removePeer = (peer: ConnectedPeer) => {
    if (!peer.roomCode) return;
    const room = rooms.get(peer.roomCode);
    room?.delete(peer.id);
    if (room?.size === 0) rooms.delete(peer.roomCode);
    const roomCode = peer.roomCode;
    peer.roomCode = null;
    broadcastRoom(roomCode);
  };

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (requestUrl.pathname !== "/ws/room") return;
    websocketServer.handleUpgrade(request, socket, head, ws => websocketServer.emit("connection", ws));
  });

  websocketServer.on("connection", ws => {
    const peer: ConnectedPeer = { ws, roomCode: null, id: newAnonymousPeerId(), lastReportAt: 0, lastProfileAt: 0, tags: [], description: null };
    peers.set(ws, peer);
    send(ws, { type: "identity", peerId: peer.id });
    ws.on("message", raw => {
      let message: unknown;
      try { message = JSON.parse(raw.toString()); } catch { send(ws, { type: "error", message: "Malformed realtime payload." }); return; }
      if (!message || typeof message !== "object") return;
      const input = message as Record<string, unknown>;
      if (input.type === "join") {
        const roomCode = typeof input.roomCode === "string" ? input.roomCode.trim().toUpperCase() : "";
        if (!validateRoomCode(roomCode)) { send(ws, { type: "error", message: "Room codes must contain exactly five A–Z or 0–9 characters." }); return; }
        const room = rooms.get(roomCode) ?? new Map<string, PeerReport>();
        if (!room.has(peer.id) && room.size >= MAX_PEERS_PER_ROOM) { send(ws, { type: "error", message: "This room has reached its anonymous peer limit." }); return; }
        removePeer(peer); peer.roomCode = roomCode; rooms.set(roomCode, room); send(ws, { type: "joined", roomCode, peerId: peer.id }); broadcastRoom(roomCode); return;
      }
      if (input.type === "profile" && peer.roomCode) {
        if (Date.now() - peer.lastProfileAt < PROFILE_INTERVAL_MS) return;
        const profile = normalizePeerHardwareProfile({ shareHardwareContext: input.shareHardwareContext, tags: input.tags, description: input.description });
        if (!profile) { send(ws, { type: "error", message: "Hardware context must use up to five short, unique tags and a concise description." }); return; }
        peer.lastProfileAt = Date.now(); peer.tags = profile.tags; peer.description = profile.description;
        const report = rooms.get(peer.roomCode)?.get(peer.id);
        if (report) { report.tags = peer.tags; report.description = peer.description; broadcastRoom(peer.roomCode); }
        return;
      }
      if (input.type === "report" && peer.roomCode) {
        if (Date.now() - peer.lastReportAt < REPORT_INTERVAL_MS) return;
        const offsetMs = Number(input.offsetMs), uncertaintyMs = Number(input.uncertaintyMs), jitterMs = Number(input.jitterMs), sampleCount = Number(input.sampleCount);
        if (![offsetMs, uncertaintyMs, jitterMs, sampleCount].every(Number.isFinite) || Math.abs(offsetMs) > 86_400_000 || uncertaintyMs < 0 || jitterMs < 0 || sampleCount < 1 || sampleCount > 1000) { send(ws, { type: "error", message: "Invalid clock report." }); return; }
        peer.lastReportAt = Date.now();
        rooms.get(peer.roomCode)?.set(peer.id, { id: peer.id, offsetMs, uncertaintyMs, jitterMs, sampleCount, updatedAt: Date.now(), tags: peer.tags, description: peer.description });
        broadcastRoom(peer.roomCode);
      }
    });
    ws.on("close", () => { removePeer(peer); peers.delete(ws); });
  });
}
