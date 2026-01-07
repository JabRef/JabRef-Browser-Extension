// Capture console messages and persist to chrome.storage.local for debugging
const __popup_log_buffer = [];
const __origConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};
function __serializeArgs(args) {
  try {
    return args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
  } catch (e) {
    return String(args);
  }
}
function __persistLog(level, text) {
  const entry = { ts: Date.now(), level, text };
  __popup_log_buffer.push(entry);
  try {
    chrome &&
      chrome.storage &&
      chrome.storage.local &&
      chrome.storage.local.get({ popupLogs: [] }, (res) => {
        const arr = res.popupLogs || [];
        arr.push(entry);
        chrome.storage.local.set({ popupLogs: arr });
      });
  } catch (e) {
    // ignore
  }
}
console.log = function (...args) {
  __origConsole.log.apply(console, args);
  __persistLog("log", __serializeArgs(args));
};
console.info = function (...args) {
  __origConsole.info.apply(console, args);
  __persistLog("info", __serializeArgs(args));
};
console.warn = function (...args) {
  __origConsole.warn.apply(console, args);
  __persistLog("warn", __serializeArgs(args));
};
console.error = function (...args) {
  __origConsole.error.apply(console, args);
  __persistLog("error", __serializeArgs(args));
};
console.debug = function (...args) {
  __origConsole.debug.apply(console, args);
  __persistLog("debug", __serializeArgs(args));
};

let websocket = null;

// DOM Elements
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const bibEntryTextarea = document.getElementById("bibEntry");
const translatorSelect = document.getElementById("translatorSelect");

// Global error handlers to capture errors that would otherwise close the popup
window.addEventListener("error", (e) => {
  try {
    addLog(`Uncaught error: ${e && e.message ? e.message : e}`, "error");
    console.error("Popup error captured:", e.error || e.message || e);
  } catch (__) {}
});
window.addEventListener("unhandledrejection", (ev) => {
  try {
    const reason = ev && ev.reason ? ev.reason : ev;
    addLog(
      `Unhandled promise rejection: ${reason && reason.message ? reason.message : reason}`,
      "error",
    );
    console.error("Unhandled rejection in popup:", reason);
  } catch (__) {}
});

// Load persisted logs and render into log area
function renderPersistedLogs() {
  try {
    if (!chrome || !chrome.storage) return;
    chrome.storage.local.get({ popupLogs: [] }, (res) => {
      const arr = res.popupLogs || [];
      for (const e of arr) {
        const t = new Date(e.ts).toLocaleTimeString();
        addLog(
          `[saved ${t}] ${e.level}: ${e.text}`,
          e.level === "error" ? "error" : "info",
        );
      }
    });
  } catch (e) {
    console.warn("Failed to read persisted logs", e);
  }
}

function clearPersistedLogs() {
  try {
    if (!chrome || !chrome.storage) return;
    chrome.storage.local.set({ popupLogs: [] }, () => {
      addLog("Cleared persisted logs", "info");
    });
  } catch (e) {
    console.warn("Failed to clear persisted logs", e);
  }
}

// Add log message to the log box
function addLog(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement("div");
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  logEl.appendChild(logEntry);
  logEl.scrollTop = logEl.scrollHeight;
}

// Update connection status
function updateStatus(status, className) {
  statusEl.textContent = status;
  statusEl.className = `status-${className}`;
}

// Connect to JabRef WebSocket
function getWsUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ jabrefPort: 23119 }, (res) => {
      const port = res.jabrefPort || 23119;
      resolve(`ws://localhost:${port}/ws`);
    });
  });
}

