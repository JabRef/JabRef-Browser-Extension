# JabRef Browser Extension

A browser extension that extracts or converts bibliographic metadata from the active page and sends BibTeX entries directly to a running JabRef instance via HTTP POST.

## Key Features

- Direct HTTP POST to JabRef (no external bridge required).
- Automatic detection and conversion: detects embedded BibTeX or RIS blocks, and can run local translators matched via `translators/manifest.json`.
- Legacy Zotero translators: many Zotero legacy translators run in an offscreen runner with small `ZU`/`Zotero` shims.
- Auto-send: when a BibTeX entry is produced, the popup will forward it to JabRef if JabRef is reachable over HTTP.
- Persistent logs: popup console messages are persisted to `chrome.storage.local` to aid debugging.

## Prerequisites

1. After cloning the repo execute the python script `scripts/import_and_patch_translators.py`
2. JabRef running locally and reachable over HTTP on a configurable port.
3. The popup assumes JabRef is reachable at `http://localhost:<port>` (default port stored in extension settings, default 23119).

See [SETUP.md](SETUP.md) for step-by-step instructions for regular users (installing JabRef, enabling JabRef's HTTP/remote listener, and installing the extension).

## Install (Developer)

1. Open your Chromium-based browser and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.

For Firefox development use `about:debugging#/runtime/this-firefox` and load a temporary add-on.

## Usage

1. Start JabRef and ensure remote operation is enabled.
2. Open the extension popup from the toolbar.
3. The popup attempts automatic detection on the active tab; if it finds or converts a BibTeX entry it will populate the textbox and attempt to send it to JabRef.
4. You can also select and run local translators from the manifest via the popup UI.

Notes:
- If the popup cannot connect to JabRef, check the configured port in the extension settings and that JabRef is running and listening for HTTP requests.
- Open the popup DevTools (right-click → Inspect) to view logs when debugging translators or connection issues.

## Project Structure (high level)

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

## Testing

The extension includes a simple testing system, leveraging the test cases in the translators. To run tests:

```bash
npm install
node test.js <translator-file.js>
```

While it is possible to run tests without a specific translator file, providing one will limit the tests to only those defined in that file.
If a translator does not work as intended the tests can help identify issues (e.g., missing zotero shims).

## Troubleshooting

- If connection fails, open popup DevTools and inspect the console. The popup provides extended HTTP error logging.
- Some legacy translators may need extra small shims; errors will be logged to the popup console and persisted to storage.
- If translators fail to run due to Manifest V3 CSP, the code attempts to run legacy translators in the offscreen runner to avoid unsafe-eval.
