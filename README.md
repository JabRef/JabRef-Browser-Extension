# JabRef Browser Extension

> [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabref/?src=external-github) -  [Chrome](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - [Edge](https://microsoftedge.microsoft.com/addons/detail/pgkajmkfgbehiomipedjhoddkejohfna) - [Vivaldi](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh)

Browser extension for users of the bibliographic reference manager [JabRef](https://www.jabref.org/).
It automatically identifies and extracts bibliographic information on websites and sends them to JabRef with one click.

When you find an interesting article through Google Scholar, the arXiv or journal websites, this browser extension allows you to add those references to JabRef.
Even links to accompanying PDFs are sent to JabRef, where those documents can easily be downloaded, renamed and placed in the correct folder.
[A wide range of publisher sites, library catalogs and databases are supported](https://www.zotero.org/support/translators).

_Please post any issues or suggestions [here on GitHub](https://github.com/JabRef/JabRef-Browser-Extension/issues)._

## Key Features

- Automatic detection and conversion: detects embedded BibTeX or RIS blocks, and can run local translators matched via `translators/manifest.json`.
- Legacy Zotero translators: many Zotero legacy translators run in an offscreen runner with small `ZU`/`Zotero` shims.
- Auto-send: when a BibTeX entry is produced, the popup will forward it to JabRef if JabRef is reachable over HTTP.
- Persistent logs: popup console messages are persisted to `chrome.storage.local` to aid debugging.
- Direct HTTP POST to JabRef (no external bridge required).

## Installation

### Install and Configure JabRef

- Download JabRef from the official site: <https://www.jabref.org/> and choose the installer or application bundle appropriate for your OS. **Currently you need to use the latest 6.0 alpha release**.
- Install and start JabRef using the normal installer or by running the downloaded application bundle.
- In JabRef open the application's Preferences `File -> Preferences`.
- Enable the listener as shown in the screenshot. Leave the default port, `23119`, or pick another port and remember it for the extension settings.

   ![JabRef Preferences Screenshot](./assets/jabref_settings.png)

### Extension Configuration

The extension a settings page where you can configure the port used to connect to JabRef. Make sure it matches the port configured in JabRef's preferences (default `23119`).

![Extension Settings Screenshot](./assets/extension_settings.png)

### Developer mode install

It is possible to install the most recent developer version instead of the one from the store:
You can load it as an unpacked/temporary extension.

#### Chromium-based browsers (Chrome, Edge, Brave)

1. Open `chrome://extensions/` in the browser.
2. Enable **Developer mode** (toggle top-right).
3. Click **Load unpacked** and select this repository folder (the folder that contains `manifest.json`).

#### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and select the `manifest.json` file from this repository.

Note: Loading the extension this way is temporary in Firefox and will be removed when the browser restarts. For permanent installation you can pack and sign the extension or install from a browser extension store.

## Usage

1. Start JabRef and ensure remote operation is enabled.
2. Open the extension popup from the toolbar.
3. The popup attempts automatic detection on the active tab; if it finds or converts a BibTeX entry it will populate the textbox and attempt to send it to JabRef.
   For example, [the arXiv](http://arxiv.org/list/gr-qc/pastweek?skip=0&show=5) and click the JabRef symbol in the Firefox search bar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>).
   You can also select and run local translators from the manifest via the popup UI.
4. Once the JabRef browser extension has extracted the references and downloaded the associated PDF's, the import window of JabRef opens.

Notes:

- If the popup cannot connect to JabRef, check the configured port in the extension settings and that JabRef is running and listening for HTTP requests.
- Open the popup DevTools (right-click → Inspect) to view logs when debugging translators or connection issues.

## About this Add-On

Internally, this browser extension uses the magic of Zotero's site translators.
As a consequence, most of the credit has to go to the Zotero development team and to the many authors of the [site translators collection](https://github.com/zotero/translators).
Note that this browser extension does not make any changes to the Zotero database and thus both plug-ins coexist happily with each other.

## Contributing to the Development

### Prerequisites

1. Install [Node.js](https://nodejs.org) (e.g., `choco install nodejs`)
2. Install [gulp](https://gulpjs.com/) and [web-ext](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext): `npm install --global gulp-cli web-ext`
3. [Fork the repository](https://help.github.com/articles/fork-a-repo/).
4. Clone the repository **with submodules**: `git clone --recursive git@github.com:{your-username}/JabRef-Browser-Extension.git`
5. Install development dependencies via `npm install`.
6. **After cloning the repo execute the python script `scripts/import_and_patch_translators.py`**
7. JabRef running locally and reachable over HTTP on a configurable port.
8. The popup assumes JabRef is reachable at `http://localhost:<port>` (default port stored in extension settings, default `23119`).
9. Start browser with the add-on activated:
   Firefox: `npm run dev:firefox`
   Chrome: `npm run dev:opera`

### Install (Developer)

1. Open your Chromium-based browser and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.

For Firefox development use `about:debugging#/runtime/this-firefox` and load a temporary add-on.

### Project Structure (high level)

```text
JabRef Browser Extension/
├── popup.html
├── popup.js            # UI, translator loading, HTTP send logic
├── popup.css
├── offscreen.html      # Offscreen context used to run legacy translators
├── offscreen.js
├── sources/            # helpers (ris parser, translator runner, adapters)
├── translators/        # bundled translators + manifest.json
└── README.md
```

### Testing

The extension includes a simple testing system, leveraging the test cases in the translators. To run tests:

```bash
npm install
node test.js <translator-file.js>
```

While it is possible to run tests without a specific translator file, providing one will limit the tests to only those defined in that file.
If a translator does not work as intended the tests can help identify issues (e.g., missing zotero shims).

### Troubleshooting

- If connection fails, open popup DevTools and inspect the console. The popup provides extended HTTP error logging.
- Some legacy translators may need extra small shims; errors will be logged to the popup console and persisted to storage.
- If translators fail to run due to Manifest V3 CSP, the code attempts to run legacy translators in the offscreen runner to avoid unsafe-eval.

### Update dependencies

- `npm outdated` gives an overview of outdated packages ([doc](https://docs.npmjs.com/cli/outdated))
- `npm-upgrade` updates all packages
- `npm install` install updated packages

### Release of new version

- Increase version number in `manifest.json`
- `npm run build`
- Upload to:
  - <https://addons.mozilla.org/en-US/developers/addon/jabref/versions/submit/>
  - <https://chrome.google.com/u/2/webstore/devconsole/26c4c347-9aa1-48d8-8a22-1c79fd3a597e/bifehkofibaamoeaopjglfkddgkijdlh/edit/package>
  - <https://addons.opera.com/developer/upload/>
  - <https://developer.apple.com/app-store-connect/>
- Remove the `key` field in `manifest.json` and build again. Then upload to:
  - <https://partner.microsoft.com/en-us/dashboard/microsoftedge/2045cdc1-808f-43c4-8091-43e2dcaff53d/packages>
