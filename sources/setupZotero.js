import "./setupZoteroPlain.js";
import "./zotero-translate/src/promise.js";
import "./zotero-translate/src/translation/translate.js";
import "./sandboxManager.js";
//import "./zotero-translate/src/translation/sandboxManager.js";
// See zotero-translate/example/index.html for the following list of imports
import "./zotero-utilities/openurl.js";
import "./zotero-utilities/date.js";
import "./zotero-utilities/xregexp-all.js";
import "./zotero-utilities/xregexp-unicode-zotero.js";
import "./zotero-utilities/utilities.js";
import "./zotero-utilities/utilities_item.js";
import "./zotero-utilities/schema.js";
import { ZOTERO_TYPE_SCHEMA } from "./zotero-utilities/resource/zoteroTypeSchemaData.js";
import "./zotero-utilities/cachedTypes.js";
import "./zotero-translate/src/utilities_translate.js";
import "./zotero-translate/src/http.js";
import "./http.js";
import "./webRequestIntercept.js";

Zotero.setTypeSchema(ZOTERO_TYPE_SCHEMA);
if (browser.webRequest) {
  // webRequest is not available some contexts, so check before initializing
  Zotero.WebRequestIntercept.init();
}
