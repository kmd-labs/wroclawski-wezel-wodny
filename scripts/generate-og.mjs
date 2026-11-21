#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const appTitle = "Wroclawski Wezel Wodny";
const appSlug = "wroclawski-wezel-wodny";

let logoSvg = '';
const logoCandidates = [
  path.join(root, 'src/design-system/assets/logo/kmd-black-orange.svg'),
  path.join(root, 'assets/design-system/logo/kmd-black-orange.svg')
];
for (const p of logoCandidates) {
  if (fs.existsSync(p)) {
    logoSvg = fs.readFileSync(p, 'utf8');
    break;
  }
}

let logoPaths = '';
if (logoSvg) {
  const match = logoSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  if (match) {
    logoPaths = match[1].replace(/<defs>[\s\S]*?<\/defs>/gi, '').trim();
  }
}

const cardW = 1040;
const cardH = 470;
const cardX = 80;
const cardY = 80;

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="50%" stop-color="#f5f7fb"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <radialGradient id="glow-1" cx="0.2" cy="0.25" r="0.6">
      <stop offset="0%" stop-color="#D37400" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#D37400" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow-2" cx="0.85" cy="0.8" r="0.6">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>
    </radialGradient>
    <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- Airy Light Background -->
  <rect width="1200" height="630" fill="url(#bg-grad)"/>
  <rect width="1200" height="630" fill="url(#glow-1)"/>
  <rect width="1200" height="630" fill="url(#glow-2)"/>

  <!-- Subtle Geometric Grid -->
  <g stroke="#0f172a" stroke-opacity="0.035" stroke-width="1">
    <line x1="0" y1="157" x2="1200" y2="157"/>
    <line x1="0" y1="315" x2="1200" y2="315"/>
    <line x1="0" y1="472" x2="1200" y2="472"/>
    <line x1="300" y1="0" x2="300" y2="630"/>
    <line x1="600" y1="0" x2="600" y2="630"/>
    <line x1="900" y1="0" x2="900" y2="630"/>
  </g>

  <!-- Frosted Glass Hero Card -->
  <g filter="url(#card-shadow)">
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="28" fill="#ffffff" fill-opacity="0.88" stroke="#0f172a" stroke-opacity="0.08" stroke-width="1.5"/>
  </g>

  <!-- Content Container -->
  <g transform="translate(${cardX + 64}, ${cardY + 60})">
    <!-- Top Header: Official KMD Logotype + Badge -->
    <g transform="translate(0, 0)">
      <g transform="scale(0.062)">
        ${logoPaths}
      </g>
      <rect x="190" y="14" width="228" height="32" rx="16" fill="#0f172a" fill-opacity="0.06"/>
      <text x="304" y="35" font-family="DejaVu-Sans, Inter, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#475569" text-anchor="middle" letter-spacing="1">SCIENTIFIC VISUALIZATION</text>
    </g>

    <!-- App Title (Dynamically bound to repository) -->
    <text x="0" y="218" font-family="DejaVu-Sans, Inter, -apple-system, sans-serif" font-size="52" font-weight="bold" fill="#0f172a">${appTitle}</text>

    <!-- App Description -->
    <text x="0" y="274" font-family="DejaVu-Sans, Inter, -apple-system, sans-serif" font-size="22" fill="#475569">Zero-friction 3D WebGL simulation and planetary telemetry.</text>
    <text x="0" y="308" font-family="DejaVu-Sans, Inter, -apple-system, sans-serif" font-size="20" fill="#64748b">Open scientific datasets by KMD Labs.</text>

    <!-- Divider Line -->
    <line x1="0" y1="344" x2="${cardW - 128}" y2="344" stroke="#e2e8f0" stroke-width="1.5"/>

    <!-- Bottom Footer Badges -->
    <g transform="translate(0, 368)">
      <!-- Repo URL Pill -->
      <rect x="0" y="0" width="270" height="34" rx="17" fill="#fdf6ed" stroke="#f7cfa0" stroke-width="1"/>
      <text x="135" y="22" font-family="DejaVu-Sans, Inter, -apple-system, sans-serif" font-size="13" font-weight="bold" fill="#D37400" text-anchor="middle">kmd-labs.github.io/${appSlug}</text>

      <!-- Award Pill -->
      <rect x="284" y="0" width="320" height="34" rx="17" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <text x="444" y="22" font-family="DejaVu-Sans, Inter, -apple-system, sans-serif" font-size="13" fill="#334155" text-anchor="middle">EUSPA 11th CASSINI Hackathon EU Winners</text>

      <!-- Main Domain link -->
      <text x="${cardW - 128}" y="22" font-family="DejaVu-Sans, Inter, -apple-system, sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="end">kmd-labs.org →</text>
    </g>
  </g>
</svg>`;

const assetsDir = path.join(root, 'src/assets');
fs.mkdirSync(assetsDir, { recursive: true });

const svgPath = path.join(assetsDir, 'og-image.svg');
const pngPath = path.join(assetsDir, 'og-image.png');
fs.writeFileSync(svgPath, svgContent, 'utf8');

let converted = false;
try {
  execSync(`convert -font DejaVu-Sans "${svgPath}" "${pngPath}"`, { stdio: 'pipe' });
  converted = true;
} catch {
  try {
    execSync(`rsvg-convert -w 1200 -h 630 "${svgPath}" -o "${pngPath}"`, { stdio: 'pipe' });
    converted = true;
  } catch {}
}

if (!converted) {
  const fallbackPng = path.join(root, 'src/design-system/assets/og-image.png');
  if (fs.existsSync(fallbackPng)) {
    fs.copyFileSync(fallbackPng, pngPath);
  }
}
console.log('✅ Generated OpenGraph social preview assets (og-image.svg & og-image.png)');
