// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

async function findMatchesForUrl(url) {
  const manifestUrl = browser.runtime.getURL("translators/manifest.json");
  const resp = await fetch(manifestUrl);
  const list = await resp.json();

  const matches = [];
  for (const entry of list) {
    const target = (entry && entry.target) || "";
    if (!target) continue;
    try {
      const re = new RegExp(target);
      if (re.test(url)) matches.push(entry);
    } catch (e) {
      // ignore invalid regex patterns
      console.warn("Invalid target regex", target, e);
    }
  }
  return matches;
}

function renderResults(url, matches) {
  // Log the URL
  appendLog(`URL: ${url}`);
  if (!matches || !matches.length) {
    appendLog("No matching translators found.");
    return;
  }
}

async function ensureOffscreen() {
  if (!browser.offscreen) return false;
  const has = await browser.offscreen.hasDocument();
  if (has) return true;
  try {
    await browser.offscreen.createDocument({
      url: browser.runtime.getURL("offscreen.html"),
      reasons: ["DOM_PARSER"],
      justification: "Run translators offscreen",
    });
    return true;
  } catch (e) {
    console.warn("Failed to create offscreen document", e);
    return false;
  }
}

async function runTranslatorOffscreen(translatorPaths, url) {
  await ensureOffscreen();
  const payload = { type: "runTranslator", translators: translatorPaths, url };
  try {
    appendLog(`Requesting translator run for ${url}`, "info");
    const resp = await browser.runtime.sendMessage(payload);
    if (resp && resp.ok) appendLog("Background acknowledged run request", "info");
    else appendLog(`Background error: ${resp && resp.error ? resp.error : "unknown"}`, "error");
  } catch (e) {
    console.error("Failed to send runTranslator message", e);
  }
}

// Listen for offscreen results
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "offscreenResult") return;
  const bib = document.getElementById("bibEntry");
  const error = msg.error;
  const result = msg.result;
  if (error) {
    appendLog(`Error: ${error}`);
    return;
  }
  appendLog(`Received result for ${msg.url}`);
  if (bib) {
    if (typeof result === "string") bib.value = result;
    else bib.value = JSON.stringify(result, null, 2);
    // Send to JabRef automatically
    sendBibEntry();
  } else {
    appendLog(
      typeof result === "string" ? result : JSON.stringify(result, null, 2),
    );
  }
});

function appendLog(text) {
  const log = document.getElementById("log");
  if (!log) return;
  const d = document.createElement("div");
  d.className = "log-line";
  // Convert URLs in the text into clickable links
  // Split the text keeping URLs (captures https?://...)
  const parts = text.split(/(https?:\/\/(docs.jabref.org|github.com)[^\s]+)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("http://") || part.startsWith("https://")) {
      const a = document.createElement("a");
      a.href = part;
      a.textContent = part;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      d.appendChild(a);
    } else {
      d.appendChild(document.createTextNode(part));
    }
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

// Update connection status
function updateStatus(status, className) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = status;
  statusEl.className = `status-${className}`;
}

// Connect to JabRef via HTTP POST
let jabrefBaseUrl = null;
async function getBaseUrl() {
  const res = await browser.storage.local.get({ jabrefPort: 23119 });
  const port = res.jabrefPort || 23119;
  return `http://localhost:${port}/`;
}

async function connectToJabRef() {
  const base = await getBaseUrl();
  if (!base) {
    appendLog("No JabRef base URL configured", "error");
    return;
  }
  jabrefBaseUrl = base;
  appendLog(`Checking JabRef at ${base}...`, "info");
  try {
    // Try a simple GET to the base URL to detect availability.
    const resp = await fetch(base, { method: "GET", cache: "no-store" });
    if (resp && (resp.ok || resp.status === 404)) {
      appendLog("JabRef reachable (HTTP)", "success");
      updateStatus("Connected", "connected");
    } else {
      appendLog(`JabRef responded with status ${resp.status}`, "warning");
      updateStatus("Connected (no OK)", "connected");
    }
  } catch (error) {
    appendLog(
      `Connection failed: ${error && error.message ? error.message : error}`,
      "error",
    );
    console.error("HTTP connection error:", error);
    updateStatus("Disconnected", "disconnected");
    jabrefBaseUrl = null;
    return false;
  }
  return true;
}

// Send BibTeX entry to JabRef
async function sendBibEntry() {
  const bibEntryTextarea = document.getElementById("bibEntry");
  const bibEntry = bibEntryTextarea.value.trim();

  if (!bibEntry) {
    appendLog("BibTeX entry is empty", "error");
    return;
  }

  const base = jabrefBaseUrl || (await getBaseUrl());
  if (!base) {
    appendLog("JabRef base URL not configured", "error");
    return;
  }

  const url = base + "libraries/current/entries";
  appendLog(`Sending BibTeX entry to JabRef at ${url}...`, "info");

  if (!bibEntry.startsWith("@")) {
    appendLog("BibTeX entry does not start with '@'", "error");
    return;
  }

  try {
    console.log("Sending to JabRef (HTTP POST):", bibEntry);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-bibtex" },
      body: bibEntry,
    });

    if (resp.ok) {
      appendLog("BibTeX entry sent successfully!", "success");
      appendLog(`Sent: ${bibEntry.substring(0, 50)}...`, "info");
    } else {
      let text;
      try {
        text = await resp.text();
      } catch (e) {
        text = String(e);
      }
      appendLog(`Failed to send (HTTP ${resp.status}): ${text}`, "error");
      console.error("HTTP send failed", resp.status, text);
    }
  } catch (error) {
    appendLog(
      `Failed to send: ${error && error.message ? error.message : error}`,
      "error",
    );
    console.error("Send error:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Auto-connect when popup opens
  const connected = await connectToJabRef();
  const urlEl = document.getElementById("url");
  if (!connected) {
    appendLog(
      "If JabRef is running, enable the HTTP server (Options → Preferences → Advanced → Remote operation → enable) and ensure the configured port is correct: https://github.com/JabRef/JabRef-Browser-Extension/blob/main/SETUP.md",
      "warning",
    );
    document.getElementById("log-box").open = true;
    // show fallback UI
    const noneEl = document.getElementById("none");
    if (noneEl) noneEl.style.display = "block";
    return;
  }
    try {
      if (!window.browser || !browser.tabs) {
        urlEl.textContent = "Extension APIs not available.";
        document.getElementById("none").style.display = "block";
        return;
      }

      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
    const url = tab && tab.url ? tab.url : "";
    if (!url) {
      urlEl.textContent = "Unable to determine active tab URL.";
      document.getElementById("none").style.display = "block";
      return;
    }

    let matches;
    try {
      matches = await findMatchesForUrl(url);
    } catch (e) {
      console.error("Error fetching translators manifest", e);
      urlEl.textContent =
        "Error reading translators manifest: " +
        (e && e.message ? e.message : String(e));
      document.getElementById("none").style.display = "block";
      return;
    }

    renderResults(url, matches || []);
    if (matches && matches.length) {
      // Build array of translator URLs and request background/offscreen
      const translatorPaths = matches.map((m) => browser.runtime.getURL(m.path || ""));
      runTranslatorOffscreen(translatorPaths, url);
    }
  } catch (e) {
    console.error("Popup initialization error", e);
    urlEl.textContent =
      "Popup error: " + (e && e.message ? e.message : String(e));
    document.getElementById("none").style.display = "block";
  }
});
