const { spawn } = require('child_process');

function listAudioDevices() {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-list_devices', 'true',
      '-f', 'dshow',
      '-i', 'dummy'
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', () => {
      const devices = parseDeviceList(stderr);
      resolve(devices);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg not found. Please install FFmpeg and add it to PATH.\n${err.message}`));
    });
  });
}

function parseDeviceList(output) {
  const audioDevices = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Skip alternative name lines
    if (line.includes('Alternative name')) continue;

    // Match lines like: [dshow @ ...] "Device Name" (audio)
    const match = line.match(/"([^"]+)"\s+\(audio\)/);
    if (match) {
      audioDevices.push(match[1]);
    }
  }

  return audioDevices;
}

// Run directly to list devices
if (require.main === module) {
  console.log('Scanning audio devices...\n');
  listAudioDevices()
    .then((devices) => {
      if (devices.length === 0) {
        console.log('No audio devices found.');
        console.log('\nTo capture system audio, you need one of:');
        console.log('  1. Enable "Stereo Mix" in Windows Sound settings');
        console.log('  2. Install VB-Cable: https://vb-audio.com/Cable/');
        console.log('  3. Install VoiceMeeter: https://vb-audio.com/Voicemeeter/');
      } else {
        console.log('Available audio devices:');
        devices.forEach((d, i) => console.log(`  [${i}] ${d}`));
        console.log(`\nUsage: DEVICE_INDEX=<number> npm start`);
      }
    })
    .catch((err) => console.error(err.message));
}

module.exports = { listAudioDevices };
