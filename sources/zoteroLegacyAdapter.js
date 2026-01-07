// Adapter to run a limited subset of Zotero legacy translators without
// modifying the upstream translator file. This provides minimal shims for
// Zotero.loadTranslator(import) to capture RIS text and convert it to a
// BibTeX string using the existing RIS parser in ./ris.js.

function bibtexToItem(bibtex) {
  const item = { creators: [], title: '', DOI: '', journal: '', volume: '', issue: '', pages: '', year: '', abstractNote: '', url: '' };
  const fieldRe = /([a-zA-Z0-9_]+)\s*=\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = fieldRe.exec(bibtex)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'title') item.title = val;
    else if (key === 'author') {
      const authors = val.split(/\s+and\s+/i).map(s => s.trim());
      item.creators = authors.map(a => {
        const parts = a.split(',').map(p => p.trim());
        if (parts.length === 2) return { lastName: parts[0], firstName: parts[1], creatorType: 'author' };
        const sp = a.split(' ');
        return { firstName: sp.slice(0, -1).join(' '), lastName: sp.slice(-1)[0], creatorType: 'author' };
      });
    }
    else if (key === 'doi') item.DOI = val;
    else if (key === 'journal' || key === 'journaltitle') item.journal = val;
    else if (key === 'volume') item.volume = val;
    else if (key === 'number' || key === 'issue') item.issue = val;
    else if (key === 'pages') item.pages = val;
    else if (key === 'year') item.year = val;
    else if (key === 'abstract') item.abstractNote = val;
    else if (key === 'url') item.url = val;
  }
  return item;
}

function simpleText(node) {
  return node ? node.textContent.trim() : '';
}

function createZU(doc) {
  return {
    xpath: (d, xp) => {
      const resolver = doc.createNSResolver(doc.documentElement || doc);
      const result = doc.evaluate(xp, d || doc, resolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const out = [];
      for (let i = 0; i < result.snapshotLength; i++) out.push(result.snapshotItem(i));
      return out;
    },
    xpathText: (d, xp) => {
      const nodes = (typeof d === 'string') ? (doc.evaluate(d, doc, null, XPathResult.STRING_TYPE, null).stringValue) : '';
      try {
        const r = doc.evaluate(xp, d || doc, null, XPathResult.STRING_TYPE, null);
        return r.stringValue || '';
      } catch (e) { return ''; }
    },
    trimInternal: (s) => s ? s.replace(/\s+/g, ' ').trim() : s,
    text: (d, selector) => {
      const el = (d || doc).querySelector(selector);
      return el ? simpleText(el) : '';
    },
    requestDocument: async (url) => {
      const res = await fetch(url);
      const txt = await res.text();
      const p = new DOMParser();
      return p.parseFromString(txt, 'text/html');
    }
  };
}

export async function runLegacyTranslatorFromFile(translatorPath, htmlString, url) {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
    throw new Error('chrome.runtime.getURL is not available');
  }

  // Normalize translator path
  let candidate = translatorPath;
  if (!candidate.endsWith('.js')) candidate = candidate + '.js';
  if (!candidate.startsWith('translators/')) {
    candidate = `translators/zotero/${candidate}`;
  }

  const isChrome = typeof chrome !== 'undefined' && !!chrome.offscreen;

  if (isChrome) {
    // --- CHROME PATH: Offscreen API ---
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run legacy Zotero translator code'
      });
    } catch (e) { /* Document exists */ }

    const response = await chrome.runtime.sendMessage({
      type: 'RUN_TRANSLATOR_OFFSCREEN',
      payload: { translatorPath: candidate, htmlString, url }
    });
    return await handleAdapterResponse(response);
  } else {
    // --- FIREFOX PATH: Hidden Iframe (Sandbox) ---
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('offscreen.html');
      iframe.style.display = 'none';

      const cleanup = () => {
        window.removeEventListener('message', messageHandler);
        if (iframe.parentNode) document.body.removeChild(iframe);
      };

      const messageHandler = async (event) => {
        // Only listen for messages from our iframe
        if (event.data && event.data.type === 'OFFSCREEN_RESPONSE') {
          cleanup();
          try {
            const result = await handleAdapterResponse(event.data.response);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        }
      };

      window.addEventListener('message', messageHandler);
      document.body.appendChild(iframe);

      // Once loaded, tell the iframe to run the translator
      iframe.onload = () => {
        iframe.contentWindow.postMessage({
          type: 'RUN_TRANSLATOR_OFFSCREEN',
          payload: { translatorPath: candidate, htmlString, url }
        }, '*');
      };
    });
  }
}

async function handleAdapterResponse(response) {
  if (!response || !response.success) {
    console.error('[Adapter] Offscreen response error:', response);
    throw new Error(response?.error || 'Translator execution failed');
  }
  const result = response.result;
  if (result.needsRisParsing && result.ris) {
    const risMod = await import('./ris.js');
    return risMod.parseRisToBib(result.ris);
  }
  return result.bibtex;
}