function connectToJabRef() {
  return getWsUrl().then((wsUrl) => {
    if (!wsUrl) {
      addLog("No WebSocket URL configured", "error");
      return;
    }

    try {
      addLog(`Connecting to ${wsUrl}...`, "info");
      try {
        websocket = new WebSocket(wsUrl);
      } catch (e) {
        addLog(
          `Failed to construct WebSocket: ${e && e.message ? e.message : e}`,
          "error",
        );
        console.error("WebSocket constructor threw:", e);
        return;
      }

      websocket.onopen = () => {
        addLog("Connected to JabRef successfully!", "success");
        updateStatus("Connected", "connected");
      };

      websocket.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.type === "success") {
            addLog(response.message, "success");
          } else if (response.type === "error") {
            addLog(response.message, "error");
          } else if (response.type === "connected") {
            addLog(response.message, "success");
          } else {
            addLog(`Received: ${event.data}`, "info");
          }
        } catch (e) {
          addLog(`Received: ${event.data}`, "info");
        }
      };

      websocket.onerror = (ev) => {
        // Provide more actionable logging for connection failures
        addLog("WebSocket error occurred connecting to JabRef", "error");
        addLog(`URL: ${wsUrl}`, "info");
        addLog(
          "Check: Is JabRef running? Is remote operation enabled and port correct?",
          "warning",
        );
        try {
          // ev may be an Event with little info; log it to console for debugging
          console.error(
            "WebSocket error event:",
            ev,
            "socket readyState:",
            websocket && websocket.readyState,
          );
        } catch (e) {
          console.error("WebSocket error logging failed", e);
        }
      };

      websocket.onclose = (event) => {
        if (event && event.wasClean) {
          addLog(`Disconnected from JabRef (code: ${event.code})`, "warning");
        } else {
          addLog("Connection lost unexpectedly", "error");
          if (event && event.code === 1006) {
            addLog(
              "Connection refused - JabRef may not be running or remote operation is disabled",
              "error",
            );
          }
        }
        updateStatus("Disconnected", "disconnected");
        websocket = null;
      };
    } catch (error) {
      addLog(
        `Connection failed: ${error && error.message ? error.message : error}`,
        "error",
      );
      console.error("Connection error:", error);
    }
  });
}

// Send BibTeX entry to JabRef
function sendBibEntry() {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    addLog("Not connected to JabRef", "error");
    return;
  }

  const bibEntry = bibEntryTextarea.value.trim();

  if (!bibEntry) {
    addLog("BibTeX entry is empty", "error");
    return;
  }

  try {
    // JabRef WebSocket API format
    const message = JSON.stringify({
      command: "add",
      argument: bibEntry,
    });

    // Log exact payload to console for debugging
    console.log("Sending to JabRef WebSocket:", message);

    websocket.send(message);
    addLog("BibTeX entry sent successfully!", "success");
    addLog(`Sent: ${bibEntry.substring(0, 50)}...`, "info");
  } catch (error) {
    addLog(`Failed to send: ${error.message}`, "error");
    console.error("Send error:", error);
  }
}

// Populate translators selector from manifest
function loadTranslatorsManifest() {
  console.log("loadTranslatorsManifest starting");
  setTimeout(() => {
    Promise.all([
      fetch(chrome.runtime.getURL("translators/manifest.json")).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      new Promise((res) =>
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
          res(tabs && tabs[0] ? tabs[0].url : null),
        ),
      ),
    ])
      .then(([list, activeUrl]) => {
        console.log("Manifest loaded, total translators:", list.length);
        translatorSelect.innerHTML = "";

        const candidates = (list || []).filter(
          (t) => t.target && t.target.length > 0,
        );
        const matches = [];
        for (const t of candidates) {
          if (!activeUrl) break;
          try {
            const re = new RegExp(t.target, "i");
            if (re.test(activeUrl)) matches.push(t);
          } catch (e) {
            console.warn("Invalid regex in manifest for", t.path, t.target, e);
          }
        }

        const toShow = (matches.length ? matches : candidates).slice(0, 100);

        // Populate in batches to avoid blocking UI
        let idx = 0;
        function addBatch() {
          const batchSize = 20;
          const end = Math.min(idx + batchSize, toShow.length);
          for (let i = idx; i < end; i++) {
            const t = toShow[i];
            const opt = document.createElement("option");
            opt.value = t.path;
            opt.dataset.type = t.type || "module";
            opt.textContent = t.label || t.path;
            translatorSelect.appendChild(opt);
          }
          idx = end;
          if (idx < toShow.length) setTimeout(addBatch, 0);
          else
            addLog(
              `Loaded ${toShow.length} translators (matched ${matches.length} for URL)`,
              "info",
            );
        }
        addBatch();
      })
      .catch((err) => {
        console.error("loadTranslatorsManifest error:", err);
        addLog(
          `Failed to load translators manifest: ${err && err.message ? err.message : err}`,
          "warning",
        );
      });
  }, 100); // Defer to allow popup to render first
}

