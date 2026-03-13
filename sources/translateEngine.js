import { TranslateWeb } from "./translateWeb.js";
import "./setupZotero.js";
import "./zotero-translate/src/translator.js";
//import "./zotero-translate/src/translators.js";

export async function createTranslateEngine(location) {
  return {
    detect: async () => {
      // Upstream: https://github.com/zotero/zotero-connectors/blob/ea060a0aa2fea1267049b5fc880e53aa6c915eeb/src/common/inject/pageSaving.js#L113-L114
      const translate = await _initTranslate();
      return await TranslateWeb.detect({ translate, location });
    },
    translate: async (doc, translators) => {
      // Upstream: https://github.com/zotero/zotero-connectors/blob/ea060a0aa2fea1267049b5fc880e53aa6c915eeb/src/common/inject/pageSaving.js#L287-L291
      if (!translators || !translators.length) {
        throw new Error("No translators provided for translation");
      }

      const translate = await _initTranslate(translators[0].itemType);
      const onSelect = (args) => {
        console.log("Translator select handler called with args %o", args);
      };
      const onItemSaving = (args) => {
        console.log("Translator itemSaving handler called with args %o", args);
      };
      const onTranslatorFallback = (args) => {
        console.log("Translator fallback handler called with args %o", args);
      };
      return await TranslateWeb.translate({
        doc,
        translate,
        location: doc.location.href,
        translators: translators.slice(),
        onSelect,
        onItemSaving,
        onTranslatorFallback,
      });
    },
  };
}

/**
 * Implements sources\zotero-translate\src\translators.js interface using the bundled translators.
 */
class TranslatorProvider {
  constructor() {
    this._initialized = false;
    this._cache = { import: [], export: [], web: [], search: [] };
    this._byId = new Map();
  }

  async _ensure() {
    if (this._initialized) return;
    const manifestUrl = browser.runtime.getURL("../translators/manifest.json");
    const manifestResponse = await fetch(manifestUrl);
    const manifest = await manifestResponse.json();

    const cache = { import: [], export: [], web: [], search: [] };
    for (const info of manifest) {
      const translator = new Zotero.Translator(info);
      // Zotero expects the path to be under `file`
      translator.file = {
        path: translator.path,
      };
      const typeKeys = this._typeKey(translator.translatorType);
      for (const typeKey of typeKeys) {
        cache[typeKey].push(translator);
      }
      this._byId.set(translator.translatorID, translator);
    }
    // Sort by priority
    for (const type in cache) {
      cache[type].sort((a, b) => a.priority - b.priority);
    }

    this._cache = cache;
    this._initialized = true;
  }

  _typeKey(type) {
    switch (type) {
      case 1:
        return ["import"];
      case 2:
        return ["export"];
      case 3:
        return ["import", "export"];
      case 4:
        return ["web"];
      case 6:
        return ["export", "web"];
      case 8:
        return ["search"];
      case 12:
        return ["web", "search"];
      default:
        throw new Error(`Unknown translator type ${type}`);
    }
  }

  async get(id) {
    await this._ensure();
    return this._byId.get(id) || null;
  }

  async getAllForType(type) {
    await this._ensure();
    return (this._cache[type] || []).slice();
  }

  /*
   Upstream: https://github.com/zotero/zotero-connectors/blob/dac609fb9dea1e98dbcc73387b05f7af5ef7814d/src/common/translators.js#L381.
   With the following changes:
    - Don't use `webRegex.all` (which is set by `targetAll` in the translator) because it is actually not used (see https://github.com/zotero/translators/issues/3254#issuecomment-1972914000)
  */
  async getWebTranslatorsForLocation(URI, rootURI) {
    const matches = [];
    for (const translator of await this.getAllForType("web")) {
      const target = translator?.target;
      if (!target && !translator.runInBrowser) {
        // Don't attempt to use generic translators that can't be run in this browser
        continue;
      }
      if (!target) {
        // No target: match all URLs (generic translator)
        matches.push(translator);
        continue;
      }
      try {
        const urlRegexp = new RegExp(target, "i");
        if (urlRegexp.test(URI)) matches.push(translator);
      } catch (e) {
        // ignore invalid regex patterns
        console.warn("Invalid target regex", target, e);
      }
    }
    return [matches];
  }

  /*
   Upstream: https://github.com/zotero/zotero-connectors/blob/ea060a0aa2fea1267049b5fc880e53aa6c915eeb/src/common/translators.js#L322
  */
  async getCodeForTranslator(translator) {
    if (translator.code) return translator.code;
    if (translator.path) {
      const url = browser.runtime.getURL(translator.path);
      const response = await fetch(url);
      const code = await response.text();
      translator.code = code;
      return code;
    }
    throw new Error(
      `TranslatorProvider.getCodeForTranslator: translator ${translator.label} has no code`,
    );
  }
}

async function _initTranslate(itemType = null) {
  // Upstream: https://github.com/zotero/zotero-connectors/blob/ea060a0aa2fea1267049b5fc880e53aa6c915eeb/src/common/inject/pageSaving.js#L63
  let translate;
  if (browser.offscreen /*Zotero.isManifestV3*/) {
    try {
      translate = await Zotero.VirtualOffscreenTranslate.create();
    } catch (e) {
      Zotero.logError(
        new Error(`Inject: Initializing translate failed at ${document.location.href}`),
      );
      Zotero.logError(e);
      throw e;
    }
  } else {
    translate = new Zotero.Translate.Web();
    translate._translatorProvider = new TranslatorProvider();
  }
  translate.setHandler("pageModified", () => {
    Zotero.Messaging.sendMessage("pageModified", true);
  });
  // Async in MV3
  if (Zotero.isManifestV3) {
    await translate.setDocument(document, itemType === "multiple");
  } else {
    translate.setDocument(document);
  }
  return translate;
}