// Fetch a translator file (packaged in the extension) and parse its leading
// commented JSON header (the header was converted to a /* ... */ comment
// by the import script). Returns the parsed object or null.
export async function getTranslatorHeader(translatorPath) {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
    throw new Error('chrome.runtime.getURL is not available');
  }

  let candidate = translatorPath;
  if (!candidate.endsWith('.js')) candidate = candidate + '.js';
  if (!candidate.startsWith('translators/')) candidate = `translators/zotero/${candidate}`;
  const url = chrome.runtime.getURL(candidate);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch translator ${candidate}: HTTP ${res.status}`);
  const text = await res.text();

  // Look for the first /* ... */ block and try to parse JSON inside.
  const m = text.match(/\/\*([\s\S]*?)\*\//);
  if (!m) return null;
  const inner = m[1].trim();
  try {
    const obj = JSON.parse(inner);
    return obj;
  } catch (e) {
    // not JSON — some translators may include extra comments; try to strip leading // lines
    const cleaned = inner.split('\n').map(l => l.replace(/^\s*\/\//, '')).join('\n');
    try { return JSON.parse(cleaned); } catch (e2) { return null; }
  }
}

export async function runLegacyTranslator(codeOrModule, htmlString, url, sourcePath = '') {
  // parse page HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const ZU = createZU(doc);

  // simple Zotero shim that captures import translator usage
  const Zotero = {
    debug: () => {},
    loadTranslator: (type) => {
      if (type === 'import') {
        // translator stub with capture of produced item via item.complete()
        let translatorId = null;
        let storedString = null;
        let itemHandler = null;
        return {
          setTranslator: (id) => { translatorId = id; },
          setString: (s) => { storedString = s; },
          setHandler: (name, handler) => { if (name === 'itemDone') itemHandler = handler; },
          translate: async () => {
            if (!itemHandler) return;
            try {
              // If the translator provided RIS text in storedString, parse to BibTeX and then to item
              let bib = storedString;
              if (storedString && /^TY  - /m.test(storedString)) {
                // RIS text — use our RIS parser to convert to BibTeX
                try {
                  const risMod = await import('./ris.js');
                  bib = risMod.parseRisToBib(storedString);
                } catch (e) {
                  bib = storedString; // fallback
                }
              }

              // Convert BibTeX to an item-like object and provide a complete() hook
              const baseItem = bib ? bibtexToItem(bib) : { title: '', creators: [] };
              let resolveComplete;
              const completePromise = new Promise((res) => { resolveComplete = res; });

              const item = Object.assign({}, baseItem, {
                attachments: [],
                notes: [],
                tags: [],
                complete: () => { Zotero._lastItem = item; resolveComplete(item); }
              });

              // invoke translator's itemDone handler; translator will usually call item.complete()
              try {
                itemHandler(null, item);
              } catch (e) {
                // handler may mutate item and call complete; continue
                console.warn('itemDone handler threw', e);
              }

              // wait for item.complete() to be called (or timeout)
              const timeout = new Promise((res) => setTimeout(res, 1000));
              await Promise.race([completePromise, timeout]);
              return;
            } catch (e) {
              console.warn('Legacy translator translate() error', e);
            }
          }
        };
      }
      // Unknown translator types not supported in this shim
      return null;
    }
  };

  // Provide minimal global helpers expected by many Zotero translators
  const sandbox = { Zotero, ZU, doc, window: {}, location: { href: url } };

  // Obtain translator exports either from an imported module or by evaluating
  // the legacy translator source string.
  let exports;
  if (typeof codeOrModule === 'object' && codeOrModule !== null) {
    // Imported module — translators may export functions directly or as default
    // Provide global shims expected by many Zotero translators so their top-level
    // code can reference `ZU`, `Zotero`, `Z`, and helper functions like
    // `attr`, `text`, `requestDocument`, and `requestText`.
    const root = (typeof window !== 'undefined') ? window : globalThis;
    root.ZU = createZU(doc);
    root.Zotero = Zotero;
    root.Z = {
      debug: () => {},
      monitorDOMChanges: () => {},
      getHiddenPref: () => false
    };
    // Small helper shims
    root.attr = (d, selector, name) => {
      try {
        const el = (d || doc).querySelector(selector);
        return el ? el.getAttribute(name) : '';
      } catch (e) { return ''; }
    };
    root.text = (d, selector) => root.ZU.text(d, selector);
    root.requestText = async (u, opts) => {
      // Resolve relative URLs against the page URL passed to the adapter
      const absolute = new URL(u, url).href;
      const r = await fetch(absolute, opts);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    };
    root.requestDocument = async (u, opts) => {
      const txt = await root.requestText(u, opts);
      const p = new DOMParser();
      return p.parseFromString(txt, 'text/html');
    };
    // Ensure ZU.requestDocument also resolves relative URLs
    root.ZU.requestDocument = root.requestDocument;
    // Minimal validators used by some translators
    root.ZU.cleanISBN = (s) => {
      if (!s) return false;
      const digits = (s + '').replace(/[^0-9Xx]/g, '');
      return digits.length >= 10 ? digits : false;
    };
    root.ZU.cleanISSN = (s) => {
      if (!s) return false;
      const digits = (s + '').replace(/[^0-9Xx]/g, '');
      return digits.length === 8 ? digits : false;
    };

    exports = codeOrModule.default || codeOrModule;
  }
  else if (typeof codeOrModule === 'string') {
    const code = codeOrModule;
    // Evaluate translator code in a function scope with the sandbox available
    // NOTE: this uses the Function constructor and may violate CSP (unsafe-eval).
    const wrapper = new Function('Zotero', 'ZU', 'doc', 'window', 'location', `${code}; return { detectWeb: typeof detectWeb !== 'undefined' ? detectWeb : null, doWeb: typeof doWeb !== 'undefined' ? doWeb : null };`);

    try {
      exports = wrapper(Zotero, ZU, doc, sandbox.window, sandbox.location);
    } catch (e) {
      throw new Error('Failed to evaluate translator: ' + e.message);
    }
  } else {
    throw new Error('Unsupported translator source type');
  }

  if (!exports || typeof exports.detectWeb !== 'function') throw new Error('Translator missing detectWeb');

  const kind = exports.detectWeb(doc, url);

  if (kind === 'multiple') {
    // Not supported by this simple runner
    throw new Error('Translator returned multiple items; multi-select not supported by adapter');
  }

  if (typeof exports.doWeb !== 'function') throw new Error('Translator missing doWeb');

  // run the translator's doWeb which should call Zotero.loadTranslator('import') and trigger our stub
  await exports.doWeb(doc, url);
  // If the translator produced an item via our stub, prefer it
  const produced = Zotero._lastItem || null;
  if (produced) {
    const authors = (produced.creators || []).filter(c => c.creatorType === 'author' || !c.creatorType).map(c => {
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

    const bib = `@article{adapter${Date.now()},\n${fields.join(',\n')}\n}`;
    return bib;
  }

  // Our stub invokes itemHandler synchronously/async; we don't have a direct bib, but
  // the translate path calls the itemHandler which we used to populate a lastItem
  // For simplicity, attempt to extract metadata from the page directly as a fallback
  function extractMetadata(doc, url) {
    const meta = (name) => {
      const el = doc.querySelector(`meta[name="${name}"]`);
      return el ? el.content.trim() : '';
    };

    const title = meta('citation_title') || ZU.text(doc, 'h1 > .title-text') || ZU.text(doc, 'h1') || ZU.xpathText(doc, '//title') || '';

    const authors = [];
    doc.querySelectorAll('meta[name="citation_author"]').forEach(m => {
      if (m.content && m.content.trim()) authors.push(m.content.trim());
    });

    // fallback: try structured author nodes used on ScienceDirect
    if (!authors.length) {
      doc.querySelectorAll('.author-group .author, .author .name').forEach(el => {
        const txt = simpleText(el);
        if (txt) authors.push(txt);
      });
    }

    const journal = meta('citation_journal_title') || meta('citation_title') || '';
    const volume = meta('citation_volume') || '';
    const issue = meta('citation_issue') || meta('citation_number') || '';
    const first = meta('citation_firstpage') || '';
    const last = meta('citation_lastpage') || '';
    const pages = first && last ? `${first}--${last}` : (meta('citation_pages') || '');
    const doi = meta('citation_doi') || meta('dc.Identifier') || '';
    const abs = meta('citation_abstract') || meta('description') || '';
    const date = meta('citation_publication_date') || meta('citation_date') || '';
    let year = '';
    if (date) {
      const m = date.match(/(\d{4})/);
      if (m) year = m[1];
      else year = date;
    }

    return { title, authors, journal, volume, issue, pages, doi, abs, year };
  }

  const md = extractMetadata(doc, url);
  const bibFields = [];
  if (md.authors && md.authors.length) bibFields.push(`  author = {${md.authors.join(' and ')}}`);
  if (md.title) bibFields.push(`  title = {${md.title}}`);
  if (md.journal) bibFields.push(`  journal = {${md.journal}}`);
  if (md.year) bibFields.push(`  year = {${md.year}}`);
  if (md.volume) bibFields.push(`  volume = {${md.volume}}`);
  if (md.issue) bibFields.push(`  number = {${md.issue}}`);
  if (md.pages) bibFields.push(`  pages = {${md.pages}}`);
  if (md.doi) bibFields.push(`  doi = {${md.doi}}`);
  if (md.abs) bibFields.push(`  abstract = {${md.abs}}`);

  const bib = `@article{adapter${Date.now()},\n${bibFields.join(',\n')}\n}`;
  return bib;
}
