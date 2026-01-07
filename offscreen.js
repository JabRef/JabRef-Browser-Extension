// Offscreen document script for running legacy Zotero translators
// This offscreen page can use eval/Function because it's not subject to extension page CSP

console.log('[Offscreen] Offscreen document loaded');

// If opened as a tab fallback, connect a named port so the background can
// forward messages into this page. The adapter opens the tab with
// ?offscreen_token=<token> and expects a port named `offscreen_<token>`.
try {
  const params = new URLSearchParams(location.search);
  const token = params.get('offscreen_token');
  if (token) {
    const portName = `offscreen_${token}`;
    try {
      const port = chrome.runtime.connect({ name: portName });
      console.log('[Offscreen] Connected runtime port with name:', portName);
      port.onMessage.addListener((message) => {
        console.log('[Offscreen] Received port message:', message && message.type);
        if (message && message.type === 'RUN_TRANSLATOR_OFFSCREEN') {
          runTranslator(message.payload)
            .then(result => { try { port.postMessage({ success: true, result }); } catch (e) { console.error('[Offscreen] port.postMessage failed', e); } })
            .catch(error => { try { port.postMessage({ success: false, error: error.message || String(error) }); } catch (e) { console.error('[Offscreen] port.postMessage failed', e); } });
        }
      });
      port.onDisconnect.addListener(() => { console.log('[Offscreen] Port disconnected'); });
    } catch (e) {
      console.warn('[Offscreen] Failed to connect port for token', token, e);
    }
  }
} catch (e) { console.warn('[Offscreen] Failed to parse URL token', e); }

// Establish a dedicated fetch port to background for reliable proxied fetches
let __fetchPort = null;
const __pendingFetches = new Map();
let __fetchCounter = 1;
try {
  __fetchPort = chrome.runtime.connect({ name: 'fetch' });
  console.log('[Offscreen] Connected fetch port to background');
  __fetchPort.onMessage.addListener((m) => {
    if (!m || m.type !== 'fetch_result' || !m.id) return;
    const cb = __pendingFetches.get(m.id);
    if (!cb) return;
    __pendingFetches.delete(m.id);
    if (m.ok) cb.resolve(m.text);
    else cb.reject(new Error(m.error || `HTTP ${m.status || 'error'}`));
  });
  __fetchPort.onDisconnect.addListener(() => { console.warn('[Offscreen] fetch port disconnected'); __fetchPort = null; });
} catch (e) {
  console.warn('[Offscreen] Failed to connect fetch port', e && e.message);
  __fetchPort = null;
}

// Add window listener for Firefox iframe communication
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'RUN_TRANSLATOR_OFFSCREEN') {
    console.log('[Offscreen] window message RUN_TRANSLATOR_OFFSCREEN received');
    runTranslator(event.data.payload)
      .then(result => {
        try {
          event.source.postMessage({ type: 'OFFSCREEN_RESPONSE', response: { success: true, result } }, '*');
        } catch (e) { console.error('[Offscreen] Failed posting OFFSCREEN_RESPONSE to window', e); }
      })
      .catch(error => {
        try {
          event.source.postMessage({ type: 'OFFSCREEN_RESPONSE', response: { success: false, error: error.message || String(error) } }, '*');
        } catch (e) { console.error('[Offscreen] Failed posting OFFSCREEN_RESPONSE error to window', e); }
      });
  }
});

// Listen for translator execution requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message && message.type);

  if (message && message.type === 'RUN_TRANSLATOR_OFFSCREEN') {
    runTranslator(message.payload)
      .then(result => {
        console.log('[Offscreen] Translator completed, sending result');
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('[Offscreen] Translator error:', error);
        sendResponse({ success: false, error: error.message || String(error) });
      });

    return true; // Keep channel open for async response
  }
});

