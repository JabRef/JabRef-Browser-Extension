// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

this.tabInfo = new Map();

/*
    Show/hide import button for all tabs (when add-on is loaded).
*/
browser.tabs.query({}).then((tabs) => {
  console.log("JabRef: Inject into open tabs %o", tabs);
  for (let tab of tabs) {
    installInTab(tab);
  }
});

/*
    Show/hide import button for the currently active tab, whenever the user navigates.
*/
browser.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
  if (!changeInfo.url) {
    return;
  }
  browser.tabs
    .query({
      active: true,
      currentWindow: true,
    })
    .then((tabs) => {
      if (tabId === tabs[0].id) {
        var tab = tabs[0];
        installInTab(tab);
      }
    });
});

/*
    Remove translator information when tab is closed.
*/
browser.tabs.onRemoved.addListener((tabId, _removeInfo) => {
  tabInfo.delete(tabId);
});

/*
    Disable add-on for special browser pages
*/
function isDisabledForURL(url) {
  return (
    url.includes("chrome://") ||
    url.includes("about:") ||
    (url.includes("-extension://") && !url.includes("/test/"))
  );
}

function getDocumentContentType() {
  return document.contentType;
}

/*
    Searches for translators for the given tab and shows/hides the import button accordingly.

    Zotero.Connector_Browser.onPageLoad is the original function from the Zotero Connector,
    see https://github.com/zotero/zotero-connectors/blob/dac609fb9dea1e98dbcc73387b05f7af5ef7814d/src/browserExt/background.js#L968.
*/
function installInTab(tab) {
  if (isDisabledForURL(tab.url)) {
    return;
  }

  // Reset tab info
  tabInfo.delete(tab.id);

  // We cannot inject content scripts into PDF: https://bugzilla.mozilla.org/show_bug.cgi?id=1454760
  // Thus, our detection algorithm silently fails in this case
  // Try to detect these situations by calling a content script; this fails
  browser.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: getDocumentContentType,
    })
    .then((result) => {
      lookForTranslators(tab);
      tabInfo.set(tab.id, { isPDF: false });
    })
    .catch((error) => {
      console.debug(`JabRef: Error calling content script: ${error}`);

      // Assume a PDF is displayed in this tab
      browser.pageAction.show(tab.id);
      browser.pageAction.setTitle({
        tabId: tab.id,
        title: "Import references into JabRef as PDF",
      });
      tabInfo.set(tab.id, { isPDF: true });
    });
}

/*
    Looks for potential translators for the given tab.

    Zotero.Connector_Browser.lookForTranslators is the original function from the Zotero Connector,
    see https://github.com/zotero/zotero-connectors/blob/dac609fb9dea1e98dbcc73387b05f7af5ef7814d/src/common/translators.js#L381.
    With the following changes:
    - Don't use `webRegex.all` (which is set by `targetAll` in the translator) because it is actually not used (see https://github.com/zotero/translators/issues/3254#issuecomment-1972914000)
*/
async function lookForTranslators(tab) {
  console.log("JabRef: Searching for translators for %o", tab);

  const translatorsManifestUrl = browser.runtime.getURL("translators/manifest.json");
  const translatorsManifestResponse = await fetch(translatorsManifestUrl);
  const translatorsManifest = await translatorsManifestResponse.json();

  const matches = [];
  for (const translator of translatorsManifest) {
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
      if (urlRegexp.test(tab.url)) matches.push(translator);
    } catch (e) {
      // ignore invalid regex patterns
      console.warn("Invalid target regex", target, e);
    }
  }

  onTranslators(matches, tab.id);
}
/*
    Is called after lookForTranslators found matching translators.
    We need to hide or show the page action accordingly.
*/
onTranslators = function (translators, tabId) {
  if (translators.length === 0) {
    console.log(`JabRef: Found no suitable translators for tab ${tabId}`);
    tabInfo.set(tabId, { ...tabInfo.get(tabId), hasTranslator: false });
    browser.pageAction.show(tabId);
    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Import simple website reference into JabRef",
    });
  } else {
    console.log(`JabRef: Found translators %o for tab ${tabId}`, translators);
    tabInfo.set(tabId, { ...tabInfo.get(tabId), hasTranslator: true });
    browser.pageAction.show(tabId);
    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Import references into JabRef using " + translators[0].label,
    });
  }
};

browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (!msg || msg.type !== "runTranslator") return;

  const { translatorPath, translators, url } = msg;

  // If offscreen is available (Chrome), forward the request so the offscreen
  // document runs the translator. If not (Firefox), run the translator
  // directly from the background page which has a DOM.
  if (browser.offscreen) {
    try {
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }

  // Firefox / no offscreen: fetch page HTML and run translator here.
  try {
    const resp = await fetch(url, { credentials: "omit" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // Import the runner from the extension bundle.
    const runnerModule = await import(browser.runtime.getURL("sources/translatorRunner.js"));
    const { runTranslatorOnHtml } = runnerModule;

    // Normalize translators list: accept either `translators` array or single `translatorPath`.
    const list =
      Array.isArray(translators) && translators.length
        ? translators
        : translatorPath
          ? [translatorPath]
          : [];
    if (!list.length) throw new Error("No translator paths provided");

    // Run all translator attempts in parallel and resolve with the first
    // successful (non-null/defined) result. We don't attempt to cancel other
    // promises; they will continue running in the background.
    const attempts = list.map((t) =>
      (async () => {
        try {
          const result = await runTranslatorOnHtml(t, html, url);
          if (result !== null && typeof result !== "undefined") return { result, translator: t };
          throw new Error("No result");
        } catch (e) {
          // Wrap error with translator id for diagnostics
          throw { err: e, translator: t };
        }
      })(),
    );

    // Custom Promise.any fallback to collect first fulfilled promise
    const firstFulfilled = (proms) =>
      new Promise((resolve, reject) => {
        let pending = proms.length;
        const errors = [];
        proms.forEach((p) => {
          p.then(resolve).catch((e) => {
            errors.push(e);
            pending -= 1;
            if (pending === 0) reject(errors);
          });
        });
      });

    try {
      const { result, translator: successful } = await firstFulfilled(attempts);
      await browser.runtime.sendMessage({
        type: "offscreenResult",
        url,
        result,
        translator: successful,
      });
      sendResponse({ ok: true });
    } catch (errors) {
      // All attempts failed
      const last = Array.isArray(errors) && errors.length ? errors[errors.length - 1] : errors;
      const msg = last && last.err ? String(last.err) : String(last || "All translators failed");
      await browser.runtime.sendMessage({ type: "offscreenResult", url, error: msg });
      sendResponse({ ok: false, error: msg });
    }
  } catch (e) {
    await browser.runtime.sendMessage({ type: "offscreenResult", url, error: String(e) });
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});
