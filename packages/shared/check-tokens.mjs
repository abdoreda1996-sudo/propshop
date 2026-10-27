/**
 * Guards against the web and mobile apps drifting apart.
 *
 * TypeScript and Dart cannot share a module, so design-tokens.json is the canonical
 * source and each app mirrors it. This script reads the two mirrors and reports any
 * value that no longer matches.
 *
 * Usage: node packages/shared/check-tokens.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const tokens = JSON.parse(fs.readFileSync(path.join(here, 'design-tokens.json'), 'utf8'));
const css = fs.readFileSync(path.join(root, 'propshop-web', 'src', 'app', 'globals.css'), 'utf8');
const dart = fs.readFileSync(path.join(root, 'propshop-app', 'lib', 'theme', 'tokens.dart'), 'utf8');
const enums = fs.readFileSync(path.join(root, 'propshop-web', 'src', 'lib', 'enums.ts'), 'utf8');
const format = fs.readFileSync(path.join(root, 'propshop-app', 'lib', 'services', 'format.dart'), 'utf8');

const problems = [];

// --- Colours: web CSS custom properties ----------------------------------
for (const [family, shades] of Object.entries(tokens.color)) {
  if (family === 'semantic' || family === 'status') continue;
  for (const [shade, hex] of Object.entries(shades)) {
    if (!css.includes(`--color-${family}-${shade}: ${hex}`)) {
      problems.push(`web globals.css is missing --color-${family}-${shade}: ${hex}`);
    }
  }
}

// --- Colours: the Dart constants the app actually declares ----------------
const dartName = (family, shade) => `${family}${shade}`;
for (const [family, shades] of Object.entries(tokens.color)) {
  if (family === 'semantic' || family === 'status') continue;
  for (const [shade, hex] of Object.entries(shades)) {
    const name = dartName(family, shade);
    if (!dart.includes(`static const ${name} =`)) continue; // Dart carries a subset
    const expected = `0xFF${hex.slice(1).toUpperCase()}`;
    if (!dart.includes(`static const ${name} = Color(${expected})`)) {
      problems.push(`app tokens.dart declares ${name} but not ${expected}`);
    }
  }
}

// --- Radii ----------------------------------------------------------------
if (!css.includes(`--radius-card: ${tokens.radius.card}px`)) {
  problems.push(`web --radius-card does not match ${tokens.radius.card}px`);
}
if (!dart.includes(`static const card = ${tokens.radius.card}.0;`)) {
  problems.push(`app AqarRadius.card does not match ${tokens.radius.card}`);
}

// --- Business constants both clients display ------------------------------
const rules = tokens.rules;
if (!enums.includes(`export const MIN_PHOTOS = ${rules.minPhotos};`)) {
  problems.push(`enums.ts MIN_PHOTOS does not match ${rules.minPhotos}`);
}
if (!enums.includes(`export const MAX_ACTIVE_LISTINGS_PER_IDENTITY = ${rules.maxActiveListingsPerIdentity};`)) {
  problems.push(`enums.ts MAX_ACTIVE_LISTINGS_PER_IDENTITY does not match ${rules.maxActiveListingsPerIdentity}`);
}
if (!enums.includes(`export const SLA_HOURS = ${rules.slaHours};`)) {
  problems.push(`enums.ts SLA_HOURS does not match ${rules.slaHours}`);
}

const dartRooms = format.match(/const requiredRooms = \[([^\]]+)\]/);
if (!dartRooms) {
  problems.push('app format.dart does not declare requiredRooms');
} else {
  const parsed = dartRooms[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  if (parsed.join('|') !== rules.requiredRooms.join('|')) {
    problems.push(`app requiredRooms [${parsed}] does not match [${rules.requiredRooms}]`);
  }
}

if (problems.length === 0) {
  console.log('Design tokens and shared rules are in sync across web and mobile.');
  process.exit(0);
}

console.error(`${problems.length} drift(s) found:\n`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
