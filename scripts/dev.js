#!/usr/bin/env node
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function run(cmd, args, opts = {}) {
  const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) process.exit(code);
  });
  return proc;
}

const server = run('node', ['server/index.js'], { cwd: root });
const vite   = run('npx', ['vite'],             { cwd: root });

process.on('SIGINT',  () => { server.kill('SIGINT');  vite.kill('SIGINT');  });
process.on('SIGTERM', () => { server.kill('SIGTERM'); vite.kill('SIGTERM'); });
