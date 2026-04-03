/**
 * Cipher — LAN Server
 * ────────────────────
 * Runs on your local WiFi network. No internet required.
 * All traffic stays on-device and within your LAN.
 * Peers discover each other via the LAN IP of the machine running this.
 *
 * Usage:
 *   npm install ws
 *   node lan-server.js
 *
 * Then on any device on the same WiFi:
 *   Open http://<THIS-MACHINE-IP>:3002
 *   The app will auto-detect and connect via LAN.
 *
 * Find your LAN IP:
 *   macOS/Linux:  ifconfig | grep "inet "
 *   Windows:      ipconfig | findstr "IPv4"
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { WebSocketServer } = require('ws');
const os    = require('os');

const PORT = process.env.PORT || 3002;

// ── HTTP: serve the app + static files ──────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const httpServer = http.createServer((req, res) => {
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');

  let filePath = req.url === '/' ? '/private-messenger.html' : req.url;
  filePath = path.join(__dirname, filePath.split('?')[0]);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// ── WebSocket: LAN relay (same logic as signal server) ───────────────────────
const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map();
const peers = new Map();

function broadcast(roomId, data, exclude = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const client of room) {
    if (client !== exclude && client.readyState === 1) client.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  console.log('LAN peer connected:', req.socket.remoteAddress);

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        const { roomId, peerId } = msg;
        if (!roomId || !peerId) return;
        const prev = peers.get(ws);
        if (prev) {
          const old = rooms.get(prev.roomId);
          if (old) { old.delete(ws); if (old.size === 0) rooms.delete(prev.roomId); }
        }
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);
        peers.set(ws, { roomId, peerId });
        broadcast(roomId, { type: 'peer-joined', peerId }, ws);
        const others = [...rooms.get(roomId)].filter(c => c !== ws).map(c => peers.get(c)?.peerId).filter(Boolean);
        ws.send(JSON.stringify({ type: 'room-info', peers: others }));
        console.log(`[${roomId}] ${peerId} joined. Room size: ${rooms.get(roomId).size}`);
        break;
      }
      case 'offer': case 'answer': case 'ice': {
        const info = peers.get(ws);
        if (!info) return;
        const room = rooms.get(info.roomId);
        if (!room) return;
        const payload = { ...msg, fromPeerId: info.peerId };
        if (msg.toPeerId) {
          for (const client of room) {
            const p = peers.get(client);
            if (p?.peerId === msg.toPeerId && client.readyState === 1) client.send(JSON.stringify(payload));
          }
        } else broadcast(info.roomId, payload, ws);
        break;
      }
      case 'leave': handleLeave(ws); break;

      // LAN direct relay (fallback if WebRTC fails on LAN)
      case 'message': {
        const info = peers.get(ws);
        if (!info) return;
        broadcast(info.roomId, { ...msg, fromPeerId: info.peerId }, ws);
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
    console.log(`[${info.roomId}] ${info.peerId} left`);
  }
  peers.delete(ws);
}

// ── Print LAN addresses ───────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     Cipher LAN Server Running        ║');
  console.log('╚══════════════════════════════════════╝');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`\n  Open on any device on this WiFi:\n  → http://${net.address}:${PORT}\n`);
      }
    }
  }
  console.log(`  WebSocket: ws://0.0.0.0:${PORT}`);
  console.log('\n  All traffic stays on your local network.\n');
});
