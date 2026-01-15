# Setup — JabRef and JabRef-Connector Extension

This guide helps a regular user install JabRef, enable its HTTP/remote listener so it can accept bibliographic entries, and install the browser extension from this repository.

If you are a developer installing the extension for development, see `README.md` for developer installation steps. This guide is for everyday users who want to connect their browser directly to a running JabRef instance.

## Install JabRef

- Download JabRef from the official site: https://www.jabref.org/ and choose the installer or application bundle appropriate for your OS.
- Install and start JabRef using the normal installer or by running the downloaded application bundle.

Note: Recent JabRef releases are distributed with the required Java runtime. If your distribution does not include a bundled runtime you may need a recent Java (Java 11+) available on your system.

## Enable JabRef's HTTP / remote listener

The extension delivers BibTeX entries to a running JabRef instance using an HTTP POST. For that to work you must enable JabRef's remote/HTTP listener and configure the port.

- In JabRef open the application's Preferences `File -> Preferences`.
- Enable the listener as shown in the screenshot. Leave the default port, `23119`, or pick another port and remember it for the extension settings.

![JabRef Preferences Screenshot](./docs/jabref_settings.png)

## Install the browser extension

### Browser extension stores

**TODO**: Add links to browser extension stores when published.

### Developer mode install

For a local install of this extension (not from the browser store) you can load it as an unpacked/temporary extension.

- Chromium-based browsers (Chrome, Edge, Brave):
  1. Open `chrome://extensions/` in the browser.
  2. Enable **Developer mode** (toggle top-right).
  3. Click **Load unpacked** and select this repository folder (the folder that contains `manifest.json`).

- Firefox:
  1. Open `about:debugging#/runtime/this-firefox`.
 2. Click **Load Temporary Add-on...** and select the `manifest.json` file from this repository.

Note: Loading the extension this way is temporary in Firefox and will be removed when the browser restarts. For permanent installation you can pack and sign the extension or install from a browser extension store.

## Configure the extension

The extension a settings page where you can configure the port used to connect to JabRef. Make sure it matches the port configured in JabRef's preferences (default `23119`).

![Extension Settings Screenshot](./docs/extension_settings.png)