// Run the selected translator on the active tab
// Helper: try several candidate extension paths and import the first that exists
async function importTranslatorModule(path) {
  const candidates = [];
  const basename = (path || "").split("/").pop();
  candidates.push(path);
  if (!path.startsWith("translators/")) candidates.push(`translators/${path}`);
  if (!path.startsWith("translators/zotero/"))
    candidates.push(`translators/zotero/${path}`);
  if (basename) {
    candidates.push(basename);
    candidates.push(`translators/${basename}`);
    candidates.push(`translators/zotero/${basename}`);
  }
  const errors = [];
  for (const cand of candidates) {
    if (!cand) continue;
    const url = chrome.runtime.getURL(cand);
    // Try direct dynamic import first (fastest path)
    try {
      return await import(url);
    } catch (impErr) {
      // If direct import fails, try fetching and importing from a blob URL
      try {
        const r = await fetch(url, { method: "GET" });
        if (!r.ok) {
          errors.push(`${url} fetch HTTP ${r.status}`);
          continue;
        }
        const text = await r.text();
        try {
          const blob = new Blob([text], { type: "text/javascript" });
          const blobUrl = URL.createObjectURL(blob);
          try {
            const mod = await import(blobUrl);
            URL.revokeObjectURL(blobUrl);
            return mod;
          } catch (blobImpErr) {
            URL.revokeObjectURL(blobUrl);
            errors.push(
              `${url} blob-import-failed: ${blobImpErr && blobImpErr.message ? blobImpErr.message : blobImpErr}`,
            );
            continue;
          }
        } catch (blobErr) {
          errors.push(
            `${url} blob-creation-failed: ${blobErr && blobErr.message ? blobErr.message : blobErr}`,
          );
          continue;
        }
      } catch (fetchErr) {
        errors.push(
          `${url} fetch-error: ${fetchErr && fetchErr.message ? fetchErr.message : fetchErr}`,
        );
        continue;
      }
    }
  }
  throw new Error(
    `Translator file not found or import failed. Tried: ${candidates.join(", ")}. Errors: ${errors.join(" | ")}`,
  );
}

async function runSelectedTranslator() {
  try {
    const opt =
      translatorSelect &&
      translatorSelect.options[translatorSelect.selectedIndex];
    if (!opt) {
      addLog("No translator selected", "warning");
      return;
    }
    const path = opt.value;
    const type = opt.dataset.type || "module";

    // Helper to get active tab and page HTML
    const getActiveTabAndHtml = () =>
      new Promise((resolve, reject) => {
        try {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (!tab) return reject(new Error("No active tab"));
            chrome.scripting.executeScript(
              {
                target: { tabId: tab.id },
                func: () => document.documentElement.outerHTML,
              },
              (htmlResults) => {
                if (!htmlResults || !htmlResults[0] || !htmlResults[0].result)
                  return reject(new Error("Could not retrieve page HTML"));
                resolve({ tab, pageHtml: htmlResults[0].result });
              },
            );
          });
        } catch (e) {
          reject(e);
        }
      });

    const { tab, pageHtml } = await getActiveTabAndHtml();

    // module translator path
    try {
      const runnerModule = await import("./sources/translatorRunner.js");
      const trans = await importTranslatorModule(path);
      const result = await runnerModule.runTranslatorOnHtml(
        trans,
        pageHtml,
        tab.url,
      );
      if (result) {
        bibEntryTextarea.value = result;
        addLog("Translator produced output and populated textbox", "success");
        console.log("Translator output:", result);
        setTimeout(() => sendBibEntry(), 100);
      } else {
        addLog("Translator did not produce output", "info");
      }
    } catch (err) {
      addLog(
        `Translator execution failed: ${err && err.message ? err.message : err}`,
        "error",
      );
      console.warn("Translator error:", err);
    }
  } catch (err) {
    addLog(
      `runSelectedTranslator error: ${err && err.message ? err.message : err}`,
      "error",
    );
    console.error("runSelectedTranslator threw", err);
  }
}

if (translatorSelect) {
  // Defer translator loading to prevent popup crash
  console.log("Will load translators after delay");
  setTimeout(() => {
    try {
      loadTranslatorsManifest();
    } catch (e) {
      console.error("loadTranslatorsManifest threw:", e);
      addLog("Translator loading failed: " + (e.message || e), "error");
    }
  }, 200);
}

// // Render persisted logs on popup open
// renderPersistedLogs();

// (No connect input) Allow Enter key on the popup to attempt reconnect when pressed
document.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    connectToJabRef();
  }
});

