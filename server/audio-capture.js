const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');

// Resolve path for pkg: exe files must be next to the main executable
function resolveExe(name) {
  // When running via pkg, process.execPath is the packed exe
  const beside = path.join(path.dirname(process.execPath), name);
  if (fs.existsSync(beside)) return beside;
  // Dev mode: look in server/utils/
  const dev = path.join(__dirname, 'utils', name);
  if (fs.existsSync(dev)) return dev;
  // Fallback: hope it's in PATH
  return name;
}

class AudioCapture extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 2;
    this.bitDepth = 16;
    this.captureProc = null;
    this.encoderProc = null;
    this.isCapturing = false;
  }

  start() {
    if (this.isCapturing) return;

    const exePath = resolveExe('wasapi-capture.exe');

    // WASAPI capture → stdout (PCM s16le)
    this.captureProc = spawn(exePath, [
      String(this.sampleRate),
      String(this.channels)
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // FFmpeg: PCM stdin → MP3 stdout (low-latency settings)
    const ffmpegPath = resolveExe('ffmpeg.exe');
    this.encoderProc = spawn(ffmpegPath, [
      '-probesize', '32',
      '-analyzeduration', '0',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-f', 's16le',
      '-ar', String(this.sampleRate),
      '-ac', String(this.channels),
      '-i', 'pipe:0',
      '-codec:a', 'libmp3lame',
      '-b:a', '128k',
      '-flush_packets', '1',
      '-write_xing', '0',
      '-f', 'mp3',
      'pipe:1'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Direct pipe: WASAPI stdout → FFmpeg stdin (no Node.js buffering)
    this.captureProc.stdout.pipe(this.encoderProc.stdin);

    this.isCapturing = true;

    // MP3 output from FFmpeg → emit 'data'
    this.encoderProc.stdout.on('data', (chunk) => {
      this.emit('data', chunk);
    });

    this.captureProc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg.startsWith('FORMAT:')) {
        const parts = msg.split(':');
        console.log(`[Audio] Source format: ${parts[1]}Hz, ${parts[2]}ch, ${parts[3]}bit ${parts[4]}`);
      } else if (msg) {
        console.error('[Audio]', msg);
      }
    });

    this.encoderProc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg.includes('Error') || msg.includes('error')) {
        console.error('[Encoder]', msg);
      }
    });

    this.captureProc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[Audio] Capture process exited with code ${code}`);
      }
      this.isCapturing = false;
      this.emit('close', code);
    });

    this.encoderProc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[Encoder] FFmpeg exited with code ${code}`);
      }
    });

    this.captureProc.on('error', (err) => {
      this.isCapturing = false;
      console.error('[Audio] Failed to start:', err.message);
      this.emit('error', err);
    });

    console.log('[Audio] WASAPI Loopback capture started (system audio)');
    console.log(`[Audio] Output: MP3 192kbps, ${this.sampleRate}Hz, ${this.channels}ch`);
  }

  stop() {
    this.isCapturing = false;
    // On Windows, child.kill() may not kill the process tree.
    // Use taskkill /T /F to force-kill the entire process tree.
    const kill = (proc) => {
      if (!proc || !proc.pid) return;
      try {
        spawn('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { stdio: 'ignore' });
      } catch {
        try { proc.kill(); } catch {}
      }
    };
    kill(this.captureProc);
    kill(this.encoderProc);
    this.captureProc = null;
    this.encoderProc = null;
    console.log('[Audio] Capture stopped');
  }

  getMetadata() {
    return {
      sampleRate: this.sampleRate,
      channels: this.channels,
      bitDepth: this.bitDepth
    };
  }
}

module.exports = AudioCapture;
