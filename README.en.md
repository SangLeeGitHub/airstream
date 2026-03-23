# AirStream

[한국어](README.md)

Stream Windows PC system audio to any browser (iPhone/iPad/Android) over WiFi.
Listen through AirPods or any Bluetooth audio device.
Supports Safari, Chrome, and other major browsers.

```
Windows PC                          iPhone/iPad/Android
[System Audio] → [WASAPI Loopback]     Safari / Chrome etc.
       → [MP3 Encoding] → HTTP ──→  <audio> tag playback
                                      → AirPods / Bluetooth
```

## Features

- No app required (works in Safari, Chrome, and other browsers)
- WASAPI Loopback capture (works even when PC is muted)
- Real-time MP3 128kbps streaming
- iOS background/lock screen playback support
- QR code for easy connection
- Multiple simultaneous clients

## Prerequisites

- **Windows 10/11**
- **Node.js 18+** - https://nodejs.org
- **FFmpeg** - https://ffmpeg.org (must be in PATH)

Verify FFmpeg installation:
```bash
ffmpeg -version
```

## Install & Run

```bash
git clone https://github.com/SangLeeGitHub/airstream.git
cd airstream
npm install
npm start
```

When the server starts, a URL and QR code will be displayed in the terminal.
Open the URL in your phone's browser and tap "Start" to begin playback.

## Portable Build (No Node.js required)

```bash
npm install
npm run build
```

The following files are automatically generated in the `dist/` folder:

```
dist/
├── airstream.exe        # Server executable
├── wasapi-capture.exe   # Audio capture
├── ffmpeg.exe           # MP3 encoder
└── client/
    └── index.html       # Web client
```

Copy the entire `dist/` folder to any Windows PC and run `airstream.exe`.

## Usage

1. Run `npm start` or `airstream.exe` on your PC
2. Make sure your phone and PC are on the same WiFi network
3. Open the URL shown in terminal (or scan the QR code)
4. Tap "Start"
5. Play music/video on PC → audio streams to your phone

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

## Known Limitations

- Audio latency of ~3-5 seconds (due to iOS `<audio>` tag internal buffering)
- Audio/video sync is not supported for web video playback (e.g. YouTube)
- Only works within the same WiFi LAN

## License

MIT