// Initialize
addLog("JabRef Connector initialized", "info");
addLog("Make sure JabRef is running with WebSocket server enabled", "warning");
addLog("Check: Preferences → Advanced → Remote operation", "info");

// Detect BibTeX content on the active page and copy into the textbox if found
function detectBibOnPage() {
  // Get active tab then inject a small function to scan the page for .bib links or bib-text
  try {
    // Helper: ask background service worker to fetch a URL (bypasses page CORS when host_permissions allow)
    function fetchViaBackground(url) {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ action: "fetch", url }, (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!resp) {
              reject(new Error("No response from background"));
              return;
            }
            if (resp.ok) resolve(resp.text);
            else reject(new Error(resp.error || `HTTP ${resp.status}`));
          });
        } catch (e) {
          reject(e);
        }
      });
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

      // If on arXiv abstract page, use arXiv API to fetch metadata
      try {
        const arxivMatch = (tab.url || "").match(
          /arxiv\.org\/abs\/([^#?\/]+)/i,
        );
        if (arxivMatch) {
          const arxivId = arxivMatch[1];
          addLog(
            `arXiv page detected: ${arxivId} — fetching via arXiv API...`,
            "info",
          );

          import("./sources/arxiv.js")
            .then((mod) => mod.fetchArxivBib(arxivId))
            .then((bibtex) => {
              bibEntryTextarea.value = bibtex;
              addLog(
                "Fetched arXiv metadata and populated BibTeX with available fields",
                "success",
              );
              setTimeout(() => sendBibEntry(), 100);
            })
            .catch((err) => {
              addLog(`Failed to fetch arXiv data: ${err.message}`, "error");
            });

          return; // we've handled arXiv case
        }
      } catch (e) {
        addLog(`arXiv detection error: ${e.message}`, "warning");
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: function findBibInPage() {
            function looksLikeBib(text) {
              return /@\w+\s*\{/.test(text);
            }
            function looksLikeRis(text) {
              return /^TY  - /m.test(text);
            }

            // 1) Look for links to .bib or .ris files
            const links = Array.from(document.querySelectorAll("a[href]"));
            for (const a of links) {
              try {
                const href = a.href || "";
                // quick filename checks first
                if (/\.bib(\?|$)/i.test(href) || /\.bib$/i.test(href)) {
                  return { type: "bibFile", url: href };
                }
                if (/\.ris(\?|$)/i.test(href) || /\.ris$/i.test(href)) {
                  return { type: "risFile", url: href };
                }

                // More robust: parse query params and only accept RefMan/RIS exports
                try {
                  const u = new URL(href, location.href);
                  const format = (
                    u.searchParams.get("format") ||
                    u.searchParams.get("output") ||
                    u.searchParams.get("filetype") ||
                    ""
                  ).toLowerCase();
                  const flavour = (
                    u.searchParams.get("flavour") || ""
                  ).toLowerCase();

                  // Only accept when format indicates refman/risk-like export
                  if (/refman|ris/.test(format)) {
                    // Accept only allowed flavours; explicitly reject 'references'
                    if (flavour && /^(citation|ris|refman)$/.test(flavour)) {
                      return { type: "risFile", url: u.href };
                    }
                  }
                } catch (e) {
                  // ignore URL parse errors
                }
              } catch (e) {}
            }

            // 2) Search for visible elements that may contain bib or RIS text
            const candidates = [];
            const tags = [
              "pre",
              "code",
              "textarea",
              "script",
              "div",
              "section",
              "article",
            ];
            tags.forEach((tag) => {
              document.querySelectorAll(tag).forEach((el) => {
                const text = (el.innerText || el.textContent || "").trim();
                if (text && looksLikeBib(text))
                  candidates.push({ type: "bibText", text });
                else if (text && looksLikeRis(text))
                  candidates.push({ type: "risText", text });
              });
            });

            if (candidates.length) return candidates[0];

            // 3) Nothing found
            return { type: "none" };
          },
        },
        (injectionResults) => {
          if (
            !injectionResults ||
            !injectionResults[0] ||
            !injectionResults[0].result
          ) {
            addLog("No response from page when detecting BibTeX", "warning");
            return;
          }

          const res = injectionResults[0].result;

          if (res.type === "bibText") {
            bibEntryTextarea.value = res.text;
            addLog(
              "Detected BibTeX block on page and copied to textbox",
              "success",
            );
            setTimeout(() => sendBibEntry(), 100);
          } else if (res.type === "risText") {
            // Convert RIS text to BibTeX using the ris module
            addLog(
              `Detected inline RIS block (length ${res.text.length})`,
              "info",
            );
            console.log("RIS inline content:", res.text);
            import("./sources/ris.js")
              .then((mod) => {
                const bib = mod.parseRisToBib(res.text);
                bibEntryTextarea.value = bib;
                addLog(
                  "Detected RIS block on page and converted to BibTeX",
                  "success",
                );
                addLog(
                  `Converted BibTeX (truncated): ${bib.substring(0, 400).replace(/\n/g, " ")}`,
                  "info",
                );
                console.log("Converted BibTeX:", bib);
                setTimeout(() => sendBibEntry(), 100);
              })
              .catch((err) =>
                addLog(`RIS conversion failed: ${err.message}`, "error"),
              );
          } else if (res.type === "bibFile") {
            addLog(`Found .bib file link: ${res.url} — fetching...`, "info");
            // Try to fetch the .bib file contents via background (bypasses CORS if host permission present)
            fetchViaBackground(res.url)
              .then((text) => {
                if (/@\w+\s*\{/.test(text)) {
                  bibEntryTextarea.value = text;
                  addLog(
                    "Fetched .bib file and copied contents to textbox",
                    "success",
                  );
                  setTimeout(() => sendBibEntry(), 100);
                } else {
                  addLog(
                    "Fetched .bib file but no BibTeX entries detected",
                    "warning",
                  );
                }
              })
              .catch((err) => {
                addLog(
                  `Failed to fetch .bib file (CORS or network): ${err.message}`,
                  "error",
                );
                bibEntryTextarea.value = `# Unable to fetch .bib file due to CORS/network. URL: ${res.url}`;
              });
          } else if (res.type === "risFile") {
            addLog(
              `Found .ris file link: ${res.url} — fetching and converting...`,
              "info",
            );
            console.log("Fetching RIS via background:", res.url);
            fetchViaBackground(res.url)
              .then((text) => {
                addLog(`Fetched RIS content (length ${text.length})`, "info");
                console.log("Fetched RIS content:", text);
                import("./sources/ris.js")
                  .then((mod) => {
                    const bib = mod.parseRisToBib(text);
                    bibEntryTextarea.value = bib;
                    addLog(
                      "Fetched .ris file and converted to BibTeX",
                      "success",
                    );
                    addLog(
                      `Converted BibTeX (truncated): ${bib.substring(0, 400).replace(/\n/g, " ")}`,
                      "info",
                    );
                    console.log("Converted BibTeX:", bib);
                    setTimeout(() => sendBibEntry(), 100);
                  })
                  .catch((err) =>
                    addLog(`RIS conversion failed: ${err.message}`, "error"),
                  );
              })
              .catch((err) => {
                addLog(
                  `Failed to fetch .ris file (CORS or network): ${err.message}`,
                  "error",
                );
                bibEntryTextarea.value = `# Unable to fetch .ris file due to CORS/network. URL: ${res.url}`;
              });
          } else if (res.type === "risFile") {
            // Fallback direct fetch (may be blocked by CORS)
            addLog(
              `Found .ris file link: ${res.url} — fetching (direct) and converting...`,
              "info",
            );
            console.log("Fetching RIS directly:", res.url);
            fetch(res.url)
              .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
              })
              .then((text) => {
                addLog(`Fetched RIS content (length ${text.length})`, "info");
                console.log("Fetched RIS content (direct):", text);
                import("./sources/ris.js")
                  .then((mod) => {
                    const bib = mod.parseRisToBib(text);
                    bibEntryTextarea.value = bib;
                    addLog(
                      "Fetched .ris file and converted to BibTeX",
                      "success",
                    );
                    addLog(
                      `Converted BibTeX (truncated): ${bib.substring(0, 400).replace(/\n/g, " ")}`,
                      "info",
                    );
                    console.log("Converted BibTeX (direct):", bib);
                    setTimeout(() => sendBibEntry(), 100);
                  })
                  .catch((err) =>
                    addLog(`RIS conversion failed: ${err.message}`, "error"),
                  );
              })
              .catch((err) => {
                addLog(
                  `Failed to fetch .ris file (CORS or network): ${err.message}`,
                  "error",
                );
                bibEntryTextarea.value = `# Unable to fetch .ris file due to CORS/network. URL: ${res.url}`;
              });
          } else {
            addLog(
              "No BibTeX or RIS content detected on the current page",
              "info",
            );

            // Try running a local translator as a fallback to extract metadata
            try {
              chrome.scripting.executeScript(
                {
                  target: { tabId: tab.id },
                  func: () => document.documentElement.outerHTML,
                },
                (htmlResults) => {
                  try {
                    if (
                      !htmlResults ||
                      !htmlResults[0] ||
                      !htmlResults[0].result
                    ) {
                      addLog(
                        "Could not retrieve page HTML for translators",
                        "warning",
                      );
                      return;
                    }
                    const pageHtml = htmlResults[0].result;
                    // Fallback: select translator from manifest.json by matching `target` against page URL
                    import("./sources/translatorRunner.js")
                      .then((runner) =>
                        fetch("translators/manifest.json")
                          .then((r) =>
                            r.ok
                              ? r.json()
                              : Promise.reject(new Error("manifest not found")),
                          )
                          .then((list) => {
                            const candidates = (list || []).filter(
                              (t) => t.target && t.target.length,
                            );
                            const matchedList = [];
                            for (const t of candidates) {
                              try {
                                const re = new RegExp(t.target);
                                if (re.test(tab.url)) matchedList.push(t);
                              } catch (e) {
                                // ignore invalid regex
                              }
                            }
                            // If no exact matches, fall back to first non-legacy translator then full list
                            if (matchedList.length === 0) {
                              const preferred = (list || []).find(
                                (t) => (t.type || "module") !== "zotero-legacy",
                              );
                              if (preferred) matchedList.push(preferred);
                              else {
                                // as last resort, use entire manifest order
                                matchedList.push(...(list || []));
                              }
                            }

                            return { runner, matchedList };
                          }),
                      )
                      .then(async ({ runner, matchedList }) => {
                        // Try translators sequentially until one returns a BibTeX string
                        for (const matched of matchedList) {
                          try {
                            // module translator: load and run
                            try {
                              const trans = await importTranslatorModule(
                                matched.path,
                              ).catch(
                                async () =>
                                  import(chrome.runtime.getURL(matched.path)),
                              );
                              const bib = await runner.runTranslatorOnHtml(
                                trans,
                                pageHtml,
                                tab.url,
                              );
                              if (bib) return { bib };
                            } catch (e) {
                              // module import or run failed; continue
                              console.warn(
                                "Module translator failed, trying next:",
                                matched.path,
                                e,
                              );
                            }
                          } catch (e) {
                            console.warn(
                              "Translator attempt failed, continuing:",
                              matched.path,
                              e,
                            );
                          }
                        }
                        // none produced output
                        return { bib: null };
                      })
                      .then(({ bib }) => {
                        if (bib) {
                          bibEntryTextarea.value = bib;
                          addLog(
                            "Translator produced BibTeX and populated textbox",
                            "success",
                          );
                          console.log("Translator BibTeX:", bib);
                          setTimeout(() => sendBibEntry(), 100);
                        } else {
                          addLog("Translator did not produce output", "info");
                        }
                      })
                      .catch((err) => {
                        if (err && err.message === "no-local-translator") {
                          addLog(
                            "No local translators available for fallback",
                            "info",
                          );
                        } else {
                          addLog(
                            `Translator runner failed: ${err && err.message ? err.message : err}`,
                            "warning",
                          );
                          console.warn("Translator error:", err);
                        }
                      });
                  } catch (e) {
                    addLog(
                      `Translator HTML retrieval error: ${e.message}`,
                      "warning",
                    );
                  }
                },
              );
            } catch (e) {
              addLog(`Translator scheduling failed: ${e.message}`, "warning");
            }
          }
        },
      );
    });
  } catch (e) {
    addLog(`Detection error: ${e.message}`, "error");
  }
}

// Run detection when popup initializes (safe startup)
try {
  // Defer detection slightly so popup UI can render and avoid blocking
  setTimeout(() => {
    try {
      detectBibOnPage();
      addLog("Automatic BibTeX detection started", "info");
    } catch (e) {
      addLog(
        "Automatic BibTeX detection failed: " +
          (e && e.message ? e.message : e),
        "warning",
      );
    }
  }, 300);
} catch (e) {
  addLog(
    "Failed to schedule BibTeX detection: " + (e && e.message ? e.message : e),
    "error",
  );
}

// Auto-connect when popup opens
connectToJabRef();
