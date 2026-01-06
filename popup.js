let websocket = null;

// DOM Elements
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const bibEntryTextarea = document.getElementById('bibEntry');

// Add log message to the log box
function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
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
    chrome.storage.local.get({ jabrefPort: 23116 }, (res) => {
      const port = res.jabrefPort || 23116;
      resolve(`ws://localhost:${port}`);
    });
  });
}

function connectToJabRef() {
  return getWsUrl().then((wsUrl) => {
    if (!wsUrl) {
      addLog('No WebSocket URL configured', 'error');
      return;
    }

    try {
      addLog(`Connecting to ${wsUrl}...`, 'info');
      websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        addLog('Connected to JabRef successfully!', 'success');
        updateStatus('Connected', 'connected');
        sendBtn.disabled = false;
      };

      websocket.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.type === 'success') {
            addLog(response.message, 'success');
          } else if (response.type === 'error') {
            addLog(response.message, 'error');
          } else if (response.type === 'connected') {
            addLog(response.message, 'success');
          } else {
            addLog(`Received: ${event.data}`, 'info');
          }
        } catch (e) {
          addLog(`Received: ${event.data}`, 'info');
        }
      };

      websocket.onerror = (error) => {
        addLog('WebSocket error occurred', 'error');
        addLog('Check: Is JabRef running? Is remote operation enabled?', 'warning');
        console.error('WebSocket error:', error);
      };

      websocket.onclose = (event) => {
        if (event.wasClean) {
          addLog(`Disconnected from JabRef (code: ${event.code})`, 'warning');
        } else {
          addLog('Connection lost unexpectedly', 'error');
          if (event.code === 1006) {
            addLog('Connection refused - JabRef may not be running or remote operation is disabled', 'error');
          }
        }
        updateStatus('Disconnected', 'disconnected');
        sendBtn.disabled = true;
        websocket = null;
      };
    } catch (error) {
      addLog(`Connection failed: ${error.message}`, 'error');
      console.error('Connection error:', error);
    }
  }
  );
}

// Send BibTeX entry to JabRef
function sendBibEntry() {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    addLog('Not connected to JabRef', 'error');
    return;
  }

  const bibEntry = bibEntryTextarea.value.trim();

  if (!bibEntry) {
    addLog('BibTeX entry is empty', 'error');
    return;
  }

  try {
    // JabRef WebSocket API format
    const message = JSON.stringify({
      command: 'add',
      argument: bibEntry
    });

    // Log exact payload to console for debugging
    console.log('Sending to JabRef WebSocket:', message);

    websocket.send(message);
    addLog('BibTeX entry sent successfully!', 'success');
    addLog(`Sent: ${bibEntry.substring(0, 50)}...`, 'info');
  } catch (error) {
    addLog(`Failed to send: ${error.message}`, 'error');
    console.error('Send error:', error);
  }
}

// Event listeners
sendBtn.addEventListener('click', sendBibEntry);

// Settings button: open options page
const settingsBtn = document.getElementById('settingsBtn');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

// (No connect input) Allow Enter key on the popup to attempt reconnect when pressed
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    connectToJabRef();
  }
});

// Initialize
addLog('JabRef Connector initialized', 'info');
addLog('Make sure JabRef is running with WebSocket server enabled', 'warning');
addLog('Check: Preferences → Advanced → Remote operation', 'info');

