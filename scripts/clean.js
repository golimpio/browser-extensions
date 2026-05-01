// Removes the dist/ directory.
import { rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(resolve(__dirname, '..'), 'dist');

await rm(distDir, { recursive: true, force: true });
console.log(`[clean] removed ${distDir}`);
