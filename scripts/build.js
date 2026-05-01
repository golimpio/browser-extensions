// Build script for browser extensions.
// Reads source from spoof-timezone/current/, produces CRX + update.xml in dist/.
// Cross-platform (macOS / Windows / Linux). Requires Node 20+.
//
// Usage:
//   node scripts/build.js              # build all (currently just Chrome)
//   node scripts/build.js --chrome     # explicitly Chrome only
//
// Signing key resolution (in order):
//   1. --key <path>                  CLI flag
//   2. SPOOF_TZ_CHROME_KEY env var   Path to the .pem
//   3. Default per-platform location:
//        macOS / Linux:  ~/.config/spoof-timezone/chrome.pem
//        Windows:        %LOCALAPPDATA%\spoof-timezone\chrome.pem
//
// If the key file does not exist, the script generates a new RSA-2048 key
// and writes it to that location. Subsequent builds reuse the same key
// so the extension ID stays stable.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

import ChromeExtension from 'crx';

// ---------- paths ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const repoRoot   = resolve(__dirname, '..');
const sourceDir  = join(repoRoot, 'spoof-timezone', 'current');
const distDir    = join(repoRoot, 'dist');

// ---------- arg parsing (tiny, no deps) ----------

const args = process.argv.slice(2);
const flags = {
  chrome: true, // default; Firefox build to be added later
  keyPath: null
};
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

  // sanity checks
  if (manifest.manifest_version !== 3) {
    die(`manifest_version must be 3 for Chrome/Edge (got ${manifest.manifest_version})`);
  }
  if (!manifest.version || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    die(`invalid manifest version: ${manifest.version}`);
  }
  if (!manifest.update_url) {
    warn('manifest has no update_url — auto-updates will not work');
  }
  return manifest;
};

// ---------- key handling ----------

const loadOrCreateKey = async (keyPath) => {
  if (await fileExists(keyPath)) {
    log(`using existing signing key: ${keyPath}`);
    return readFile(keyPath);
  }

  log(`signing key not found at ${keyPath} — generating a new one`);
  log('  (this is a one-time event; the same key signs all future releases)');

  // Generate via Node's webcrypto. The crx package accepts PEM-encoded RSA keys.
  const { generateKeyPair } = await import('node:crypto');
  const { promisify } = await import('node:util');
  const generate = promisify(generateKeyPair);

  const { privateKey } = await generate('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  await ensureDir(dirname(keyPath));
  await writeFile(keyPath, privateKey, { mode: 0o600 });
  log(`new signing key written to: ${keyPath}`);
  log('  IMPORTANT: back this file up. Losing it means a new extension ID');
  log('  on next build, which breaks force-installed deployments.');
  return Buffer.from(privateKey);
};

// ---------- CRX build ----------

const renderUpdateXml = ({ appId, version, codebase }) => `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${appId}'>
    <updatecheck codebase='${codebase}' version='${version}' />
  </app>
</gupdate>
`;

// Compute the Chrome extension ID from a DER-encoded SPKI public key.
// Chrome derives the ID by SHA-256 hashing the DER bytes of the public key,
// then mapping the first 16 hex chars into letters a–p.
const computeExtensionId = async (publicKeyDer) => {
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(publicKeyDer).digest();
  const hex = digest.subarray(0, 16).toString('hex');
  return Array.from(hex).map(c => {
    const code = parseInt(c, 16);
    return String.fromCharCode('a'.charCodeAt(0) + code);
  }).join('');
};

const buildChromeCrx = async (manifest, privateKey) => {
  log('building CRX...');
  const crx = new ChromeExtension({ privateKey });
  await crx.load(sourceDir);
  const crxBuffer = await crx.pack();

  const crxPath = join(distDir, 'spoof-timezone.crx');
  await writeFile(crxPath, crxBuffer);
  log(`wrote ${crxPath} (${(crxBuffer.length / 1024).toFixed(1)} KiB)`);

  // crx exposes the public key as a Buffer after pack(); compute the ID from it
  const extensionId = await computeExtensionId(crx.publicKey);
  log(`extension ID: ${extensionId}`);

  // Pull the codebase URL from the manifest so update.xml stays in sync.
  // We assume the CRX is hosted in the same path as update.xml.
  const updateUrl = manifest.update_url;
  if (!updateUrl) {
    die('cannot generate update.xml without manifest.update_url');
  }
  const codebaseUrl = updateUrl.replace(/update\.xml$/, 'spoof-timezone.crx');

  const updateXml = renderUpdateXml({
    appId: extensionId,
    version: manifest.version,
    codebase: codebaseUrl
  });
  const updatePath = join(distDir, 'update.xml');
  await writeFile(updatePath, updateXml);
  log(`wrote ${updatePath}`);

  return { extensionId, crxPath, updatePath };
};

// ---------- main ----------

const main = async () => {
  log(`source: ${sourceDir}`);
  log(`output: ${distDir}`);

  if (!existsSync(sourceDir)) {
    die(`source directory does not exist: ${sourceDir}`);
  }

  await ensureDir(distDir);

  const manifest = await readManifest();
  log(`extension: ${manifest.name} v${manifest.version}`);

  if (flags.chrome) {
    const keyPath = resolveKeyPath();
    const privateKey = await loadOrCreateKey(keyPath);
    const { extensionId } = await buildChromeCrx(manifest, privateKey);
    log('');
    log(`> Use this Extension ID in your Intune ExtensionInstallForcelist value:`);
    log(`> ${extensionId};${manifest.update_url}`);
  }

  log('done');
};

main().catch(err => {
  console.error('[build] unexpected error:', err);
  process.exit(1);
});
