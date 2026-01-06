// Simple translator runner that can execute small translators against
// a provided DOM string. Translators should export `detect(doc)` and
// `translate(doc)` functions.

export async function runTranslatorOnHtml(translatorModuleOrPath, htmlString) {
  console.debug('[translatorRunner] runTranslatorOnHtml start');
  let module;
  try {
    if (typeof translatorModuleOrPath === 'string') {
      console.debug('[translatorRunner] importing module', translatorModuleOrPath);
      module = await import(translatorModuleOrPath);
    } else {
      module = translatorModuleOrPath;
      console.debug('[translatorRunner] using provided module object');
    }

    // create a DOM from the html string
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    console.debug('[translatorRunner] created DOM for HTML (length:', (htmlString || '').length, ')');

    if (typeof module.detect === 'function') {
      let ok;
      try {
        ok = module.detect(doc);
        console.debug('[translatorRunner] detect() returned', ok);
      } catch (e) {
        console.error('[translatorRunner] detect() threw', e);
        throw e;
      }
      if (!ok) throw new Error('Translator.detect returned false');
    }

    if (typeof module.translate !== 'function') throw new Error('Translator missing translate()');

    // run translate (allow async)
    let result;
    try {
      result = await module.translate(doc);
      console.debug('[translatorRunner] translate() completed; result length:', result ? (result.length || 0) : 0);
    } catch (e) {
      console.error('[translatorRunner] translate() threw', e);
      throw e;
    }

    return result;
  } finally {
    console.debug('[translatorRunner] runTranslatorOnHtml end');
  }
}