async function runTranslator({ translatorPath, htmlString, url }) {
  console.log('[Offscreen] Running translator, path:', translatorPath);
  
  // Parse the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  // Create ZU helper
  const ZU = {
    xpath: (d, xp) => {
      const resolver = doc.createNSResolver(doc.documentElement || doc);
      const result = doc.evaluate(xp, d || doc, resolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const out = [];
      for (let i = 0; i < result.snapshotLength; i++) out.push(result.snapshotItem(i));
      return out;
    },
    xpathText: (d, xp) => {
      try {
        const r = doc.evaluate(xp, d || doc, null, XPathResult.STRING_TYPE, null);
        return r.stringValue || '';
      } catch (e) { return ''; }
    },
    trimInternal: (s) => s ? s.replace(/\s+/g, ' ').trim() : s,
    text: (d, selector) => {
      const el = (d || doc).querySelector(selector);
      return el ? el.textContent.trim() : '';
    },
    requestDocument: async (u) => {
      const txt = await requestText(u);
      return new DOMParser().parseFromString(txt, 'text/html');
    },
    cleanISBN: (s) => {
      if (!s) return false;
      const digits = (s + '').replace(/[^0-9Xx]/g, '');
      return digits.length >= 10 ? digits : false;
    },
    cleanISSN: (s) => {
      if (!s) return false;
      const digits = (s + '').replace(/[^0-9Xx]/g, '');
      return digits.length === 8 ? digits : false;
    },
    doGet: async (u, callback, responseCharset, cookieSandbox) => {
      try {
        const absolute = new URL(u, url).href;
        const res = await fetch(absolute);
        const text = await res.text();
        const responseDoc = new DOMParser().parseFromString(text, 'text/html');
        if (callback) callback(text, responseDoc, u);
      } catch (e) {
        console.error('ZU.doGet failed:', e);
        if (callback) callback(null, null, u);
      }
    }
  };

  // Add logging around fetch proxy
  function logFetchProxy(absolute, response) {
    if (chrome && chrome.runtime && chrome.runtime.lastError) {
      console.error('[Offscreen] runtime.lastError during fetch proxy:', chrome.runtime.lastError.message);
    } else if (!response || !response.ok) {
      console.error('[Offscreen] background fetch failed:', absolute, response);
    }
  }

  // Minimal author name parser used by many translators. Returns a creator object.
  ZU.cleanAuthor = function(name, creatorType = 'author', preserveComma = false) {
    try {
      if (!name) return { lastName: '', firstName: '', creatorType };
      if (typeof name === 'object') {
        // Already parsed
        name.creatorType = name.creatorType || creatorType;
        return name;
      }
      let s = String(name).trim();
      // If preserveComma is true, do not split on comma? Many callers pass boolean as third arg meaning "isCorporate".
      // We'll interpret a truthy third arg as "do not guess corporate" and still split on comma.
      // Split "Last, First" format
      if (/,/.test(s)) {
        const parts = s.split(',');
        const last = parts.shift().trim();
        const first = parts.join(',').trim();
        return { lastName: last, firstName: first, creatorType };
      }
      // If there is a parentheses or brackets with roles, remove them
      s = s.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, '').trim();
      const parts = s.split(/\s+/);
      if (parts.length === 1) return { lastName: parts[0], firstName: '', creatorType };
      const last = parts.pop();
      const first = parts.join(' ');
      return { lastName: last, firstName: first, creatorType };
    } catch (e) {
      return { lastName: String(name), firstName: '', creatorType };
    }
  };
  
  // Create Zotero shim
  const Zotero = {
    _lastItem: null,
    debug: () => {}
  };

  // Minimal Zotero.Item constructor shim used by some translators
  // Support both `new Zotero.Item(type)` and `Zotero.Item(type)` usage.
  Zotero.Item = function(itemType) {
    if (!(this instanceof Zotero.Item)) return new Zotero.Item(itemType);
      // Add logging around fetch proxy
      const logFetchProxy = (absolute, response) => {
        if (chrome.runtime.lastError) {
          console.error('[Offscreen] runtime.lastError during fetch proxy:', chrome.runtime.lastError.message);
        } else if (!response || !response.ok) {
          console.error('[Offscreen] background fetch failed:', absolute, response);
        }
      };
    this.itemType = itemType || 'book';
    this.creators = [];
    this.attachments = [];
    this.notes = [];
    this.tags = [];
  };
  Zotero.Item.prototype.complete = function() {
    Zotero._lastItem = this;
  };

  // Provide a minimal loadTranslator implementation for import translators
  Zotero.loadTranslator = (type) => {
    if (type === 'import') {
      let storedString = null;
      let itemHandler = null;
      return {
        setTranslator: (id) => {},
        setString: (s) => { storedString = s; },
        setHandler: (name, handler) => { if (name === 'itemDone') itemHandler = handler; },
        translate: async () => {
          if (!itemHandler) return;
          try {
            const item = new Zotero.Item();
            item.title = storedString || '';
            item.DOI = '';
            item.journal = '';
            item.volume = '';
            item.issue = '';
            item.pages = '';
            item.year = '';
            item.abstractNote = '';
            item.url = '';
            item.attachments = [];
            item.notes = [];
            item.tags = [];
            item.complete();
            itemHandler(null, item);
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (e) {
            console.warn('itemDone error', e);
          }
        }
      };
    }
    return null;
  };
  
  const Z = { debug: () => {}, monitorDOMChanges: () => {}, getHiddenPref: () => false };
  
  const attr = (d, selector, name) => {
    try {
      const el = (d || doc).querySelector(selector);
      return el ? el.getAttribute(name) : '';
    } catch (e) { return ''; }
  };
  
  const text = (d, selector) => ZU.text(d, selector);
  
  const requestText = async (u, opts) => {
    const absolute = new URL(u, url).href;
    // Prefer proxying fetches through the background to avoid CSP/CORS issues
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        // Prefer using the persistent fetch port if available (avoids sendMessage races)
        if (__fetchPort) {
          return await new Promise((resolve, reject) => {
            const id = `${Date.now()}_${__fetchCounter++}`;
            __pendingFetches.set(id, { resolve, reject });
            try {
              __fetchPort.postMessage({ type: 'fetch', id, url: absolute });
            } catch (e) {
              __pendingFetches.delete(id);
              console.warn('[Offscreen] fetch port postMessage failed, falling back to sendMessage:', e && e.message);
              // Fall back to sendMessage path below
            }
            // Timeout fallback
            setTimeout(() => {
              if (__pendingFetches.has(id)) {
                __pendingFetches.delete(id);
                reject(new Error('Fetch via port timed out'));
              }
            }, 15000);
          }).catch(async (err) => {
            // If port-based fetch failed, try sendMessage then direct fetch
            console.warn('[Offscreen] port-based fetch failed, err:', err && err.message);
          });
        }

        return await new Promise((resolve, reject) => {
          try {
            console.log('[Offscreen] proxying fetch to background (sendMessage):', absolute);
            chrome.runtime.sendMessage({ action: 'fetch', url: absolute }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('[Offscreen] runtime.lastError during fetch proxy:', chrome.runtime.lastError.message);
                // If there's no receiver, fall back to direct fetch
                const lastErrMsg = chrome.runtime.lastError && chrome.runtime.lastError.message;
                if (lastErrMsg && lastErrMsg.includes('Receiving end does not exist')) {
                  console.log('[Offscreen] Falling back to direct fetch due to missing receiver:', absolute);
                  fetch(absolute, opts).then(async (r) => {
                    if (!r.ok) return reject(new Error(`HTTP ${r.status}`));
                    const txt = await r.text();
                    resolve(txt);
                  }).catch((fe) => {
                    console.error('[Offscreen] Direct fetch fallback failed:', fe && fe.message);
                    return reject(new Error(lastErrMsg || fe && fe.message || 'Fetch failed'));
                  });
                  return;
                }
                return reject(new Error(lastErrMsg || 'No response from runtime'));
              }
              if (!response || !response.ok) {
                console.error('[Offscreen] background fetch failed:', absolute, response);
                return reject(new Error(response?.error || `HTTP ${response?.status || 'error'}`));
              }
              resolve(response.text);
            });
          } catch (e) { console.error('[Offscreen] exception proxying fetch', e); reject(e); }
        });
    }
    const r = await fetch(absolute, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  };
  
  const requestDocument = async (u, opts) => {
    const txt = await requestText(u, opts);
    return new DOMParser().parseFromString(txt, 'text/html');
  };
  
  ZU.requestDocument = requestDocument;
  
  // Expose global shims expected by legacy translators
  window.ZU = ZU;
  window.Zotero = Zotero;
  window.Z = Z;
  window.attr = attr;
  window.text = text;
  window.requestText = requestText;
  window.requestDocument = requestDocument;
  window.location = { href: url };

  // Defensive fallback: ensure strToISO is present on ZU for translators
  if (!window.ZU.strToISO) {
    window.ZU.strToISO = function(s) {
      if (!s) return '';
      try {
        let str = String(s).trim();
        const yearMatch = str.match(/^\s*(\d{4})\s*$/);
        if (yearMatch) return `${yearMatch[1]}-01-01`;
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
        const monthNames = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
        const mMatch = str.toLowerCase().match(/(\b[a-z]{3,}\b)\s*(\d{4})/);
        if (mMatch && monthNames[mMatch[1].slice(0,3)]) {
          const mm = String(monthNames[mMatch[1].slice(0,3)]).padStart(2,'0');
          return `${mMatch[2]}-${mm}-01`;
        }
        return '';
      } catch (e) { return ''; }
    };
  }

  // Load translator script directly from extension URL (avoids blob/eval CSP issues)
  let candidate = translatorPath;
  if (!candidate.endsWith('.js')) candidate = candidate + '.js';
  if (!candidate.startsWith('translators/')) candidate = `translators/zotero/${candidate}`;
  const scriptUrl = chrome.runtime.getURL(candidate);
  console.log('[Offscreen] Loading translator script from:', scriptUrl);

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.onload = () => { resolve(); };
    script.onerror = (e) => { reject(new Error('Failed to load translator script from extension URL')); };
    document.head.appendChild(script);
  });

  console.log('[Offscreen] Translator script loaded, checking exports');

  const exports = {
    detectWeb: (typeof window.detectWeb === 'function') ? window.detectWeb : null,
    doWeb: (typeof window.doWeb === 'function') ? window.doWeb : null
  };
  
  if (!exports || typeof exports.detectWeb !== 'function') {
    throw new Error('Translator missing detectWeb');
  }
  
  let kind;
  try {
    kind = exports.detectWeb(doc, url);
    console.log('[Offscreen] detectWeb result:', kind);
  } catch (e) {
    console.error('[Offscreen] detectWeb threw error:', e);
    throw e;
  }
  
  if (kind === 'multiple') {
    throw new Error('Multiple items not supported');
  }
  
  if (typeof exports.doWeb !== 'function') {
    throw new Error('Translator missing doWeb');
  }
  
  // Run the translator
  try {
    await exports.doWeb(doc, url);
  } catch (e) {
    console.error('[Offscreen] doWeb threw error:', e);
    throw e;
  }
  
  console.log('[Offscreen] doWeb completed, checking _lastItem:', Zotero._lastItem);
  
  // Wait a bit for async operations
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Extract result
  const produced = Zotero._lastItem;
  
  let bibtex = '';
  if (produced) {
    console.log('[Offscreen] Produced item:', produced);
    // Check if title contains RIS data
    if (produced.title && /^TY\s+-\s+/m.test(produced.title)) {
      return { ris: produced.title, needsRisParsing: true };
    }
    
    const authors = (produced.creators || [])
      .filter(c => c.creatorType === 'author' || !c.creatorType)
      .map(c => {
        if (c.lastName && c.firstName) return `${c.lastName}, ${c.firstName}`;
        if (c.lastName) return c.lastName;
        return (c.firstName || '').trim();
      });
    
    const fields = [];
    if (authors.length) fields.push(`  author = {${authors.join(' and ')}}`);
    if (produced.title) fields.push(`  title = {${produced.title}}`);
    if (produced.journal) fields.push(`  journal = {${produced.journal}}`);
    if (produced.year) fields.push(`  year = {${produced.year}}`);
    if (produced.volume) fields.push(`  volume = {${produced.volume}}`);
    if (produced.issue) fields.push(`  number = {${produced.issue}}`);
    if (produced.pages) fields.push(`  pages = {${produced.pages}}`);
    if (produced.DOI) fields.push(`  doi = {${produced.DOI}}`);
    if (produced.abstractNote) fields.push(`  abstract = {${produced.abstractNote}}`);
    
    bibtex = `@article{item${Date.now()},\n${fields.join(',\n')}\n}`;
  } else {
    console.warn('[Offscreen] No item produced by translator');
  }
  
  return { bibtex, needsRisParsing: false };
}
