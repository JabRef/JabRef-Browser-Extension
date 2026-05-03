import "./setupZoteroPlain.js";
import "../../sources/zotero-translate/src/promise.js";
import "../../sources/zotero-translate/src/translation/translate.js";
import "./sandboxManager.js";
// See zotero-translate/example/index.html for the following list of imports
import "../../sources/zotero-utilities/openurl.js";
import "../../sources/zotero-utilities/date.js";
import "../../sources/zotero-utilities/utilities.js";
import "../../sources/zotero-utilities/utilities_item.js";
import "../../sources/zotero-utilities/schema.js";
import { ZOTERO_TYPE_SCHEMA } from "../../sources/zotero-utilities/resource/zoteroTypeSchemaData.js";
import "../../sources/zotero-utilities/cachedTypes.js";
import "../../sources/zotero-translate/src/utilities_translate.js";
import "../../sources/zotero-translate/src/http.js";
import "./http.js";
import "./webRequestIntercept.js";
import dateFormats from "../../sources/zotero-utilities/resource/dateFormats.json";

Zotero.setTypeSchema(ZOTERO_TYPE_SCHEMA);
if (browser.webRequest) {
  // webRequest is not available some contexts, so check before initializing
  Zotero.WebRequestIntercept.init();
}

Zotero.Date.init(dateFormats);
