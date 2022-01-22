# Zotero Utilities

Zotero utility code common across various codebases such as the Zotero client,
Zotero translation architecture and others.

Item utility functions require:
- Calling `Zotero.Schema.init(json)` with the JSON from `schema.json` from Zotero schema repo
- Calling `Zotero.Date.init(json)` with the JSON from `resource/dateFormats.json`
- Loading `resource/zoteroTypeSchemaData.js` before `cachedTypes.js` or in Node.js running
  ```
    let CachedTypes = require('./cachedTypes')
    CachedTypes.setTypeSchema(require('./resource/zoteroTypeSchemaData'))
  ```

Please bundle the [Zotero schema](https://github.com/zotero/zotero-schema) file with your repository, do not load it remotely.