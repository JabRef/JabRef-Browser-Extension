// background.js (sketch)
// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'runTranslator') return;

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
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // Import the runner from the extension bundle.
    const runnerModule = await import(browser.runtime.getURL('sources/translatorRunner.js'));
    const { runTranslatorOnHtml } = runnerModule;

    // Normalize translators list: accept either `translators` array or single `translatorPath`.
    const list = Array.isArray(translators) && translators.length ? translators : (translatorPath ? [translatorPath] : []);
    if (!list.length) throw new Error('No translator paths provided');

    // Run all translator attempts in parallel and resolve with the first
    // successful (non-null/defined) result. We don't attempt to cancel other
    // promises; they will continue running in the background.
    const attempts = list.map((t) => (async () => {
      try {
        const result = await runTranslatorOnHtml(t, html, url);
        if (result !== null && typeof result !== 'undefined') return { result, translator: t };
        throw new Error('No result');
      } catch (e) {
        // Wrap error with translator id for diagnostics
        throw { err: e, translator: t };
      }
    })());

    // Custom Promise.any fallback to collect first fulfilled promise
    const firstFulfilled = (proms) => new Promise((resolve, reject) => {
      let pending = proms.length;
      const errors = [];
      proms.forEach(p => {
        p.then(resolve).catch(e => {
          errors.push(e);
          pending -= 1;
          if (pending === 0) reject(errors);
        });
      });
    });

    try {
      const { result, translator: successful } = await firstFulfilled(attempts);
      await browser.runtime.sendMessage({ type: 'offscreenResult', url, result, translator: successful });
      sendResponse({ ok: true });
    } catch (errors) {
      // All attempts failed
      const last = Array.isArray(errors) && errors.length ? errors[errors.length - 1] : errors;
      const msg = last && last.err ? String(last.err) : String(last || 'All translators failed');
      await browser.runtime.sendMessage({ type: 'offscreenResult', url, error: msg });
      sendResponse({ ok: false, error: msg });
    }
  } catch (e) {
    await browser.runtime.sendMessage({ type: 'offscreenResult', url, error: String(e) });
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});