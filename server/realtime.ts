import { randomBytes } from "crypto";
import type { Server as HttpServer } from "http";
import Pusher from "pusher";
import { WebSocket, WebSocketServer } from "ws";
import { normalizePeerHardwareProfile, validateRoomCode } from "../shared/timeMath";
import { isValidRelayReport, resolveRelayTransport } from "../shared/realtimeGuards";
import { appendRoomRelayEvent, getRoomRelayEvents, type RoomRelayEventInput } from "./db";
import { ENV } from "./_core/env";

export type PeerReport = { id: string; offsetMs: number; uncertaintyMs: number; jitterMs: number; sampleCount: number; updatedAt: number; tags: string[]; description: string | null };
type ConnectedPeer = { ws: WebSocket; roomCode: string | null; id: string; lastReportAt: number; lastProfileAt: number; tags: string[]; description: string | null };
type RelayPayload = { originId: string; roomCode: string; eventType: "upsert" | "remove"; peerId: string; payload: PeerReport | null };
type Diagnostics = { mode: "auto" | "database" | "single"; primaryTransport: "managed" | "database" | "single"; managedPubSub: boolean; databaseRelay: boolean; originId: string; activeRooms: number; activePeers: number; pusherKey: string | null; pusherCluster: string | null };

const MAX_PEERS_PER_ROOM = 64;
const REPORT_INTERVAL_MS = 900;
const PROFILE_INTERVAL_MS = 900;
const RELAY_INTERVAL_MS = 1_000;
const originId = `relay-${randomBytes(6).toString("hex")}`;
const pusher = ENV.chronomeshRealtimeMode !== "database" && ENV.chronomeshRealtimeMode !== "single" && ENV.pusherAppId && ENV.pusherKey && ENV.pusherSecret && ENV.pusherCluster
  ? new Pusher({ appId: ENV.pusherAppId, key: ENV.pusherKey, secret: ENV.pusherSecret, cluster: ENV.pusherCluster, useTLS: true }) : null;
let diagnostics: Diagnostics = { mode: ENV.chronomeshRealtimeMode, primaryTransport: resolveRelayTransport(ENV.chronomeshRealtimeMode, Boolean(pusher)), managedPubSub: Boolean(pusher), databaseRelay: ENV.chronomeshRealtimeMode !== "single", originId, activeRooms: 0, activePeers: 0, pusherKey: pusher ? ENV.pusherKey : null, pusherCluster: pusher ? ENV.pusherCluster : null };

function newAnonymousPeerId() { return `P-${randomBytes(3).toString("hex").toUpperCase()}`; }
function send(ws: WebSocket, payload: unknown) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
function roomChannel(roomCode: string) { return `chronomesh-room-${roomCode}`; }
export function getChronoMeshRealtimeDiagnostics() { return diagnostics; }

