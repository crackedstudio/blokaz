import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

/**
 * Loads server/.env regardless of the working directory.
 *
 * dotenv.config() with no path reads from process.cwd(), so starting the server
 * from the repo root — which `npm run dev:server` and `scripts/dev.js` both do —
 * picked up the root .env (the browser's VITE_* vars) instead of this one, and
 * the process died on a missing SIGNER_PRIVATE_KEY. Anchoring the path to this
 * file makes the entry point's working directory irrelevant.
 *
 * Import this once, first, from any module that reads process.env. Repeat
 * imports are free — ESM evaluates a module once and caches it — and dotenv
 * never overwrites a variable that is already set, so a real environment
 * (Render, CI) still wins over the file.
 */
dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) })
