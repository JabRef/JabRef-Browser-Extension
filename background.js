import { createTranslateEngine } from "./sources/translateEngine.js";

// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

var tabInfo = new Map();

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
    .then((_result) => {
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
*/
async function lookForTranslators(tab) {
  console.log("JabRef: Searching for translators for %o", tab);
  const engine = await createTranslateEngine(tab.url);
  const translators = await engine.detect();
  onTranslators(translators, tab.id);
}

async function evalInTab(tabsId, code) {
  try {
    result = await browser.tabs.executeScript(tabsId, {
      code: code,
    });
    console.log(`JabRef: code executed with result ${result}`);
    return result;
  } catch (error) {
    console.log(`JabRef: Error executing script: ${error}`);
  }
}

function saveAsWebpage(tab) {
  var title = tab.title;
  var url = tab.url;
  var date = new Date().toISODate();

  // Construct a manual Bibtex Entry for the webpage
  var bibtexString = `@misc{,\
		title={${title}},\
		url = {${url}},\
		urlDate={${date}},\
		}`;
  Zotero.Connector.sendBibTexToJabRef(bibtexString);
}

function savePdf(tab) {
  var title = tab.title.replace(".pdf", "");
  var url = tab.url;
  var urlEscaped = tab.url.replace(":", "\\:");
  var date = new Date().toISODate();

  // Construct a manual Bibtex Entry for the PDF
  var bibtexString = `@misc{,\
		title={${title}},\
		file={:${urlEscaped}:PDF},\
		url = {${url}},\
		urlDate={${date}},\
		}`;
  Zotero.Connector.sendBibTexToJabRef(bibtexString);
}

/*
    Is called after lookForTranslators found matching translators.
    We need to hide or show the page action accordingly.
*/
function onTranslators(translators, tabId) {
  if (!translators || translators.length === 0) {
    console.log(`JabRef: Found no suitable translators for tab ${tabId}`);
    tabInfo.set(tabId, { ...tabInfo.get(tabId), translators });
    browser.pageAction.show(tabId);
    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Import simple website reference into JabRef",
    });
  } else {
    console.log(`JabRef: Found translators %o for tab ${tabId}`, translators);
    tabInfo.set(tabId, { ...tabInfo.get(tabId), translators });
    browser.pageAction.show(tabId);
    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Import references into JabRef using " + translators[0].label,
    });
  }
}

async function initOffscreenDocument() {
  if (!browser.offscreen) return false;
  const has = await browser.offscreen.hasDocument();
  if (has) return true;
  try {
    await browser.offscreen.createDocument({
      url: browser.runtime.getURL("offscreen.html"),
      reasons: ["DOM_PARSER"],
      justification: "Scraping the document for bibliographic data",
    });
    return true;
  } catch (e) {
    console.warn("Failed to create offscreen document", e);
    return false;
  }
}

async function initContentScript(tabId) {
  return await browser.scripting.executeScript({
    target: { tabId },
    files: ["sources/contentScript.js"],
  });
}

async function onPopupOpened(tab, info, sendResponse) {
  if (!info.translators.length) throw new Error("No translator paths provided");

  // If offscreen is available (Chrome), forward the request so the offscreen
  // document runs the translator. If not (Firefox), run the translator
  // from the content script (which has a DOM available, unlike the background page).
  try {
    if (browser.offscreen) {
      await initOffscreenDocument();
    } else {
      await initContentScript(tab.id);
    }
    await browser.tabs.sendMessage(tab.id, {
      type: "runTranslators",
      url: tab.url,
      translatorsInfo: info.translators.map((translator) => {
        // We cannot send the full translator object as it contains functions
        return {
          translatorID: translator.translatorID,
          translatorType: translator.translatorType,
          label: translator.label,
          creator: translator.creator,
          target: translator.target,
          priority: translator.priority,
          path: translator.path,
          file: translator.file,
          lastUpdated: translator.lastUpdated,
        };
      }),
    });
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
    console.log(`JabRef: Failed to run translators for tab ${tab.id}: ${e}`);
    return;
  }
  return;
}

browser.runtime.onMessage.addListener(async function (message, sender, sendResponse) {
  if (message.type === "popupOpened") {
    // The popup opened, i.e. the user clicked on the page action button
    console.log("JabRef: Popup opened confirmed");

    browser.tabs
      .query({
        active: true,
        currentWindow: true,
      })
      .then(async (tabs) => {
        var tab = tabs[0];
        var info = tabInfo.get(tab.id);

        if (info && info.isPDF) {
          console.log("JabRef: Export PDF in tab %o", JSON.parse(JSON.stringify(tab)));
          savePdf(tab);
        } else if (!info.translators) {
          console.log("JabRef: No translators, simple saving %o", JSON.parse(JSON.stringify(tab)));
          saveAsWebpage(tab);
        } else {
          console.log("JabRef: Start translation for tab %o", JSON.parse(JSON.stringify(tab)));
          await onPopupOpened(tab, info, sendResponse);
        }
      });
  } else if (message.type === "COHTTP.request") {
    const { method, url, options } = message;
    console.debug(`JabRef: COHTTP request in background.js: ${method} ${url} %o`, options);
    const xhr = await Zotero.HTTP.request(method, url, options);
    // From upstream: https://github.com/zotero/zotero-connectors/blob/ea060a0aa2fea1267049b5fc880e53aa6c915eeb/src/common/messages.js#L302-L316
    let result = {
      response: xhr.response,
      responseType: xhr.responseType,
      status: xhr.status,
      statusText: xhr.statusText,
      responseHeaders: xhr.getAllResponseHeaders(),
      responseURL: xhr.responseURL,
    };
    return result;
  } else if (message.eval) {
    console.debug("JabRef: eval in background.js: %o", JSON.parse(JSON.stringify(message.eval)));
    return evalInTab(sender.tab.id, message.eval);
  } else if (message[0] === "Debug.log") {
    console.log(message[1]);
  } else if (message[0] === "Errors.log") {
    console.log(message[1]);
  } else {
    console.log("JabRef: other message in background.js: %o", JSON.parse(JSON.stringify(message)));
  }
});
