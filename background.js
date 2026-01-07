// Background service worker: perform cross-origin fetches on behalf of popup
const offscreenPorts = new Map();

// Register long-lived ports from offscreen/tab pages so we can forward messages to them
chrome.runtime.onConnect.addListener((port) => {
  try {
    if (port && port.name && port.name.startsWith("offscreen_")) {
      console.log("[Background] Registered offscreen port:", port.name);
      offscreenPorts.set(port.name, port);
      port.onDisconnect.addListener(() => {
        offscreenPorts.delete(port.name);
        console.log("[Background] Offscreen port disconnected:", port.name);
      });
    }
  } catch (e) {
    console.warn("[Background] onConnect handler error", e);
  }
});

// Support a dedicated fetch port to avoid runtime.sendMessage race conditions
chrome.runtime.onConnect.addListener((port) => {
  try {
    if (port && port.name === "fetch") {
      console.log("[Background] fetch port connected");
      port.onMessage.addListener(async (msg) => {
        if (!msg || msg.type !== "fetch" || !msg.id || !msg.url) return;
        const id = msg.id;
        const url = msg.url;
        try {
          console.log("[Background] fetch(port) requested:", url);
          const resp = await fetch(url);
          const text = await resp.text();
          try {
            port.postMessage({
              type: "fetch_result",
              id,
              ok: resp.ok,
              status: resp.status,
              text,
            });
          } catch (pmErr) {
            console.warn(
              "[Background] Unable to postMessage to fetch port (disconnected):",
              pmErr && pmErr.message,
            );
          }
        } catch (err) {
          console.error(
            "[Background] fetch(port) error:",
            url,
            err && err.message,
          );
          try {
            port.postMessage({
              type: "fetch_result",
              id,
              ok: false,
              error: err && err.message,
            });
          } catch (pmErr) {
            console.warn(
              "[Background] Unable to postMessage error to fetch port (disconnected):",
              pmErr && pmErr.message,
            );
          }
        }
      });
      port.onDisconnect.addListener(() => {
        console.log("[Background] fetch port disconnected");
      });
    }
  } catch (e) {
    console.warn("[Background] fetch port onConnect error", e);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "FORWARD_OFFSCREEN") {
    const token = message.token;
    const portName = `offscreen_${token}`;
    const port = offscreenPorts.get(portName);
    if (!port) {
      sendResponse({ ok: false, error: "Offscreen port not found" });
      return true;
    }
    // Forward payload to the port and wait for a single response
    const payload = message.payload;
    const listener = (resp) => {
      try {
        port.onMessage.removeListener(listener);
      } catch (e) {}
      sendResponse(resp);
    };
    port.onMessage.addListener(listener);
    try {
      port.postMessage(payload);
    } catch (e) {
      try {
        port.onMessage.removeListener(listener);
      } catch (e2) {}
      sendResponse({ ok: false, error: e.message });
    }
    return true;
  }

  if (message.action === "fetch") {
    const url = message.url;
    console.log("[Background] fetch requested:", url);
    fetch(url)
      .then(async (resp) => {
        const text = await resp.text();
        console.log("[Background] fetch result:", url, "status:", resp.status);
        sendResponse({ ok: resp.ok, status: resp.status, text });
      })
      .catch((err) => {
        console.error("[Background] fetch error:", url, err && err.message);
        sendResponse({ ok: false, error: err.message });
      });
    // indicate we'll respond asynchronously
    return true;
  }
});
