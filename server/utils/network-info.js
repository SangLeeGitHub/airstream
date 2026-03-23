const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function printServerInfo(port) {
  const ip = getLocalIP();
  const url = `http://${ip}:${port}`;

  console.log('\n========================================');
  console.log('  AirStream - WiFi Audio Streamer');
  console.log('========================================');
  console.log(`\n  Server running at: ${url}`);
  console.log(`  Local: http://localhost:${port}`);
  console.log('\n  Scan QR code on your iPhone:\n');

  try {
    const qrcode = require('qrcode-terminal');
    qrcode.generate(url, { small: true });
  } catch {
    console.log(`  (install qrcode-terminal for QR code)`);
  }

  console.log('\n========================================\n');
  return url;
}

module.exports = { getLocalIP, printServerInfo };
