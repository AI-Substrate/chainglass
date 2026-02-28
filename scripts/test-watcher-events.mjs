#!/usr/bin/env node
/**
 * File watcher stress test — writes to scratch/ every 5 seconds.
 *
 * Tests three operations:
 * 1. File UPDATE: overwrites scratch/watcher-test.md with new timestamp
 * 2. File CREATE/DELETE: creates scratch/watcher-temp-<n>.txt, deletes previous
 * 3. Dir CREATE/DELETE: creates scratch/watcher-dir-<n>/, deletes previous
 *
 * Usage: node scripts/test-watcher-events.mjs
 * Stop: Ctrl+C
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SCRATCH = join(import.meta.dirname, '..', 'scratch');
const MD_FILE = join(SCRATCH, 'watcher-test.md');

let tick = 0;
let prevFile = null;
let prevDir = null;

const adjectives = ['blazing', 'cosmic', 'quantum', 'stellar', 'neon', 'turbo', 'hyper', 'mega', 'ultra', 'galactic'];
const nouns = ['wombat', 'phoenix', 'kraken', 'nebula', 'vortex', 'cascade', 'helix', 'prism', 'aurora', 'cipher'];

function randomWord(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomHex() { return Math.random().toString(16).slice(2, 10); }

async function cycle() {
  tick++;
  const ts = new Date().toISOString();
  const name = `${randomWord(adjectives)}-${randomWord(nouns)}`;

  console.log(`\n[${ts}] Tick ${tick} — ${name}`);

  // 1. UPDATE: overwrite markdown file
  const md = `# Watcher Test — Tick ${tick}\n\n` +
    `**Time**: ${ts}\n` +
    `**Name**: ${name}\n` +
    `**Hash**: ${randomHex()}\n` +
    `**Tick**: ${tick}\n\n` +
    `> This file is overwritten every 5 seconds by test-watcher-events.mjs\n`;
  await writeFile(MD_FILE, md);
  console.log(`  ✏️  Updated ${MD_FILE}`);

  // 2. FILE CREATE + DELETE previous
  const newFile = join(SCRATCH, `watcher-temp-${tick}.txt`);
  await writeFile(newFile, `Temporary file ${tick} — ${name} — ${ts}\n`);
  console.log(`  📄 Created ${newFile}`);
  if (prevFile) {
    await rm(prevFile, { force: true });
    console.log(`  🗑️  Deleted ${prevFile}`);
  }
  prevFile = newFile;

  // 3. DIR CREATE + DELETE previous
  const newDir = join(SCRATCH, `watcher-dir-${tick}`);
  await mkdir(newDir, { recursive: true });
  console.log(`  📁 Created ${newDir}/`);
  if (prevDir) {
    await rm(prevDir, { recursive: true, force: true });
    console.log(`  🗑️  Deleted ${prevDir}/`);
  }
  prevDir = newDir;
}

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n\nCleaning up...');
  if (prevFile) await rm(prevFile, { force: true }).catch(() => {});
  if (prevDir) await rm(prevDir, { recursive: true, force: true }).catch(() => {});
  await rm(MD_FILE, { force: true }).catch(() => {});
  console.log('Done.');
  process.exit(0);
});

console.log('🔄 Watcher event generator — writing to scratch/ every 5s');
console.log('   Press Ctrl+C to stop and clean up\n');

await cycle();
setInterval(cycle, 5000);