export function attachChronoMeshRealtime(server: HttpServer) {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 4_096 });
  const rooms = new Map<string, Map<string, PeerReport>>();
  const peers = new Map<WebSocket, ConnectedPeer>();
  const relayCursors = new Map<string, number>();
  const updateDiagnostics = () => { diagnostics = { ...diagnostics, activeRooms: rooms.size, activePeers: peers.size }; };
  const broadcastRoom = (roomCode: string) => {
    const reports = Array.from(rooms.get(roomCode)?.values() ?? []).filter(report => Date.now() - report.updatedAt < 120_000).sort((a, b) => Math.abs(a.offsetMs) - Math.abs(b.offsetMs));
    for (const peer of Array.from(peers.values())) if (peer.roomCode === roomCode) send(peer.ws, { type: "roomState", roomCode, peers: reports });
  };
  const applyRelay = (event: RelayPayload) => {
    if (!validateRoomCode(event.roomCode)) return;
    const room = rooms.get(event.roomCode) ?? new Map<string, PeerReport>();
    if (event.eventType === "remove") room.delete(event.peerId);
    else if (isValidRelayReport(event.payload, event.peerId)) room.set(event.peerId, event.payload);
    if (room.size) rooms.set(event.roomCode, room); else rooms.delete(event.roomCode);
    broadcastRoom(event.roomCode); updateDiagnostics();
  };
  const relayEvent = async (event: RelayPayload) => {
    if (ENV.chronomeshRealtimeMode === "single") return;
    const storageEvent: RoomRelayEventInput = { originId: event.originId, roomCode: event.roomCode, eventType: event.eventType, peerId: event.peerId, payload: event.payload };
    void appendRoomRelayEvent(storageEvent).catch(error => console.warn("[ChronoMesh] database relay write skipped:", error));
    if (pusher && (event.eventType === "remove" || isValidRelayReport(event.payload, event.peerId))) {
      try { await pusher.trigger(roomChannel(event.roomCode), "chronomesh-relay", event); }
      catch (error) { console.warn("[ChronoMesh] managed relay publish skipped; database relay remains active:", error); }
    }
  };
  const removePeer = (peer: ConnectedPeer) => {
    if (!peer.roomCode) return;
    const roomCode = peer.roomCode; rooms.get(roomCode)?.delete(peer.id);
    if (rooms.get(roomCode)?.size === 0) rooms.delete(roomCode);
    peer.roomCode = null; broadcastRoom(roomCode); updateDiagnostics();
    void relayEvent({ originId, roomCode, eventType: "remove", peerId: peer.id, payload: null });
  };
  const hydrateRoom = async (roomCode: string) => {
    if (ENV.chronomeshRealtimeMode === "single") return;
    try {
      const result = await getRoomRelayEvents(roomCode, 0, originId); relayCursors.set(roomCode, result.cursor);
      for (const event of result.events) applyRelay({ originId: event.originId, roomCode: event.roomCode, eventType: event.eventType, peerId: event.peerId, payload: event.payload as PeerReport | null });
    } catch (error) { console.warn("[ChronoMesh] database relay hydration skipped:", error); }
  };

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (requestUrl.pathname !== "/ws/room") return;
    websocketServer.handleUpgrade(request, socket, head, ws => websocketServer.emit("connection", ws));
  });
  websocketServer.on("connection", ws => {
    const peer: ConnectedPeer = { ws, roomCode: null, id: newAnonymousPeerId(), lastReportAt: 0, lastProfileAt: 0, tags: [], description: null };
    peers.set(ws, peer); updateDiagnostics(); send(ws, { type: "identity", peerId: peer.id });
    ws.on("message", raw => {
      let message: unknown; try { message = JSON.parse(raw.toString()); } catch { send(ws, { type: "error", message: "Malformed realtime payload." }); return; }
      if (!message || typeof message !== "object") return; const input = message as Record<string, unknown>;
      if (input.type === "join") {
        const roomCode = typeof input.roomCode === "string" ? input.roomCode.trim().toUpperCase() : "";
        if (!validateRoomCode(roomCode)) { send(ws, { type: "error", message: "Room codes must contain exactly five A–Z or 0–9 characters." }); return; }
        const room = rooms.get(roomCode) ?? new Map<string, PeerReport>();
        if (!room.has(peer.id) && room.size >= MAX_PEERS_PER_ROOM) { send(ws, { type: "error", message: "This room has reached its anonymous peer limit." }); return; }
        removePeer(peer); peer.roomCode = roomCode; rooms.set(roomCode, room); send(ws, { type: "joined", roomCode, peerId: peer.id }); broadcastRoom(roomCode); updateDiagnostics(); void hydrateRoom(roomCode); return;
      }
      if (input.type === "profile" && peer.roomCode) {
        if (Date.now() - peer.lastProfileAt < PROFILE_INTERVAL_MS) return;
        const profile = normalizePeerHardwareProfile({ shareHardwareContext: input.shareHardwareContext, tags: input.tags, description: input.description });
        if (!profile) { send(ws, { type: "error", message: "Hardware context must use up to five short, unique tags and a concise description." }); return; }
        peer.lastProfileAt = Date.now(); peer.tags = profile.tags; peer.description = profile.description;
        const report = rooms.get(peer.roomCode)?.get(peer.id); if (report) { report.tags = peer.tags; report.description = peer.description; report.updatedAt = Date.now(); broadcastRoom(peer.roomCode); void relayEvent({ originId, roomCode: peer.roomCode, eventType: "upsert", peerId: peer.id, payload: report }); }
        return;
      }
      if (input.type === "report" && peer.roomCode) {
        if (Date.now() - peer.lastReportAt < REPORT_INTERVAL_MS) return;
        const offsetMs = Number(input.offsetMs), uncertaintyMs = Number(input.uncertaintyMs), jitterMs = Number(input.jitterMs), sampleCount = Number(input.sampleCount);
        if (![offsetMs, uncertaintyMs, jitterMs, sampleCount].every(Number.isFinite) || Math.abs(offsetMs) > 86_400_000 || uncertaintyMs < 0 || jitterMs < 0 || sampleCount < 1 || sampleCount > 1000) { send(ws, { type: "error", message: "Invalid clock report." }); return; }
        peer.lastReportAt = Date.now(); const report: PeerReport = { id: peer.id, offsetMs, uncertaintyMs, jitterMs, sampleCount, updatedAt: Date.now(), tags: peer.tags, description: peer.description };
        rooms.get(peer.roomCode)?.set(peer.id, report); broadcastRoom(peer.roomCode); void relayEvent({ originId, roomCode: peer.roomCode, eventType: "upsert", peerId: peer.id, payload: report });
      }
    });
    ws.on("close", () => { removePeer(peer); peers.delete(ws); updateDiagnostics(); });
  });
  if (ENV.chronomeshRealtimeMode !== "single") setInterval(() => {
    const activeRooms = Array.from(new Set(Array.from(peers.values()).flatMap(peer => peer.roomCode ? [peer.roomCode] : [])));
    for (const roomCode of activeRooms) void getRoomRelayEvents(roomCode, relayCursors.get(roomCode) ?? 0, originId).then(result => { relayCursors.set(roomCode, result.cursor); for (const event of result.events) applyRelay({ originId: event.originId, roomCode: event.roomCode, eventType: event.eventType, peerId: event.peerId, payload: event.payload as PeerReport | null }); }).catch(error => console.warn("[ChronoMesh] database relay poll skipped:", error));
  }, RELAY_INTERVAL_MS).unref();
}
