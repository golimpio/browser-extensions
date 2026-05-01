// Build script for browser extensions.
// Reads source from spoof-timezone/current/, produces CRX + update.xml in dist/.
// Cross-platform (macOS / Windows / Linux). Requires Node 22+.
//
// Usage:
//   pnpm build                  # default; build CRX + update.xml
//   pnpm build:chrome           # explicit Chrome target
//   node scripts/build.js --key /path/to/custom.pem
//
// Signing key resolution (in order):
//   1. --key <path>                  CLI flag
//   2. SPOOF_TZ_CHROME_KEY env var   Path to the .pem
//   3. Default per-platform location:
//        macOS / Linux:  ~/.config/spoof-timezone/chrome.pem
//        Windows:        %LOCALAPPDATA%\spoof-timezone\chrome.pem
//
// If the key file does not exist, crx3 generates one. Subsequent builds reuse
// the same key so the extension ID stays stable.

import { readFile, mkdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import { createHash, createPublicKey } from 'node:crypto';

import crx3 from 'crx3';

// ---------- paths ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const repoRoot   = resolve(__dirname, '..');
const sourceDir  = join(repoRoot, 'spoof-timezone', 'current');
const distDir    = join(repoRoot, 'dist');

// ---------- arg parsing ----------

const args = process.argv.slice(2);
const flags = { keyPath: null };
const keyIdx = args.indexOf('--key');
if (keyIdx !== -1 && args[keyIdx + 1]) {
  flags.keyPath = args[keyIdx + 1];
}

// ---------- helpers ----------

const log  = (...m) => console.log('[build]', ...m);
const warn = (...m) => console.warn('[build]', ...m);
const die  = (msg) => { console.error('[build] ERROR:', msg); process.exit(1); };

const resolveDefaultKeyPath = () => {
  if (platform() === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(local, 'spoof-timezone', 'chrome.pem');
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(xdg, 'spoof-timezone', 'chrome.pem');
};

const resolveKeyPath = () => {
  if (flags.keyPath) return resolve(flags.keyPath);
  if (process.env.SPOOF_TZ_CHROME_KEY) return resolve(process.env.SPOOF_TZ_CHROME_KEY);
  return resolveDefaultKeyPath();
};

const ensureDir = async (dir) => {
  await mkdir(dir, { recursive: true });
};

const fileExists = async (p) => {
  try { await access(p); return true; } catch { return false; }
};

// Compute the Chrome extension ID from a PEM-encoded RSA private key.
// Steps: PEM private key → SPKI DER public key → SHA-256 → first 16 bytes
// → 32 hex chars → mapped to letters a–p.
const computeExtensionId = async (pemPath) => {
  const pem = await readFile(pemPath, 'utf8');
  const publicKeyDer = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  const digest = createHash('sha256').update(publicKeyDer).digest();
  const hex = digest.subarray(0, 16).toString('hex');
  return Array.from(hex).map(c => {
    const code = parseInt(c, 16);
    return String.fromCharCode('a'.charCodeAt(0) + code);
  }).join('');
};

// ---------- manifest validation ----------

const readManifest = async () => {
  const manifestPath = join(sourceDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    die(`manifest.json not found at ${manifestPath}`);
  }
  const raw = await readFile(manifestPath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (e) {
    die(`manifest.json is not valid JSON: ${e.message}`);
  }
  if (manifest.manifest_version !== 3) {
    die(`manifest_version must be 3 for Chrome/Edge (got ${manifest.manifest_version})`);
  }
  if (!manifest.version || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    die(`invalid manifest version: ${manifest.version}`);
  }
  if (!manifest.update_url) {
    warn('manifest has no update_url — auto-updates will not work');
  }
  return { manifest, manifestPath };
};

// ---------- main ----------

const main = async () => {
  log(`source: ${sourceDir}`);
  log(`output: ${distDir}`);

  if (!existsSync(sourceDir)) {
    die(`source directory does not exist: ${sourceDir}`);
  }

  await ensureDir(distDir);

  const { manifest, manifestPath } = await readManifest();
  log(`extension: ${manifest.name} v${manifest.version}`);

  const keyPath = resolveKeyPath();
  const keyExisted = await fileExists(keyPath);

  if (!keyExisted) {
    log(`signing key not found at ${keyPath}`);
    log('  → crx3 will generate a new RSA-2048 key at this path');
    log('  → IMPORTANT: back this file up immediately after the build');
    await ensureDir(dirname(keyPath));
  } else {
    log(`using existing signing key: ${keyPath}`);
  }

  // Derive the codebase URL from the manifest's update_url:
  //   update_url:  https://.../spoof-timezone/update.xml
  //   codebase:    https://.../spoof-timezone/spoof-timezone.crx
  if (!manifest.update_url) {
    die('cannot build without manifest.update_url');
  }
  const crxURL = manifest.update_url.replace(/update\.xml$/, 'spoof-timezone.crx');

  const crxPath    = join(distDir, 'spoof-timezone.crx');
  const xmlPath    = join(distDir, 'update.xml');
  const zipPath    = join(distDir, 'spoof-timezone.zip');

  log('building CRX...');
  await crx3([manifestPath], {
    keyPath,
    crxPath,
    xmlPath,
    zipPath,
    crxURL,
    appVersion: manifest.version
  });

  // crx3 doesn't expose the extension ID, so we compute it from the key
  const extensionId = await computeExtensionId(keyPath);

  log(`wrote ${crxPath}`);
  log(`wrote ${xmlPath}`);
  log(`wrote ${zipPath} (intermediate; can be deleted)`);
  log('');
  log(`extension ID: ${extensionId}`);
  log('');
  log('Use this in your Intune ExtensionInstallForcelist value:');
  log(`  ${extensionId};${manifest.update_url}`);

  if (!keyExisted) {
    log('');
    log('═══════════════════════════════════════════════════════════════');
    log(' BACK UP YOUR SIGNING KEY NOW:');
    log(`   ${keyPath}`);
    log(' Losing this file means a new extension ID on next build,');
    log(' which breaks every force-installed deployment.');
    log('═══════════════════════════════════════════════════════════════');
  }
};

main().catch(err => {
  console.error('[build] unexpected error:', err);
  process.exit(1);
});
