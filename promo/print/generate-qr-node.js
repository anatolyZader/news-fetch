#!/usr/bin/env node
/**
 * Generate srulik.ai QR for poster + brochure (uses project qrcode if installed).
 *   node generate-qr-node.js
 */
const path = require('path');

const URL = 'https://srulik.ai';
const dir = __dirname;

async function main() {
  let QR;
  try {
    QR = require('qrcode');
  } catch {
    console.error('Install qrcode: npm install --no-save qrcode (from repo root)');
    process.exit(1);
  }
  await QR.toFile(path.join(dir, 'qr-srulik-ai.png'), URL, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 1024,
    color: { dark: '#2f3648', light: '#ffffff' },
  });
  await QR.toFile(path.join(dir, 'qr-srulik-ai.svg'), URL, {
    errorCorrectionLevel: 'H',
    margin: 4,
    color: { dark: '#2f3648', light: '#ffffff' },
  });
  console.log('Wrote qr-srulik-ai.png and qr-srulik-ai.svg for', URL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
