const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function run(cmd, label) {
  console.log(`\n[Build] ${label}...`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

function copy(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`  Copied: ${path.basename(src)}`);
}

// 1. Clean dist
console.log('========================================');
console.log('  AirStream Build');
console.log('========================================');

if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 2. Compile wasapi-capture.exe
run(
  'powershell -ExecutionPolicy Bypass -File build-wasapi.ps1',
  'Compiling wasapi-capture.exe'
);

// 3. Package Node.js server with pkg
run(
  'npx pkg server/index.js --targets node18-win-x64 --output dist/airstream.exe',
  'Packaging airstream.exe with pkg'
);

// 4. Copy wasapi-capture.exe to dist
copy(
  path.join(ROOT, 'server', 'utils', 'wasapi-capture.exe'),
  path.join(DIST, 'wasapi-capture.exe')
);

// 5. Copy client files
const clientDir = path.join(ROOT, 'client');
const distClient = path.join(DIST, 'client');
fs.mkdirSync(distClient, { recursive: true });
for (const file of fs.readdirSync(clientDir)) {
  copy(path.join(clientDir, file), path.join(distClient, file));
}

// 6. Copy ffmpeg.exe if found
try {
  const ffmpegPath = execSync('where ffmpeg', { encoding: 'utf8' }).trim().split('\n')[0].trim();
  copy(ffmpegPath, path.join(DIST, 'ffmpeg.exe'));
} catch {
  console.log('\n  [!] ffmpeg.exe not copied — place it manually in dist/');
}

console.log('\n========================================');
console.log('  Build complete!');
console.log('========================================');
console.log(`\n  Output: ${DIST}`);
console.log('  Run: dist\\airstream.exe\n');
