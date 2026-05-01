# browser-extensions

Internal browser extensions and build pipeline.

Currently ships:

- **Spoof Timezone** (`spoof-timezone/current/`) — fork of [webextension.org/spoof-timezone](https://webextension.org/listing/spoof-timezone.html). MV3, Chrome/Edge supported, Firefox 128+ source-compatible (build pipeline not yet wired up).

## Extensions

### Spoof Timezone

| Field            | Value                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Extension ID     | `gnadioobeeegopmcefjaldonfgbaopfh`                                                 |
| Update URL       | `https://golimpio.github.io/browser-extensions/spoof-timezone/update.xml`          |
| CRX URL          | `https://golimpio.github.io/browser-extensions/spoof-timezone/spoof-timezone.crx`  |
| Source           | `spoof-timezone/current/`                                                          |
| Signing key      | `~/.config/spoof-timezone/chrome.pem` (macOS/Linux) — backed up to vault           |

The Extension ID is derived from the signing key and is stable across all builds
as long as `chrome.pem` does not change.

## Build pipeline

Cross-platform Node.js (>= 20) + pnpm (>= 9). Same commands work on macOS, Windows, and Linux.

If you don't have pnpm yet, install it once: `npm install -g pnpm` (or via Corepack: `corepack enable`).

```fish
# install dependencies (one-off)
pnpm install

# build CRX + update.xml into dist/
pnpm build

# build and stage into docs/ for GitHub Pages publishing
pnpm release

# remove dist/
pnpm clean
```

### Signing key

Chrome extensions are signed with an RSA-2048 private key. The same key must be reused
across releases — a different key produces a different extension ID, which breaks
force-installed deployments. **The key is never committed to the repo.**

The build script looks for the key in this order:

1. `--key <path>` CLI flag
2. `SPOOF_TZ_CHROME_KEY` environment variable
3. Default location:
   - macOS / Linux: `~/.config/spoof-timezone/chrome.pem`
   - Windows: `%LOCALAPPDATA%\spoof-timezone\chrome.pem`

If no key exists at the resolved path, the script generates one on the first build.
**Back up that file** the moment it appears — stored alongside other secrets, e.g.
1Password / Dashlane / a YubiKey-encrypted vault. Losing it means starting over with
a new extension ID.

### Outputs

```
dist/
├── spoof-timezone.crx    # signed extension package
└── update.xml            # gupdate manifest used by Chrome's auto-update
```

`pnpm release` also copies these two files to `docs/spoof-timezone/` so they're
served by GitHub Pages when committed.

## Publishing flow

1. Edit source under `spoof-timezone/current/`.
2. Bump `version` in `spoof-timezone/current/manifest.json` (e.g. `2.0.0` → `2.0.1`).
3. `pnpm release`
4. Review the staged files in `docs/spoof-timezone/`.
5. Commit and push:

   ```fish
   git add docs/ spoof-timezone/current/manifest.json
   git commit -m "release: spoof-timezone v2.0.1"
   git push
   ```

6. Managed devices pick up the new version on their next Chrome/Edge auto-update
   check (within a few hours, or immediately on browser restart).

## Hosting

GitHub Pages must be enabled on this repo:

- **Settings → Pages → Source**: Deploy from a branch
- **Branch**: `main`, folder: `/docs`

Resulting URLs:

- `https://golimpio.github.io/browser-extensions/spoof-timezone/spoof-timezone.crx`
- `https://golimpio.github.io/browser-extensions/spoof-timezone/update.xml`

The `update_url` in `current/manifest.json` already points at the `update.xml` URL.

## Intune deployment

For each browser, create an Intune Settings Catalog macOS configuration profile with:

**Google Chrome → Extensions:**

- `ExtensionInstallForcelist`:
  ```
  <EXTENSION_ID>;https://golimpio.github.io/browser-extensions/spoof-timezone/update.xml
  ```
- `ExtensionInstallSources`:
  ```
  https://golimpio.github.io/*
  ```

**Microsoft Edge → Extensions:** same two settings, same values.

The build script prints the `EXTENSION_ID` after each build.

## Versions

- `current/` — the active version. Built and shipped.
- `v2/`, `v3/` — legacy upstream versions. Kept for historical reference; not built.

## License

MPL-2.0 (inherited from upstream).
