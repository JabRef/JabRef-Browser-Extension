import { runTranslatorOnHtml } from './sources/translatorRunner.js';

console.debug('[offscreen] started');

// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'runTranslator') return;
  const { url, translatorPath, translators } = msg;
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    const html = await resp.text();

    const list = Array.isArray(translators) && translators.length ? translators : (translatorPath ? [translatorPath] : []);
    if (!list.length) throw new Error('No translator paths provided');

    let lastError = null;
    for (const t of list) {
      try {
        const result = await runTranslatorOnHtml(t, html, url);
        if (result !== null && typeof result !== 'undefined') {
          await browser.runtime.sendMessage({ type: 'offscreenResult', url, result });
          sendResponse({ ok: true });
          return true;
        }
      } catch (e) {
        lastError = e;
        console.warn('[offscreen] translator failed, trying next:', t, e);
        continue;
      }
    }

    if (lastError) {
      await browser.runtime.sendMessage({ type: 'offscreenResult', url, error: String(lastError) });
      sendResponse({ ok: false, error: String(lastError) });
    } else {
      await browser.runtime.sendMessage({ type: 'offscreenResult', url, result: null });
      sendResponse({ ok: true, result: null });
    }
  } catch (e) {
    await browser.runtime.sendMessage({ type: 'offscreenResult', url, error: String(e) });
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});
