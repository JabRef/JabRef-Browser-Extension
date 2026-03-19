console.debug("[contentScript] started");

browser.runtime.onMessage.addListener(async (msg, _sender, _sendResponse) => {
  console.debug("[contentScript] received message: %o", msg);

  await import(browser.runtime.getURL("./sources/setupZotero.js"));
  await import(browser.runtime.getURL("./sources/zotero-translate/src/translator.js"));
  await import(
    browser.runtime.getURL("./sources/zotero-translate/src/translation/translate_item.js")
  );
  Zotero.isInject = true;
  Zotero.COHTTP = {
    request: async (method, url, options = {}) => {
      const response = await browser.runtime.sendMessage({
        type: "COHTTP.request",
        method,
        url,
        options,
      });
      // From upstream: https://github.com/zotero/zotero-connectors/blob/ea060a0aa2fea1267049b5fc880e53aa6c915eeb/src/common/messages.js#L319-L337
      response.getAllResponseHeaders = () => response.responseHeaders;
      response.getResponseHeader = function (name) {
        let match = response.responseHeaders.match(new RegExp(`^${name}: (.*)$`, "mi"));
        return match ? match[1] : null;
      };
      let isArrayBuffer =
        Array.isArray(response.response) && response.responseType === "arraybuffer";
      if (isArrayBuffer) {
        response.response = await unpackArrayBuffer(response.response);
      } else {
        response.responseText = response.response;
      }
      return response;
    },
  };
  Zotero.Translate.ItemSaver.prototype.saveItems = async function (
    jsonItems,
    _attachmentCallback,
    _itemsDoneCallback,
  ) {
    return jsonItems;
  };

  if (!msg) return;
  const { url } = msg;

  // Dynamic import as workaround for Chrome's content script limitations (no module support)
  // see https://stackoverflow.com/a/53033388/873661
  const { createTranslateEngine } = await import(
    browser.runtime.getURL("./sources/translateEngine.js")
  );
  const translateEngine = await createTranslateEngine(url);

  if (msg.type === "detectTranslators") {
    const translatorsInfo = await translateEngine.detect();
    return {
      translatorsInfo,
    };
  }

  if (msg.type !== "runTranslators") return;

  const translators = msg.translatorsInfo.map((info) => {
    const path = info.path;
    if (!path) {
      throw new Error(`Translator ${info.label} is missing a path`);
    }
    const translator = new Zotero.Translator(info);
    // Zotero expects the path to be under `file`
    translator.file = {
      path: path,
    };
    return translator;
  });
  console.debug(
    "Content script received runTranslators message for url %o with translators %o",
    url,
    translators,
  );
  const result = await translateEngine.translate(document, translators);
  console.debug("Content script obtained translation result %o", result);
  await browser.runtime.sendMessage({ type: "offscreenResult", url, items: result.items });
});
