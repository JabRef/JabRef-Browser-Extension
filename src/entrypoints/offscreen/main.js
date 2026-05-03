console.debug("[offscreen] started");

// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

function withDocumentLocation(doc, url) {
  const location = new URL(url);

  return new Proxy(doc, {
    get(target, prop, receiver) {
      if (prop === "location") {
        return location;
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === "location") {
        return {
          configurable: true,
          enumerable: true,
          value: location,
        };
      }

      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
}

function createTranslator(info) {
  if (!info?.path) {
    throw new Error(`Translator ${info?.label ?? "unknown"} is missing a path`);
  }

  const translator = new Zotero.Translator(info);
  translator.file = {
    path: info.path,
  };
  return translator;
}

browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (!msg || msg.type !== "runTranslators") return;
  const { url, translatorsInfo } = msg;
  try {
    const resp = await fetch(url, { credentials: "omit" });
    const html = await resp.text();

    if (!Array.isArray(translatorsInfo) || translatorsInfo.length === 0) {
      throw new Error("No translators provided for offscreen translation");
    }

    const parser = new DOMParser();
    const parsedDocument = withDocumentLocation(parser.parseFromString(html, "text/html"), url);
    const translateEngine = await createTranslateEngine(url);
    const translators = translatorsInfo.map(createTranslator);
    const result = await translateEngine.translate(parsedDocument, translators);

    if (result?.items) {
      await browser.runtime.sendMessage({ type: "offscreenResult", url, items: result.items });
      sendResponse({ ok: true });
    } else {
      await browser.runtime.sendMessage({ type: "offscreenResult", url, items: null });
      sendResponse({ ok: true, result: null });
    }
  } catch (e) {
    await browser.runtime.sendMessage({ type: "offscreenResult", url, error: String(e) });
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});
