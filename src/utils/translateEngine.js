import { TranslateWeb } from "./translateWeb.js";
import "./setupZotero.js";
import "../../sources/zotero-translate/src/translator.js";
import "../../sources/zotero-translate/src/translation/translate_item.js";
import TranslatorsManifest from "../../translators/manifest.json";

const EXPORT_TRANSLATORS = {
  bibtex: "9cb70025-a888-4a29-a210-93ec52da40d4",
  biblatex: "b6e39b57-8942-4d11-8259-342c46ce395f",
};

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

export async function exportItems(items, mode = "bibtex") {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("No items provided for export");
  }

  const translatorId = EXPORT_TRANSLATORS[mode] || EXPORT_TRANSLATORS.bibtex;
  const translate = new Zotero.Translate.Export();
  translate._translatorProvider = new TranslatorProvider();
  translate.setItems(items);
  translate.setTranslator(translatorId);
  await translate.translate();
  return translate.string;
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

    const cache = { import: [], export: [], web: [], search: [] };
    for (const info of TranslatorsManifest) {
      const path = info.path;
      if (!path) {
        throw new Error(`Translator ${info.label} is missing a path`);
      }
      const translator = new Zotero.Translator(info);
      // Zotero expects the path to be under `file`
      translator.file = {
        path: path,
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
    if (translator.file?.path) {
      const url = browser.runtime.getURL(translator.file.path);
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
