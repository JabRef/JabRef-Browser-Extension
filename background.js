// Background service worker: perform cross-origin fetches on behalf of popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'fetch') {
    const url = message.url;
    fetch(url)
      .then(async (resp) => {
        const text = await resp.text();
        sendResponse({ ok: resp.ok, status: resp.status, text });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    // indicate we'll respond asynchronously
    return true;
  }
});
