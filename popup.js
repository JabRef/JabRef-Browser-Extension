async function findMatchesForUrl(url) {
    const manifestUrl = chrome.runtime.getURL('translators/manifest.json');
    const resp = await fetch(manifestUrl);
    const list = await resp.json();

    const matches = [];
    for (const entry of list) {
        const target = (entry && entry.target) || '';
        if (!target) continue;
        try {
            const re = new RegExp(target);
            if (re.test(url)) matches.push(entry);
        } catch (e) {
            // ignore invalid regex patterns
            console.warn('Invalid target regex', target, e);
        }
    }
    return matches;
}

function renderResults(url, matches) {
    const log = document.getElementById('log');
    const bib = document.getElementById('bibEntry');
    // Log the URL
    appendLog(`URL: ${url}`);
    if (!matches || !matches.length) {
        appendLog('No matching translators found.');
        return;
    }
}

async function ensureOffscreen() {
    if (!chrome.offscreen) return false;
    const has = await chrome.offscreen.hasDocument();
    if (has) return true;
    try {
        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('offscreen.html'),
            reasons: ['DOM_PARSER'],
            justification: 'Run translators offscreen'
        });
        return true;
    } catch (e) {
        console.warn('Failed to create offscreen document', e);
        return false;
    }
}

async function runTranslatorOffscreen(translatorPaths, url) {
    const ok = await ensureOffscreen();
    const payload = { type: 'runTranslator', translators: translatorPaths, url };
    try {
        appendLog(`Requesting translator run for ${url}`, 'info');
        chrome.runtime.sendMessage(payload, (resp) => {
            if (chrome.runtime.lastError) {
                appendLog(`Background sendMessage failed: ${chrome.runtime.lastError.message}`, 'error');
                return;
            }
            if (resp && resp.ok) appendLog('Background acknowledged run request', 'info');
            else appendLog(`Background error: ${resp && resp.error ? resp.error : 'unknown'}`, 'error');
        });
    } catch (e) {
        console.error('Failed to send runTranslator message', e);
    }
}

// Listen for offscreen results
chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'offscreenResult') return;
    const bib = document.getElementById('bibEntry');
    const error = msg.error;
    const result = msg.result;
    if (error) {
        appendLog(`Error: ${error}`);
        return;
    }
    appendLog(`Received result for ${msg.url}`);
    if (bib) {
        if (typeof result === 'string') bib.value = result;
        else bib.value = JSON.stringify(result, null, 2);
        // Send to JabRef automatically
        sendBibEntry();
    } else {
        appendLog(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    }
});

function appendLog(text) {
    const log = document.getElementById('log');
    if (!log) return;
    const d = document.createElement('div');
    d.className = 'log-line';
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
}

// Update connection status
function updateStatus(status, className) {
    const statusEl = document.getElementById('status');
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

async function connectToJabRef() {
    const wsUrl = await getWsUrl();
    if (!wsUrl) {
        appendLog("No WebSocket URL configured", "error");
        return;
    }
    try {
        appendLog(`Connecting to ${wsUrl}...`, "info");
        try {
            websocket = new WebSocket(wsUrl);
        } catch (e) {
            appendLog(
                `Failed to construct WebSocket: ${e && e.message ? e.message : e}`,
                "error");
            console.error("WebSocket constructor threw:", e);
            return;
        }

        websocket.onopen = () => {
            appendLog("Connected to JabRef successfully!", "success");
            updateStatus("Connected", "connected");
        };

        websocket.onmessage = (event) => {
            try {
                const response = JSON.parse(event.data);
                if (response.type === "success") {
                    appendLog(response.message, "success");
                } else if (response.type === "error") {
                    appendLog(response.message, "error");
                } else if (response.type === "connected") {
                    appendLog(response.message, "success");
                } else {
                    appendLog(`Received: ${event.data}`, "info");
                }
            } catch (e_1) {
                appendLog(`Received: ${event.data}`, "info");
            }
        };

        websocket.onerror = (ev) => {
            // Provide more actionable logging for connection failures
            appendLog("WebSocket error occurred connecting to JabRef", "error");
            appendLog(`URL: ${wsUrl}`, "info");
            appendLog(
                "Check: Is JabRef running? Is remote operation enabled and port correct?",
                "warning");
            try {
                // ev may be an Event with little info; log it to console for debugging
                console.error(
                    "WebSocket error event:",
                    ev,
                    "socket readyState:",
                    websocket && websocket.readyState);
            } catch (e_2) {
                console.error("WebSocket error logging failed", e_2);
            }
        };

        websocket.onclose = (event_1) => {
            if (event_1 && event_1.wasClean) {
                appendLog(`Disconnected from JabRef (code: ${event_1.code})`, "warning");
            } else {
                appendLog("Connection lost unexpectedly", "error");
                if (event_1 && event_1.code === 1006) {
                    appendLog(
                        "Connection refused - JabRef may not be running or remote operation is disabled",
                        "error");
                }
            }
            updateStatus("Disconnected", "disconnected");
            websocket = null;
        };
    } catch (error) {
        appendLog(
            `Connection failed: ${error && error.message ? error.message : error}`,
            "error");
        console.error("Connection error:", error);
    }
}

// Send BibTeX entry to JabRef
function sendBibEntry() {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        appendLog("Not connected to JabRef", "error");
        return;
    }

    const bibEntryTextarea = document.getElementById('bibEntry');
    const bibEntry = bibEntryTextarea.value.trim();

    if (!bibEntry) {
        appendLog("BibTeX entry is empty", "error");
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
        appendLog("BibTeX entry sent successfully!", "success");
        appendLog(`Sent: ${bibEntry.substring(0, 50)}...`, "info");
    } catch (error) {
        appendLog(`Failed to send: ${error.message}`, "error");
        console.error("Send error:", error);
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    const urlEl = document.getElementById('url');
    try {
        if (!window.chrome || !chrome.tabs) {
            urlEl.textContent = 'Chrome extension APIs not available.';
            document.getElementById('none').style.display = 'block';
            return;
        }

        const tab = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs && tabs[0]);
            });
        });
        const url = tab && tab.url ? tab.url : '';
        if (!url) {
            urlEl.textContent = 'Unable to determine active tab URL.';
            document.getElementById('none').style.display = 'block';
            return;
        }

        let matches;
        try {
            matches = await findMatchesForUrl(url);
        } catch (e) {
            console.error('Error fetching translators manifest', e);
            urlEl.textContent = 'Error reading translators manifest: ' + (e && e.message ? e.message : String(e));
            document.getElementById('none').style.display = 'block';
            return;
        }

        renderResults(url, matches || []);
        if (matches && matches.length) {
            // Build array of translator URLs and request background/offscreen
            const translatorPaths = matches.map(m => chrome.runtime.getURL(m.path || ''));
            runTranslatorOffscreen(translatorPaths, url);
        }
    } catch (e) {
        console.error('Popup initialization error', e);
        urlEl.textContent = 'Popup error: ' + (e && e.message ? e.message : String(e));
        document.getElementById('none').style.display = 'block';
    }
});

// Auto-connect when popup opens
connectToJabRef();