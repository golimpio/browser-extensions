// Release script: build, then stage artefacts into docs/ for GitHub Pages.
//
// After running this, review and commit the docs/ changes:
//   git add docs/ spoof-timezone/current/manifest.json
//   git commit -m "release: spoof-timezone vX.Y.Z"
//   git push
//
// GitHub Pages should be configured to serve from main branch /docs folder.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot  = resolve(__dirname, '..');
const distDir   = join(repoRoot, 'dist');
const docsRoot  = join(repoRoot, 'docs');
const docsDir   = join(docsRoot, 'spoof-timezone');

const log = (...m) => console.log('[release]', ...m);
const die = (msg) => { console.error('[release] ERROR:', msg); process.exit(1); };

// 1. Run build first
log('running build...');
const buildResult = spawnSync(process.execPath, [join(__dirname, 'build.js')], {
  stdio: 'inherit'
});
if (buildResult.status !== 0) {
  die('build failed; aborting release');
}

// 2. Verify artefacts exist
const crxSrc    = join(distDir, 'spoof-timezone.crx');
const updateSrc = join(distDir, 'update.xml');
if (!existsSync(crxSrc) || !existsSync(updateSrc)) {
  die(`expected build artefacts not found in ${distDir}`);
}

// 3. Stage into docs/
await mkdir(docsDir, { recursive: true });
await copyFile(crxSrc,    join(docsDir, 'spoof-timezone.crx'));
await copyFile(updateSrc, join(docsDir, 'update.xml'));

// 3b. Ensure .nojekyll exists at docs/ root so GitHub Pages serves binary
// files (.crx) verbatim instead of running them through Jekyll, which would
// silently exclude unrecognised extensions.
const nojekyllPath = join(docsRoot, '.nojekyll');
if (!existsSync(nojekyllPath)) {
  await writeFile(nojekyllPath, '');
  log(`created ${nojekyllPath}`);
}

// 4. Read manifest for the user-facing summary
const manifest = JSON.parse(await readFile(
  join(repoRoot, 'spoof-timezone', 'current', 'manifest.json'),
  'utf8'
));

log('');
log(`staged for release: ${manifest.name} v${manifest.version}`);
log(`  ${join(docsDir, 'spoof-timezone.crx')}`);
log(`  ${join(docsDir, 'update.xml')}`);
log('');
log('next steps:');
log('  1. Verify docs/ contents look right');
log('  2. git add docs/ spoof-timezone/current/manifest.json');
log(`  3. git commit -m "release: spoof-timezone v${manifest.version}"`);
log('  4. git push');
log('');
log('Note: ensure GitHub Pages is enabled for this repo:');
log('  Settings → Pages → Source: Deploy from a branch');
log('  Branch: main, folder: /docs');
