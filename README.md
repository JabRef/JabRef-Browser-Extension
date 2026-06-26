# JabRef Browser Extension

> [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabref/?src=external-github) - [Chrome](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - [Edge](https://microsoftedge.microsoft.com/addons/detail/pgkajmkfgbehiomipedjhoddkejohfna) - [Vivaldi](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - Safari (build from source)

Browser extension for users of the bibliographic reference manager [JabRef](https://www.jabref.org/).
It automatically identifies and extracts bibliographic information on websites and sends them to JabRef with one click.

When you find an interesting article through Google Scholar, the arXiv or journal websites, this browser extension allows you to add those references to JabRef.
Even links to accompanying PDFs are sent to JabRef, where those documents can easily be downloaded, renamed and placed in the correct folder.
[A wide range of publisher sites, library catalogs and databases are supported](https://www.zotero.org/support/translators).

_Please post any issues or suggestions [here on GitHub](https://github.com/JabRef/JabRef-Browser-Extension/issues)._

## Installation and Configuration

Normally, you simply install the extension from the browser store and are ready to go.

> [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabref/?src=external-github) - [Chrome](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - [Edge](https://microsoftedge.microsoft.com/addons/detail/pgkajmkfgbehiomipedjhoddkejohfna) - [Vivaldi](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - Safari (build from source)

Sometimes, a manual installation is necessary (e.g. if you use the portable version of JabRef). In this case, please follow the steps described [in the user manual](https://docs.jabref.org/import-export/import/jabref-browser-extension).

Safari builds are available for local development via WXT:

- `pnpm build:safari` builds the Safari target into `.output/safari-mv3/`
- `pnpm dev:safari` builds the Safari development target

For the Apple packaging step:

- `pnpm safari:xcode` builds the Safari target and generates the Xcode project in `dist/safari/` through [`wxt-module-safari-xcode`](https://github.com/rxliuli/wxt-module-safari-xcode)
- `pnpm sign:safari-local IDENTITY="Developer ID Application: Your Name (TEAMID)"` signs the generated app
- `pnpm notarize:safari-local PROFILE="profile-name"` notarizes and zips the signed app

WXT builds the extension bundle, and `wxt-module-safari-xcode` converts that bundle into the Xcode project and macOS app structure Apple expects.

To test the Safari build locally:

1. Run `pnpm safari:xcode`
2. Open `dist/safari/JabRef Browser Extension.xcodeproj`
3. Run the `JabRef Browser Extension` scheme in Xcode
4. Enable the extension in Safari Settings

The generated macOS app bundle is placed at `dist/safari/JabRef Browser Extension.app`.

Safari CI is split into two parts:

1. `Tests` workflow:
   - `safari-build` runs on `macos-latest`
   - it executes `make safari`
   - this validates the WXT build, Xcode packaging, and Safari app bundle path on pull requests and on `main`
2. `release` workflow:
   - `safari-package` builds and uploads the unsigned Safari app artifact
   - `safari-publish` rebuilds the Xcode project on `macos-26` and publishes it to App Store Connect with [`rxliuli/safari-webext-publish-action`](https://github.com/rxliuli/safari-webext-publish-action)
3. `Safari Signing Test` workflow:
   - manual `workflow_dispatch` workflow with a `run_safari_signing_test` checkbox
   - it builds the Safari project and runs the App Store signing/publish step without touching the release workflow

The Safari publish job expects these GitHub Actions secrets:

- `APPLE_TEAM_ID`: Apple Developer team ID
- `APPLE_CERTIFICATE_BASE64`: base64-encoded `.p12` certificate containing the App Store signing identities
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12`
- `SAFARI_APP_SIGNING_IDENTITY`: full app signing identity, for example `Apple Distribution: JabRef e.V. (TEAMID)`
- `SAFARI_INSTALLER_SIGNING_IDENTITY`: full installer signing identity, for example `Mac Installer Distribution: JabRef e.V. (TEAMID)`
- `APPLE_MACOS_PROVISIONING_PROFILE_BASE64`: base64-encoded macOS App Store provisioning profile for the app bundle ID
- `APPLE_MACOS_EXTENSION_PROVISIONING_PROFILE_BASE64`: base64-encoded macOS App Store provisioning profile for the extension bundle ID
- `APPLE_API_KEY`: base64-encoded App Store Connect API key (`.p8`)
- `APPLE_API_KEY_ID`: App Store Connect API key ID
- `APPLE_API_ISSUER`: App Store Connect API issuer ID

The local `pnpm sign:safari-local` and `pnpm notarize:safari-local` commands still exist for manual Developer ID packaging outside the App Store flow.

## Usage

After the installation, you should be able to import bibliographic references into JabRef directly from your browser.
Just visit a publisher site or some other website containing bibliographic information (for example, [the arXiv](http://arxiv.org/list/gr-qc/pastweek?skip=0&show=5)) and click the JabRef symbol in the Firefox search bar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>).
Once the JabRef browser extension has extracted the references and downloaded the associated PDF's, the import window of JabRef opens.

You might want to configure JabRef so that new entries are always imported in an already opened instance of JabRef.
For this, activate "Remote operation" under the Network tab in the JabRef Preferences.

## About this Add-On

Internally, this browser extension uses the magic of Zotero's site translators.
Thus most of the credit has to go to the Zotero development team and to the many authors of the [site translators collection](https://github.com/zotero/translators).
Note that this browser extension does not make any changes to the Zotero database and thus both plug-ins coexist happily with each other.
