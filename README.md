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

- `pnpm safari:xcode` builds the WXT Safari bundle, converts it with `xcrun safari-web-extension-converter`, and generates the Xcode project in `dist/safari/`
- `pnpm sign:safari-local IDENTITY="Developer ID Application: Your Name (TEAMID)"` signs the generated app
- `pnpm notarize:safari-local PROFILE="profile-name"` notarizes and zips the signed app

WXT builds the extension bundle, and the Safari/Xcode flow wraps that bundle into the macOS app structure Apple expects.

To test the Safari build locally:

1. Run `pnpm safari:xcode`
2. Open `dist/safari/JabRef Browser Extension/JabRef Browser Extension.xcodeproj`
3. Run the `JabRef Browser Extension` scheme in Xcode
4. Enable the extension in Safari Settings

The generated macOS app bundle is placed at `dist/safari/JabRef Browser Extension.app`.

Safari CI is split into two parts:

1. `Tests` workflow:
   - `safari-build` runs on `macos-latest`
   - it executes `make safari`
   - this validates the converter and Xcode packaging path on pull requests and on `main`
2. `release` workflow:
   - `safari-package` builds and uploads the unsigned Safari app artifact
   - `safari-notarize` signs, notarizes, staples, and uploads the notarized Safari artifacts for real releases

The Safari notarization job expects these GitHub Actions secrets:

- `OSX_SIGNING_CERT_APPLICATION`: base64-encoded `.p12` Developer ID Application certificate
- `OSX_CERT_PWD`: password for that `.p12`
- `SAFARI_DEVELOPER_IDENTITY`: full codesigning identity, for example `Developer ID Application: JabRef e.V. (TEAMID)`
- `APPLE_NOTARY_APPLE_ID`: Apple ID used for notarization
- `APPLE_NOTARY_TEAM_ID`: Apple Developer team ID
- `APPLE_NOTARY_PASSWORD`: app-specific password for the Apple ID

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
