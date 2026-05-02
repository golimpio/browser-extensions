# Spoof Timezone — Intune macOS Deployment

## File

`spoof-timezone.mobileconfig` — deploy this file to Intune to force-install the Spoof Timezone extension on macOS devices.

## What it does

Force-installs the extension silently in both Microsoft Edge and Google Chrome via managed preferences. On MDM check-in the browser fetches `update.xml` and installs or updates the extension automatically with no user interaction required.

## Extension details

| Field | Value |
|---|---|
| Extension ID | `gnadioobeeegopmcefjaldonfgbaopfh` |
| Update URL | `https://golimpio.github.io/browser-extensions/spoof-timezone/update.xml` |
| Targets | Microsoft Edge (`com.microsoft.Edge`), Google Chrome (`com.google.Chrome`) |

The extension ID is stable — it is derived from the CRX signing key and does not change across updates or machines.

## Deployment steps

1. Intune > Devices > macOS > Configuration profiles > Create > New policy
2. Profile type: Templates > Custom
3. Upload `spoof-timezone.mobileconfig`
4. Assign to your macOS device group
5. Devices will pick it up on next MDM check-in or manual sync via Company Portal

## Updating the extension

No profile changes are needed for extension updates. Once deployed, the browser polls `update.xml` periodically and silently updates the extension when a new version is published. Intune is not involved in the update cycle after initial deployment.

## Profile identifiers

| Key | Value |
|---|---|
| `PayloadIdentifier` | `com.dataworks.intune.spoof-timezone` |
| `PayloadOrganization` | Dataworks Group |
| `PayloadScope` | System |
| `PayloadRemovalDisallowed` | false |

Keep `PayloadIdentifier` stable across profile updates so macOS replaces the existing profile cleanly rather than installing a duplicate.
