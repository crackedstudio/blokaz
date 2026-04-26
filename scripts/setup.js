#!/usr/bin/env node
import { existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function copyIfMissing(src, dest) {
  if (existsSync(dest)) {
    console.log(`  exists   ${dest.replace(root + '/', '')}`);
    return;
  }
  if (!existsSync(src)) {
    console.warn(`  missing  ${src.replace(root + '/', '')} — skipping`);
    return;
  }
  copyFileSync(src, dest);
  console.log(`  created  ${dest.replace(root + '/', '')}  (copied from ${src.replace(root + '/', '')})`);
}

console.log('\nBlokaz setup\n');
copyIfMissing(resolve(root, '.env.example'), resolve(root, '.env'));
copyIfMissing(resolve(root, 'server/.env.example'), resolve(root, 'server/.env'));

console.log('\nDone. Open .env and server/.env and fill in your private keys.\n');
