# 🔐 Cipher — P2P Private Messenger

A zero-server-storage messenger. Messages travel **directly between devices**.
No company reads them. No logs. No accounts.

---

## How it works

```
WebRTC mode (internet):
  Device A ──[encrypted msg]──▶ Device B   (direct, server never sees content)
       └──[SDP handshake]──▶ Signal Server ──[SDP handshake]──▶ Device B
                              (used ONCE to connect, then drops out)

LAN mode (local WiFi):
  Device A ──[encrypted msg]──▶ LAN Server ──[relay]──▶ Device B
                              (traffic never leaves your local network)
```

All messages are encrypted with **AES-256-GCM** before leaving the device.
The room ID is used as the encryption key seed (PBKDF2 key derivation).

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2a. WebRTC mode (works over the internet)
```bash
# Terminal 1: Start signaling server
node signal-server.js

# Both users open private-messenger.html in a browser
# Enter the same Room ID (e.g. "cipher-room-42")
# Share your Peer ID with the other person
```

### 2b. LAN mode (local WiFi only, no internet needed)
```bash
# Terminal 1: Start LAN server on one machine
node lan-server.js

# It will print something like:
#   Open on any device on this WiFi:
#   → http://192.168.1.42:3002

# All devices on the same WiFi visit that URL
# They connect automatically via the LAN server
```

---

## Deploy the signaling server (WebRTC mode)

The signaling server is tiny (~80 lines). Deploy it free:

### Railway (easiest)
1. Push this folder to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Set start command: `node signal-server.js`
4. Done. Use the provided URL in the app (change `ws://` to `wss://`)

### Render
1. New Web Service → connect repo
2. Build command: `npm install`
3. Start command: `node signal-server.js`
4. Free tier works fine

### Fly.io
```bash
fly launch
fly deploy
```

### Self-hosted (any VPS)
```bash
npm install
node signal-server.js
# Use nginx/caddy to proxy and add TLS for wss://
```

---

## File structure

```
cipher/
├── private-messenger.html   ← The app (open this in browser)
├── manifest.json            ← PWA manifest
├── sw.js                    ← Service worker (offline support)
├── signal-server.js         ← WebRTC signaling (deploy this)
├── lan-server.js            ← LAN relay + file server
└── package.json
```

---

## Security model

| What | Detail |
|------|--------|
| Encryption | AES-256-GCM per message |
| Key derivation | PBKDF2 (SHA-256, 100k iterations) from room ID |
| Key exchange | WebRTC DTLS (built-in) for data channel |
| Server storage | Zero — signaling server only relays SDP/ICE, never messages |
| LAN server | Relays encrypted ciphertext only — cannot read messages |
| Metadata | Peer IDs are random hex strings — no usernames on server |

**Important:** The room ID acts as a shared secret for message encryption.
Share it over a separate secure channel (e.g. Signal, in person).

---

## Browser support

| Browser | WebRTC | LAN |
|---------|--------|-----|
| Chrome / Edge | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari (iOS 14+) | ✅ | ✅ |
| Samsung Internet | ✅ | ✅ |

---

## PWA — Install as native app

On Android (Chrome): tap the ⋮ menu → "Add to Home screen"  
On iOS (Safari): tap Share → "Add to Home Screen"  
On Desktop (Chrome/Edge): look for the install icon in the address bar  

Once installed, Cipher runs fullscreen with no browser chrome, like a native app.

---

## LAN-only offline use

If you have no internet at all:
1. Run `node lan-server.js` on one device
2. All devices connect to that device's IP over WiFi
3. Everything stays on your local network
4. Works completely offline (no STUN/TURN needed)
