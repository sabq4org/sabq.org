import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// These paths bypass Pages Functions. A missing file must fail the build rather
// than fall through to the SPA shell without the middleware's HTML safeguards.
const root = resolve('dist/public');
const read = (name) => readFileSync(resolve(root, name));
const info = JSON.parse(read('build-info.json'));
const html = read('index.html').toString();
if (typeof info.buildId !== 'string' || !info.buildId || !html.includes(`name="sabq-build-id" content="${info.buildId}"`)) {
  throw new Error('Build ID missing or inconsistent with the HTML shell');
}
const favicon = read('favicon.ico');
if (favicon.length < 6 || favicon.readUInt16LE(0) !== 0 || favicon.readUInt16LE(2) !== 1 || favicon.readUInt16LE(4) < 1 || !JSON.parse(read('manifest.webmanifest')).name) {
  throw new Error('Missing favicon or invalid manifest');
}
const headers = read('_headers').toString();
if (!/\/build-info\.json\s*\n\s*Cache-Control:[^\n]*no-store/i.test(headers)) {
  throw new Error('Build ID probe must retain its no-store header');
}
console.log('Pages static assets and build ID verified');
