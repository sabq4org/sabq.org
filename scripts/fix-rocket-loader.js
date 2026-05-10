#!/usr/bin/env node
/**
 * Post-build script to add data-cfasync="false" to module scripts
 * This prevents Cloudflare Rocket Loader from breaking ES modules
 */

import fs from 'fs';
import path from 'path';

const htmlPath = path.resolve('dist/public/index.html');

if (!fs.existsSync(htmlPath)) {
  console.log('[fix-rocket-loader] No dist/public/index.html found, skipping...');
  process.exit(0);
}

console.log('[fix-rocket-loader] Adding data-cfasync="false" to module scripts...');

let html = fs.readFileSync(htmlPath, 'utf-8');

// Add data-cfasync="false" to all module script tags that don't already have it
html = html.replace(
  /<script type="module"(?![^>]*data-cfasync)/g,
  '<script data-cfasync="false" type="module"'
);

// Also handle modulepreload links (optional, but prevents Rocket Loader issues)
html = html.replace(
  /<link rel="modulepreload"(?![^>]*data-cfasync)/g,
  '<link data-cfasync="false" rel="modulepreload"'
);

fs.writeFileSync(htmlPath, html);

console.log('[fix-rocket-loader] Done! Module scripts now have data-cfasync="false"');
