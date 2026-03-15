import { exportItems } from "./sources/translateEngine.js";

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

  await initTranslateEngine(tab)
  const response = await browser.tabs.sendMessage(tab.id, {
    type: "detectTranslators",
    url: tab.url,
  });
  const translatorsInfo = response?.translatorsInfo || [];
  onTranslators(translatorsInfo, tab.id);
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

function openErrorPage(message, details = "", stacktrace = "") {
  browser.tabs.create({
    url:
      "/data/error.html?message=" +
      encodeURIComponent(message) +
      "&details=" +
      encodeURIComponent(details ?? "") +
      "&stacktrace=" +
      encodeURIComponent(stacktrace ?? ""),
  });
}

async function getBaseUrl() {
  const settings = await browser.storage.sync.get({ httpPort: 23119 });
  return `http://localhost:${settings.httpPort}/`;
}

async function sendBibEntryHttp(bibtex) {
  const baseUrl = await getBaseUrl();

  const health = await fetch(baseUrl, { method: "GET", cache: "no-store" });
  if (!(health.ok || health.status === 404)) {
    throw new Error(`JabRef HTTP endpoint unavailable (${health.status})`);
  }

  const resp = await fetch(baseUrl + "libraries/current/entries", {
    method: "POST",
    headers: { "Content-Type": "application/x-bibtex" },
    body: bibtex,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}${body ? `: ${body}` : ""}`);
  }
}

async function sendBibEntryNative(bibtex) {
  const response = await browser.runtime.sendNativeMessage("org.jabref.jabref", {
    text: bibtex,
  });
  if (response?.message === "ok") {
    return;
  }

  if (response?.message === "error") {
    console.error(
      `JabRef: Error connecting to JabRef: '${response.output}' at '${response.stacktrace}'`,
    );
    handleError(response.output, "", response.stacktrace);
  }

  console.error(
    `JabRef: Error connecting to JabRef: '${response.message}' with details '${response.output}' at '${response.stacktrace}'`,
  );
  handleError(response.message, response.output, response.stacktrace);
}

async function sendBibTexToJabRef(bibtex) {
  await browser.runtime.sendMessage({ onSendToJabRef: "sendToJabRefStarted" });
  console.log("JabRef: Send BibTeX to JabRef: %o", bibtex);

  try {
    await sendBibEntryHttp(bibtex);
    await browser.runtime.sendMessage({ popupClose: "close" });
    return;
  } catch (httpError) {
    console.warn("JabRef: HTTP send failed, falling back to native messaging", httpError);
  }

  await sendBibEntryNative(bibtex);
  await browser.runtime.sendMessage({ popupClose: "close" });
}

function saveAsWebpage(tab) {
  var title = tab.title;
  var url = tab.url;
  var date = new Date().toISOString();

  // Construct a manual Bibtex Entry for the webpage
  var bibtexString = `@misc{,\
		title={${title}},\
		url = {${url}},\
		urlDate={${date}},\
		}`;
  sendBibTexToJabRef(bibtexString);
}

function savePdf(tab) {
  var title = tab.title.replace(".pdf", "");
  var url = tab.url;
  var urlEscaped = tab.url.replace(":", "\\:");
  var date = new Date().toISOString();

  // Construct a manual Bibtex Entry for the PDF
  var bibtexString = `@misc{,\
		title={${title}},\
		file={:${urlEscaped}:PDF},\
		url = {${url}},\
		urlDate={${date}},\
		}`;
  sendBibTexToJabRef(bibtexString);
}

/*
    Is called after lookForTranslators found matching translators.
    We need to hide or show the page action accordingly.
*/
function onTranslators(translatorsInfo, tabId) {
  if (!translatorsInfo || translatorsInfo.length === 0) {
    console.log(`JabRef: Found no suitable translators for tab ${tabId}`);
    tabInfo.set(tabId, { ...tabInfo.get(tabId), translatorsInfo });
    browser.pageAction.show(tabId);
    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Import simple website reference into JabRef",
    });
  } else {
    console.log(`JabRef: Found translators %o for tab ${tabId}`, translatorsInfo);
    tabInfo.set(tabId, { ...tabInfo.get(tabId), translatorsInfo });
    browser.pageAction.show(tabId);
    browser.pageAction.setTitle({
      tabId: tabId,
      title: "Import references into JabRef using " + translatorsInfo[0].label,
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

async function initTranslateEngine(tab) {
  // The basic issue is that the background script doesn't have access
  // to the DOM.
  // Depending on the browser, we run the translators thus in:
  // - the offscreen page (Chrome),
  // - the content script (Firefox).
  if (browser.offscreen) {
    await initOffscreenDocument();
  } else {
    await initContentScript(tab.id);
  }
}

async function onPopupOpened(tab, info) {
  if (!info.translatorsInfo.length) throw new Error("No translator paths provided");

  await browser.tabs.sendMessage(tab.id, {
    type: "runTranslators",
    url: tab.url,
    translatorsInfo: info.translatorsInfo,
  });
}

async function getConversionMode() {
  const cfg = await browser.storage.sync.get({ exportMode: "bibtex" });
  return cfg.exportMode || "bibtex";
}

async function prepareForExport(items) {
  const { takeSnapshots } = await browser.storage.sync.get({ takeSnapshots: false });

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    for (var j = 0; j < item.attachments.length; j++) {
      var attachment = item.attachments[j];

      var isLink =
        attachment.mimeType === "text/html" || attachment.mimeType === "application/xhtml+xml";
      if (isLink && attachment.snapshot !== false) {
        // Snapshot
        if (takeSnapshots && attachment.url) {
          attachment.localPath = attachment.url;
        } else {
          // Ignore
        }
      } else {
        // Normal file
        // Pretend we downloaded the file since otherwise it is not exported
        if (attachment.url) {
          attachment.localPath = attachment.url;
        }
      }
    }

    // Fix date string
    if (item.accessDate) {
      item.accessDate = new Date().toISOString();
    }
  }
}

browser.runtime.onMessage.addListener(async function (message, sender, _sendResponse) {
  try {
    if (message.type === "popupOpened") {
      // The popup opened, i.e. the user clicked on the page action button
      console.log("JabRef: Popup opened confirmed");
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      var tab = tabs[0];
      var info = tabInfo.get(tab.id);

      if (info && info.isPDF) {
        console.log("JabRef: Export PDF in tab %o", JSON.parse(JSON.stringify(tab)));
        savePdf(tab);
      } else if (!info.translatorsInfo) {
        console.log("JabRef: No translators, simple saving %o", JSON.parse(JSON.stringify(tab)));
        saveAsWebpage(tab);
      } else {
        console.log("JabRef: Start translation for tab %o", JSON.parse(JSON.stringify(tab)));
        await onPopupOpened(tab, info);
      }

      return { ok: true };
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
    } else if (message.type === "offscreenResult") {
      console.debug("JabRef: offscreenResult in background.js: %o", message);
      if (message.error) {
        console.error("JabRef: Error in offscreen translator execution", message.error);
        return;
      }
      const { url, items } = message;
      const conversionMode = await getConversionMode();
      await prepareForExport(items);
      await browser.runtime.sendMessage({ onConvertToBibtex: "convertStarted" });
      const bib = await exportItems(items, conversionMode);
      console.debug("JabRef: Exported BibTeX: %o", bib);
      await sendBibTexToJabRef(bib);
    } else if (message.eval) {
      console.debug("JabRef: eval in background.js: %o", JSON.parse(JSON.stringify(message.eval)));
      return evalInTab(sender.tab.id, message.eval);
    } else if (message[0] === "Debug.log") {
      console.log(message[1]);
    } else if (message[0] === "Errors.log") {
      console.log(message[1]);
    } else {
      console.log(
        "JabRef: other message in background.js: %o",
        JSON.parse(JSON.stringify(message)),
      );
    }
  } catch (e) {
    console.error("JabRef: Error handling message in background.js", e);
    throw e;
  }
});
