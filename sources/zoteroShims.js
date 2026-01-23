// Shared Zotero shims and helper functions extracted to reduce duplication
// Used by both the offscreen runner and the legacy adapter.
//
// Exports:
// - createZU(doc): returns a ZU-like helper object bound to `doc`
// - createZoteroShim(): returns a minimal Zotero shim with `loadTranslator` support
// - bibtexToItem(bibtex): converts a minimal BibTeX string into a Zotero-like item
//
// Note: This module keeps implementations intentionally small and defensive to
// work inside both offscreen pages and other contexts where `fetch`/DOM APIs exist.

export function bibtexToItem(bibtex) {
  const item = {
    creators: [],
    title: '',
    DOI: '',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    year: '',
    abstractNote: '',
    url: ''
  };

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
        const sp = a.split(' ').filter(Boolean);
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

export function createZU(doc, { baseUrl } = {}) {
  // Create a small ZU helper bound to the provided document.
  // baseUrl is used to resolve relative requests from requestText/requestDocument.
  const resolveUrl = (u) => {
    try {
      if (!u) return u;
      return new URL(u, baseUrl || (doc && doc.location && doc.location.href) || undefined).href;
    } catch (e) {
      try { return new URL(u, location.href).href; } catch (ee) { return u; }
    }
  };

  return {
    xpath: (d, xp) => {
      const resolver = {
        lookupNamespaceURI: (prefix) => {
          try {
            return (doc.documentElement && doc.documentElement.lookupNamespaceURI(prefix)) ||
              (doc.lookupNamespaceURI && doc.lookupNamespaceURI(prefix)) || null;
          } catch (e) { return null; }
        }
      };
      const result = doc.evaluate(xp, d || doc, resolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const out = [];
      for (let i = 0; i < result.snapshotLength; i++) out.push(result.snapshotItem(i));
      return out;
    },

    xpathText: (d, xp) => {
      try {
        const resolver = {
          lookupNamespaceURI: (prefix) => {
            try { return (doc.documentElement && doc.documentElement.lookupNamespaceURI(prefix)) || (doc.lookupNamespaceURI && doc.lookupNamespaceURI(prefix)) || null; } catch (e) { return null; }
          }
        };
        const r = doc.evaluate(xp, d || doc, resolver, XPathResult.STRING_TYPE, null);
        return r.stringValue || '';
      } catch (e) { return ''; }
    },

    trimInternal: (s) => s ? s.replace(/\s+/g, ' ').trim() : s,

    text: (d, selector) => {
      const el = (d || doc).querySelector(selector);
      try { return el ? (el.textContent || '').trim() : ''; } catch (e) { return ''; }
    },

    // Basic requestDocument which uses fetch and DOMParser; resolves relative URLs
    requestDocument: async (u, opts) => {
      const absolute = resolveUrl(u);
      const r = await fetch(absolute, opts);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = await r.text();
      return new DOMParser().parseFromString(txt, 'text/html');
    },

    // Minimal ISBN/ISSN cleaners used by some translators
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

    // Small utility to perform a GET and invoke a callback (zimilar to ZU.doGet)
    doGet: async (u, callback) => {
      try {
        const absolute = resolveUrl(u);
        const res = await fetch(absolute);
        const text = await res.text();
        const responseDoc = new DOMParser().parseFromString(text, 'text/html');
        if (callback) callback(text, responseDoc, u);
      } catch (e) {
        if (callback) callback(null, null, u);
      }
    },

    // Provide a sensible fallback for translators expecting this helper
    strToISO: (s) => {
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
    },

    // Helper to parse a simple author string into Zotero creator object
    cleanAuthor: (name, creatorType = 'author') => {
      try {
        if (!name) return { lastName: '', firstName: '', creatorType };
        if (typeof name === 'object') {
          name.creatorType = name.creatorType || creatorType;
          return name;
        }
        let s = String(name).trim();
        if (/,/.test(s)) {
          const parts = s.split(',');
          const last = parts.shift().trim();
          const first = parts.join(',').trim();
          return { lastName: last, firstName: first, creatorType };
        }
        s = s.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, '').trim();
        const parts = s.split(/\s+/).filter(Boolean);
        if (parts.length === 1) return { lastName: parts[0], firstName: '', creatorType };
        const last = parts.pop();
        const first = parts.join(' ');
        return { lastName: last, firstName: first, creatorType };
      } catch (e) {
        return { lastName: String(name), firstName: '', creatorType };
      }
    }
  };
}

// Create a minimal Zotero shim suitable for running legacy import translators.
// The shim focuses on providing `loadTranslator('import')` and capturing the
// produced item via `item.complete()` so callers can retrieve Zotero._lastItem.
export function createZoteroShim() {
  const Zotero = {
    _lastItem: null,
    debug: () => {},
    // loadTranslator supports 'import' translators and a minimal 'search' translator
    loadTranslator: (type) => {
      if (type === 'import') {
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
              let bib = storedString;
              if (storedString && /^TY {2}- /m.test(storedString)) {
                try {
                  const risMod = await import('./ris.js');
                  if (risMod && typeof risMod.parseRisToBib === 'function') {
                    bib = risMod.parseRisToBib(storedString);
                  }
                } catch (e) {
                  // ignore
                }
              }
              const baseItem = bib ? bibtexToItem(bib) : { title: storedString || '', creators: [] };
              let resolveComplete;
              const completePromise = new Promise((res) => { resolveComplete = res; });
              const item = Object.assign({}, baseItem, {
                attachments: [], notes: [], tags: [],
                complete: () => { Zotero._lastItem = item; resolveComplete(item); }
              });
              try {
                itemHandler(null, item);
              } catch (e) {
                console.warn('itemDone handler threw', e);
                // If the translator's item handler throws, ensure we still
                // expose the produced item so the runner can continue. Some
                // translators call out to complementing functions that expect
                // globals not present in the test runner; fall back to using
                // the base item parsed from the import string.
                Zotero._lastItem = item;
                try { resolveComplete(item); } catch (ee) {}
              }
              const timeout = new Promise((res) => setTimeout(res, 1000));
              await Promise.race([completePromise, timeout]);
              return;
            } catch (e) { console.warn('Legacy translator translate() error', e); }
          }
        };
      }

      if (type === 'search') {
        let translatorId = null;
        let searchObj = null;
        const handlers = {};
        return {
          setTranslator: (id) => { translatorId = id; },
          setSearch: (obj) => { searchObj = obj; },
          setHandler: (name, handler) => { handlers[name] = handler; },
          translate: async () => {
            try {
              if (searchObj && searchObj.DOI) {
                const doi = String(searchObj.DOI).trim();
                try {
                  const res = await fetch('https://doi.org/' + encodeURIComponent(doi), { headers: { Accept: 'application/vnd.citationstyles.csl+json, application/json' } });
                  if (res && res.ok) {
                    const json = await res.json();
                    const item = {
                      itemType: json.type || 'journalArticle',
                      creators: (json.author || []).map(a => ({ lastName: a.family || '', firstName: a.given || '', creatorType: 'author' })),
                      title: json.title || '', volume: json.volume || '', issue: json.issue || json['issue-number'] || '',
                      pages: json.page || json.pages || '',
                      date: json.issued && json.issued['date-parts'] && json.issued['date-parts'][0] ? String(json.issued['date-parts'][0][0]) : '',
                      ISSN: (json.ISSN && json.ISSN[0]) || '', publicationTitle: json['container-title'] || '', DOI: json.DOI || doi
                    };
                    if (typeof handlers.itemDone === 'function') handlers.itemDone(null, item);
                  }
                } catch (e) { /* ignore DOI resolution errors */ }
              }
              if (typeof handlers.done === 'function') handlers.done();
            } catch (e) { if (typeof handlers.error === 'function') handlers.error(e); }
          }
        };
      }

      return null;
    }
  };

  // Provide a minimal Item constructor to match common translator usage;
  // callers (like offscreen) may override Zotero.Item with their own implementation.
  Zotero.Item = function(itemType) {
    if (!(this instanceof Zotero.Item)) return new Zotero.Item(itemType);
    this.itemType = itemType || 'book';
    this.creators = [];
    this.attachments = [];
    this.notes = [];
    this.tags = [];
  };
  Zotero.Item.prototype.complete = function() {
    Zotero._lastItem = this;
  };

  return Zotero;
}