// Detect BibTeX content on the active page and copy into the textbox if found
function detectBibOnPage() {
  // Get active tab then inject a small function to scan the page for .bib links or bib-text
  try {
    // Helper: ask background service worker to fetch a URL (bypasses page CORS when host_permissions allow)
    function fetchViaBackground(url) {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ action: 'fetch', url }, (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!resp) { reject(new Error('No response from background')); return; }
            if (resp.ok) resolve(resp.text);
            else reject(new Error(resp.error || `HTTP ${resp.status}`));
          });
        } catch (e) { reject(e); }
      });
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

      // If on arXiv abstract page, use arXiv API to fetch metadata
      try {
        const arxivMatch = (tab.url || '').match(/arxiv\.org\/abs\/([^#?\/]+)/i);
        if (arxivMatch) {
          const arxivId = arxivMatch[1];
          addLog(`arXiv page detected: ${arxivId} — fetching via arXiv API...`, 'info');

          import('./sources/arxiv.js')
            .then(mod => mod.fetchArxivBib(arxivId))
            .then(bibtex => {
              bibEntryTextarea.value = bibtex;
              addLog('Fetched arXiv metadata and populated BibTeX with available fields', 'success');
            })
            .catch(err => {
              addLog(`Failed to fetch arXiv data: ${err.message}`, 'error');
            });

          return; // we've handled arXiv case
        }
      
        // Detect ScienceDirect article pages and fetch BibTeX via the sciencedirect source helper
        try {
          const sdMatch = (tab.url || '').match(/sciencedirect\.com\/science\/article\/pii\/([^#?\/]+)/i);
          if (sdMatch) {
            const pii = sdMatch[1];
            addLog(`ScienceDirect article detected: ${pii} — fetching BibTeX...`, 'info');
            import('./sources/sciencedirect.js')
              .then(mod => {
                const sdBibUrl = mod.exportUrlFromPii(pii);
                return fetchViaBackground(sdBibUrl).then(text => ({ text, sdBibUrl }));
              })
              .then(({ text, sdBibUrl }) => {
                addLog(`Fetched ScienceDirect BibTeX (length ${text.length})`, 'info');
                console.log('ScienceDirect BibTeX content:', text);
                if (/@\w+\s*\{/.test(text) || /title\s*=\s*/i.test(text)) {
                  bibEntryTextarea.value = text;
                  addLog('Populated BibTeX from ScienceDirect export', 'success');
                } else {
                  addLog('ScienceDirect export did not return BibTeX', 'warning');
                  bibEntryTextarea.value = `# ScienceDirect export URL: ${sdBibUrl}`;
                }
              })
              .catch(err => {
                addLog(`Failed to fetch ScienceDirect BibTeX: ${err.message}`, 'error');
                bibEntryTextarea.value = `# Unable to fetch ScienceDirect BibTeX. URL: ${err && err.sdBibUrl ? err.sdBibUrl : ''}`;
              });

            return; // handled ScienceDirect
          }
        } catch (e) {
          addLog(`ScienceDirect detection error: ${e.message}`, 'warning');
        }
      } catch (e) {
        addLog(`arXiv detection error: ${e.message}`, 'warning');
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
            const links = Array.from(document.querySelectorAll('a[href]'));
            for (const a of links) {
              try {
                const href = a.href || '';
                // quick filename checks first
                if (/\.bib(\?|$)/i.test(href) || /\.bib$/i.test(href)) {
                  return { type: 'bibFile', url: href };
                }
                if (/\.ris(\?|$)/i.test(href) || /\.ris$/i.test(href)) {
                  return { type: 'risFile', url: href };
                }

                // More robust: parse query params and only accept RefMan/RIS exports
                try {
                  const u = new URL(href, location.href);
                  const format = (u.searchParams.get('format') || u.searchParams.get('output') || u.searchParams.get('filetype') || '').toLowerCase();
                  const flavour = (u.searchParams.get('flavour') || '').toLowerCase();

                  // Only accept when format indicates refman/risk-like export
                  if (/refman|ris/.test(format)) {
                    // Accept only allowed flavours; explicitly reject 'references'
                    if (flavour && /^(citation|ris|refman)$/.test(flavour)) {
                      return { type: 'risFile', url: u.href };
                    }
                  }
                } catch (e) {
                  // ignore URL parse errors
                }
              } catch (e) {}
            }

            // 2) Search for visible elements that may contain bib or RIS text
            const candidates = [];
            const tags = ['pre', 'code', 'textarea', 'script', 'div', 'section', 'article'];
            tags.forEach(tag => {
              document.querySelectorAll(tag).forEach(el => {
                const text = (el.innerText || el.textContent || '').trim();
                if (text && looksLikeBib(text)) candidates.push({ type: 'bibText', text });
                else if (text && looksLikeRis(text)) candidates.push({ type: 'risText', text });
              });
            });

            if (candidates.length) return candidates[0];

            // 3) Nothing found
            return { type: 'none' };
          }
        },
        (injectionResults) => {
          if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
            addLog('No response from page when detecting BibTeX', 'warning');
            return;
          }

          const res = injectionResults[0].result;

          if (res.type === 'bibText') {
            bibEntryTextarea.value = res.text;
            addLog('Detected BibTeX block on page and copied to textbox', 'success');
          } else if (res.type === 'risText') {
            // Convert RIS text to BibTeX using the ris module
            addLog(`Detected inline RIS block (length ${res.text.length})`, 'info');
            console.log('RIS inline content:', res.text);
            import('./sources/ris.js')
              .then(mod => {
                const bib = mod.parseRisToBib(res.text);
                bibEntryTextarea.value = bib;
                addLog('Detected RIS block on page and converted to BibTeX', 'success');
                addLog(`Converted BibTeX (truncated): ${bib.substring(0, 400).replace(/\n/g, ' ')}`, 'info');
                console.log('Converted BibTeX:', bib);
              })
              .catch(err => addLog(`RIS conversion failed: ${err.message}`, 'error'));
          } else if (res.type === 'bibFile') {
            addLog(`Found .bib file link: ${res.url} — fetching...`, 'info');
            // Try to fetch the .bib file contents via background (bypasses CORS if host permission present)
            fetchViaBackground(res.url)
              .then(text => {
                if (/@\w+\s*\{/.test(text)) {
                  bibEntryTextarea.value = text;
                  addLog('Fetched .bib file and copied contents to textbox', 'success');
                } else {
                  addLog('Fetched .bib file but no BibTeX entries detected', 'warning');
                }
              })
              .catch(err => {
                addLog(`Failed to fetch .bib file (CORS or network): ${err.message}`, 'error');
                bibEntryTextarea.value = `# Unable to fetch .bib file due to CORS/network. URL: ${res.url}`;
              });
          } else if (res.type === 'risFile') {
            addLog(`Found .ris file link: ${res.url} — fetching and converting...`, 'info');
            console.log('Fetching RIS via background:', res.url);
            fetchViaBackground(res.url)
              .then(text => {
                addLog(`Fetched RIS content (length ${text.length})`, 'info');
                console.log('Fetched RIS content:', text);
                import('./sources/ris.js')
                  .then(mod => {
                    const bib = mod.parseRisToBib(text);
                    bibEntryTextarea.value = bib;
                    addLog('Fetched .ris file and converted to BibTeX', 'success');
                    addLog(`Converted BibTeX (truncated): ${bib.substring(0,400).replace(/\n/g, ' ')}`, 'info');
                    console.log('Converted BibTeX:', bib);
                  })
                  .catch(err => addLog(`RIS conversion failed: ${err.message}`, 'error'));
              })
              .catch(err => {
                addLog(`Failed to fetch .ris file (CORS or network): ${err.message}`, 'error');
                bibEntryTextarea.value = `# Unable to fetch .ris file due to CORS/network. URL: ${res.url}`;
              });
          } else if (res.type === 'risFile') {
            // Fallback direct fetch (may be blocked by CORS)
            addLog(`Found .ris file link: ${res.url} — fetching (direct) and converting...`, 'info');
            console.log('Fetching RIS directly:', res.url);
            fetch(res.url)
              .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
              })
              .then(text => {
                addLog(`Fetched RIS content (length ${text.length})`, 'info');
                console.log('Fetched RIS content (direct):', text);
                import('./sources/ris.js')
                  .then(mod => {
                    const bib = mod.parseRisToBib(text);
                    bibEntryTextarea.value = bib;
                    addLog('Fetched .ris file and converted to BibTeX', 'success');
                    addLog(`Converted BibTeX (truncated): ${bib.substring(0,400).replace(/\n/g, ' ')}`, 'info');
                    console.log('Converted BibTeX (direct):', bib);
                  })
                  .catch(err => addLog(`RIS conversion failed: ${err.message}`, 'error'));
              })
              .catch(err => {
                addLog(`Failed to fetch .ris file (CORS or network): ${err.message}`, 'error');
                bibEntryTextarea.value = `# Unable to fetch .ris file due to CORS/network. URL: ${res.url}`;
              });
          } else {
            addLog('No BibTeX or RIS content detected on the current page', 'info');
          }
        }
      );
    });
  } catch (e) {
    addLog(`Detection error: ${e.message}`, 'error');
  }
}

// Run detection when popup initializes
detectBibOnPage();

// Auto-connect when popup opens
connectToJabRef();
