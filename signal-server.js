/**
 * Cipher — WebRTC Signaling Server
 * ─────────────────────────────────
 * Minimal signaling only. Never stores messages.
 * Used ONLY to exchange SDP offers/answers and ICE candidates.
 * Once peers connect, this server is no longer involved.
 *
 * Deploy free on: Railway, Render, Fly.io, or any Node host.
 * Run locally:    node signal-server.js
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('Cipher signaling server OK');
});

const wss = new WebSocketServer({ server });

// roomId -> Set of WebSocket clients
const rooms = new Map();
// ws -> { roomId, peerId }
const peers = new Map();

function broadcast(roomId, data, exclude = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const client of room) {
    if (client !== exclude && client.readyState === 1) {
      client.send(msg);
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        const { roomId, peerId } = msg;
        if (!roomId || !peerId) return;

        // Leave any previous room
        const prev = peers.get(ws);
        if (prev) {
          const oldRoom = rooms.get(prev.roomId);
          if (oldRoom) { oldRoom.delete(ws); if (oldRoom.size === 0) rooms.delete(prev.roomId); }
        }

        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);
        peers.set(ws, { roomId, peerId });

        // Tell existing peers a new peer joined
        broadcast(roomId, { type: 'peer-joined', peerId }, ws);

        // Tell the new peer how many others are in the room
        const others = [...rooms.get(roomId)].filter(c => c !== ws).map(c => peers.get(c)?.peerId).filter(Boolean);
        ws.send(JSON.stringify({ type: 'room-info', peers: others }));
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice': {
        // Relay to a specific peer or broadcast
        const info = peers.get(ws);
        if (!info) return;
        const room = rooms.get(info.roomId);
        if (!room) return;
        const payload = { ...msg, fromPeerId: info.peerId };
        if (msg.toPeerId) {
          for (const client of room) {
            const p = peers.get(client);
            if (p?.peerId === msg.toPeerId && client.readyState === 1) {
              client.send(JSON.stringify(payload));
            }
          }
        } else {
          broadcast(info.roomId, payload, ws);
        }
        break;
      }

      case 'leave': {
        handleLeave(ws);
        break;
      }
    }
  });

  ws.on('close', () => handleLeave(ws));
  ws.on('error', () => handleLeave(ws));
});

function handleLeave(ws) {
  const info = peers.get(ws);
  if (!info) return;
  const room = rooms.get(info.roomId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(info.roomId);
    else broadcast(info.roomId, { type: 'peer-left', peerId: info.peerId });
  }
  peers.delete(ws);
}

server.listen(PORT, () => {
  console.log(`Cipher signaling server running on port ${PORT}`);
});
