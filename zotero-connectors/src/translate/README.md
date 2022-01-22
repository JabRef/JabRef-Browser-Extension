# Zotero Translate

This repository contains the Zotero translation architecture code responsible for 
parsing Zotero translators and running them on live and static web pages to retrieve
Zotero items.

A consumer of this repository needs to implement the following interfaces:

- `Zotero.Translators` found in `translators.js`
- `Zotero.HTTP` found in `http.js`
- `Zotero.Translate.ItemSaver` found in `translation/translate_item.js`

You also need to:
- Call `Zotero.Schema.init(data)` with Zotero `schema.json`.
- Call `Zotero.Date.init(json)` with the JSON from `utilities/resource/dateFormats.json`
- If running in a ModuleJS environment (e.g. Node.js) call `require('../utilities/cachedTypes').setTypeSchema(typeSchema)`
with the result of `utilities/resource/zoteroTypeSchemaData.js`.

Please bundle translators and Zotero schema with the translation architecture.
Do not load them from a remote server.

You may also want to reimplement or modify:

- `Zotero.Repo` found in `repo.js` to set up periodic translator update retrieval
- `Zotero.Debug` found in `debug.js` to customize debug logging
- `Zotero` and `Zotero.Prefs` found in `zotero.js` to set up the environment and 
long-term preference storage
- `Zotero.Translate.ItemGetter` found in `translation/translate_item.js` for export
translation
- `Zotero.Translate.SandboxManager` found in `translation/sandboxManager.js` for
a tighter Sandbox environment if available on your the platform

### Example

See `example/index.html` for file loading order.

To run the example: 
```bash
$ git submodule update --init
$ google-chrome --disable-web-security --user-data-dir=/tmp/chromeTemvar
```

Open `example/index.html` in the CORS ignoring Google Chrome