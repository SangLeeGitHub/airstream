const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { printServerInfo } = require('./utils/network-info');
const AudioCapture = require('./audio-capture');

const PORT = process.env.PORT || 3000;

// Resolve client directory for both pkg and dev mode
function resolveClientDir() {
  // pkg mode: client/ folder next to the exe
  const beside = path.join(path.dirname(process.execPath), 'client');
  if (fs.existsSync(beside)) return beside;
  // Dev mode
  return path.join(__dirname, '..', 'client');
}

async function main() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.static(resolveClientDir()));

  // WASAPI loopback capture → MP3 output (direct pipe, no Node.js middleman)
  const capture = new AudioCapture();
  const streamClients = new Set();

  // Buffer recent MP3 data so new clients get audio immediately
  const MP3_PREBUF_SIZE = 4096; // 4KB — minimal pre-buffer to reduce latency
  let mp3PreBuffer = Buffer.alloc(0);

  capture.on('data', (mp3Chunk) => {
    // Accumulate pre-buffer
    mp3PreBuffer = Buffer.concat([mp3PreBuffer, mp3Chunk]);
    if (mp3PreBuffer.length > MP3_PREBUF_SIZE) {
      mp3PreBuffer = mp3PreBuffer.slice(mp3PreBuffer.length - MP3_PREBUF_SIZE);
    }

    // Broadcast to all connected clients
    for (const client of streamClients) {
      try { client.write(mp3Chunk); } catch { streamClients.delete(client); }
    }
  });

  capture.on('close', (code) => {
    if (code !== 0) {
      console.log('[Server] Audio capture ended. Restarting in 2 seconds...');
      setTimeout(() => capture.start(), 2000);
    }
  });

  // MP3 stream endpoint
  app.get('/stream', (req, res) => {
    const clientIP = req.ip;
    console.log(`[Stream] Client connected: ${clientIP} (total: ${streamClients.size + 1})`);

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'ICY-Name': 'AirStream'
    });

    // Send pre-buffered MP3 data immediately so iOS doesn't abort
    if (mp3PreBuffer.length > 0) {
      try { res.write(mp3PreBuffer); } catch {}
    }

    streamClients.add(res);

    req.on('close', () => {
      streamClients.delete(res);
      console.log(`[Stream] Client disconnected: ${clientIP} (total: ${streamClients.size})`);
    });
  });

  // Latency measurement: client sends timestamp, server echoes it
  app.get('/api/ping', (req, res) => {
    res.json({ t: Date.now() });
  });

  app.get('/api/status', (req, res) => {
    res.json({
      capturing: capture.isCapturing,
      device: 'WASAPI Loopback (System Audio)',
      clients: streamClients.size,
      metadata: capture.getMetadata()
    });
  });

  server.listen(PORT, () => {
    printServerInfo(PORT);
    console.log('[Server] Mode: WASAPI Loopback (PC 음소거 상태에서도 캡처 가능)');
    console.log('[Server] Stream: /stream (MP3 192kbps)');
    console.log('[Server] Clients connected: 0\n');

    capture.start();
  });

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[Server] Shutting down...');
    capture.stop();
    for (const res of streamClients) { try { res.end(); } catch {} }
    server.close(() => process.exit(0));
    // Force exit after 3 seconds if graceful shutdown hangs
    setTimeout(() => process.exit(0), 3000);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => capture.stop());
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
