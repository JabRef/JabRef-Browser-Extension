# Zotero Utilities

Zotero utility code common across various codebases such as the Zotero client,
Zotero translation architecture and others.

Item utility functions require:
- Calling `Zotero.Schema.init(json)` with the JSON from `schema.json` from Zotero schema repo
- Calling `Zotero.Date.init(json)` with the JSON from `resource/dateFormats.json`
- Loading `resource/zoteroTypeSchemaData.js` before `cachedTypes.js` or in Node.js running
  ```js
    let CachedTypes = require('./cachedTypes')
    CachedTypes.setTypeSchema(require('./resource/zoteroTypeSchemaData'))
  ```
- Implementing `Zotero.localeCompare()`; a simple implementation would be
  ```js
    let collator = new Intl.Collator(['en-US'], {
      numeric: true,
      sensitivity: 'base'
    });
    Zotero.localeCompare = (a, b) => collator.compare(a, b);
  ```

Please bundle the [Zotero schema](https://github.com/zotero/zotero-schema) file with your repository, do not load it remotely.

To run tests:

```bash
git clone --recursive https://github.com/zotero/utilities.git
cd utilities
npm i
npm test
```
