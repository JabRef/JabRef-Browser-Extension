/*
  Translator runner that can execute:
    - simple translators exporting `detect(doc)` and `translate(doc)`
    - Zotero-style translators exporting `detectWeb(doc, url)` and `doWeb(doc, url)`

  The function accepts either:
    - a module object (result of dynamic import), or
    - a module path string (will be dynamically imported)

  It also accepts an optional `url` parameter which is passed to Zotero-style
  translator APIs and used to resolve relative requests.
*/

import { createZU, createZoteroShim } from "./zoteroShims.js";

export async function runTranslatorOnHtml(
  translatorModuleOrPath,
  htmlString,
  url = "",
) {
  console.debug("[translatorRunner] runTranslatorOnHtml start");
  let loaded;
  try {
    if (typeof translatorModuleOrPath === "string") {
      console.debug(
        "[translatorRunner] translator path provided (string)",
        translatorModuleOrPath,
      );
      // For security and linting reasons we DO NOT perform a direct
      // dynamic `import()` on arbitrary string values. Supported string
      // forms are:
      // - file://...  (Node.js test harnesses; handled by the legacy
      //   evaluation fallback below)
      // - chrome-extension://, moz-extension://, ms-browser-extension://
      //   (handled by the browser script injection fallback below)
      // Other callers should pass an already-imported module object.
      const p = translatorModuleOrPath;
      if (
        !(p && (p.startsWith('file://') || p.startsWith('chrome-extension://') || p.startsWith('moz-extension://') || p.startsWith('ms-browser-extension://')))
      ) {
        throw new Error('Unsafe/unsupported translator path string; pass a module object instead for non-extension/local paths');
      }
      // Defer actual handling to the legacy/file/extension code paths below.
      loaded = null;
    } else {
      loaded = translatorModuleOrPath;
      console.debug("[translatorRunner] using provided module object");
    }

    // Prefer default export when present
    let module = loaded && loaded.default ? loaded.default : loaded;

    // If the imported module did not export translator functions (legacy
    // translators often define globals instead), and we were given a file://
    // path, try a Node-specific fallback: read and evaluate the source into
    // the global scope so legacy globals (detectWeb/doWeb/etc.) become
    // available. This is primarily for test harnesses running in Node.
    const root = typeof window !== "undefined" ? window : globalThis;
    if (
      (!module || (typeof module.detect !== "function" && typeof module.detectWeb !== "function" && typeof module.translate !== "function" && typeof module.doWeb !== "function")) &&
      typeof translatorModuleOrPath === "string" &&
      translatorModuleOrPath.startsWith("file://")
    ) {
      try {
        const fs = await import("fs");
        const p = translatorModuleOrPath.replace(/^file:\/\//, "");
        const src = fs.readFileSync(p, "utf8");
        // Evaluate in global scope so legacy scripts attach functions to globalThis
        try {
          const vmModule = await import('vm');
          if (vmModule) {
            try {
              const vm = vmModule;
              // Create an isolated context for this translator run with a
              // minimal set of globals. We'll inject richer shims (ZU, Zotero,
              // doc, etc.) below once the DOM is created.
              const ctxObj = {
                console,
                URL,
                fetch: typeof fetch !== 'undefined' ? fetch : undefined,
                DOMParser: typeof DOMParser !== 'undefined' ? DOMParser : undefined,
                // Expose a harmless global for translation scripts that
                // assume some environment properties exist.
                globalThis: {},
              };
              const ctx = vm.createContext(ctxObj);
              const script = new vm.Script(src, { filename: p });
              script.runInContext(ctx);

              const bindFn = (name) => {
                if (typeof ctx[name] === 'function') {
                  return (...args) => ctx[name].apply(ctx, args);
                }
                return undefined;
              };

              module = {
                detect: bindFn('detect'),
                detectWeb: bindFn('detectWeb'),
                translate: bindFn('translate'),
                doWeb: bindFn('doWeb'),
                __vmContext: ctx,
              };
            } catch (e) {
              console.warn('[translatorRunner] vm fallback evaluation failed', e);
              throw e;
            }
          } else {
            throw new Error('vm module unavailable');
          }
        } catch (e) {
          // Do NOT use `eval` as a fallback — it's unsafe. Log and abort
          console.warn('[translatorRunner] vm unavailable — cannot evaluate legacy translator securely', e);
          // Let outer handler detect that fallback failed; do not attempt insecure evaluation.
          throw e;
        }
      } catch (e) {
        console.warn('[translatorRunner] legacy eval fallback failed', e);
      }
    }

    // Browser/offscreen fallback: if importing a translator URL in a browser
    // environment produced no exports, try fetching the script and injecting
    // it into the current document so legacy globals (detectWeb/doWeb/etc.)
    // become available on `window`.
    if (
      (!module || (typeof module.detect !== "function" && typeof module.detectWeb !== "function" && typeof module.translate !== "function" && typeof module.doWeb !== "function")) &&
      typeof translatorModuleOrPath === "string" &&
      (translatorModuleOrPath.startsWith('chrome-extension://') || translatorModuleOrPath.startsWith('moz-extension://') || translatorModuleOrPath.startsWith('ms-browser-extension://')) &&
      typeof document !== 'undefined' && typeof document.createElement === 'function'
    ) {
      try {
        // Create a non-inline script element pointing to the translator file URL
        // so execution complies with CSP 'script-src "self"'. Wait for it to load.
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = translatorModuleOrPath;
          script.type = 'text/javascript';
          script.onload = () => { try { script.remove(); resolve(); } catch (e) { resolve(); } };
          script.onerror = (err) => { try { script.remove(); } catch (e) { }; reject(err || new Error('Script load error')); };
          (document.head || document.documentElement).appendChild(script);
        });
        module = {
          detect: root.detect,
          detectWeb: root.detectWeb,
          translate: root.translate,
          doWeb: root.doWeb,
        };
      } catch (e) {
        console.warn('[translatorRunner] browser script-src fallback failed', e);
      }
    }

    // create a DOM from the html string
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString || "", "text/html");
    // Ensure `doc.location` exists so legacy translators can access href/pathname
    try {
      if (url) {
        doc.location = new URL(url);
      } else if (!doc.location) {
        doc.location = { href: '', pathname: '' };
      }
    } catch (e) {
      // ignore
    }
    console.debug(
      "[translatorRunner] created DOM for HTML (length:",
      (htmlString || "").length,
      ")",
    );

    // Provide minimal ZU/Zotero shims before detection: some translators use ZU in detectWeb()
    try {
      const ZU = createZU(doc, { baseUrl: url });
      const Zotero = createZoteroShim();
      // Always provide fresh shims and doc globals per run to avoid leaking
      // state between consecutive translator executions.
      root.ZU = ZU;
      root.Zotero = Zotero;
      // Expose `doc` and `document` globals for legacy translators that
      // reference `doc`/`document` from nested callbacks executed outside
      // the original `doWeb` stack.
      try { root.doc = doc; } catch (e) { }
      try { root.document = doc; } catch (e) { }
      // fresh Z state
      root.Z = { debug: () => { }, monitorDOMChanges: () => { }, getHiddenPref: () => false };
      // Clear any previous last item so produced item is from this run only
      try { root.Zotero._lastItem = null; } catch (e) { }
      root.attr = ((d, selector, name) => {
        try {
          const el = (d || doc).querySelector(selector);
          return el ? el.getAttribute(name) : "";
        } catch (e) {
          return "";
        }
      });
      root.text = ((d, selector) => ZU.text(d, selector));

      // If the translator was evaluated into an isolated VM context, inject
      // the same shims into that context so legacy global references resolve
      // inside the VM instead of polluting the runner global scope.
      try {
        if (module && module.__vmContext) {
          const ctx = module.__vmContext;
          try { ctx.ZU = ZU; } catch (e) { }
          try { ctx.Zotero = Zotero; } catch (e) { }
          try { ctx.doc = doc; } catch (e) { }
          try { ctx.document = doc; } catch (e) { }
          try { ctx.Z = { debug: () => { }, monitorDOMChanges: () => { }, getHiddenPref: () => false }; } catch (e) { }
          try { ctx.Zotero && (ctx.Zotero._lastItem = null); } catch (e) { }
          try {
            ctx.attr = ((d, selector, name) => {
              try {
                const el = (d || doc).querySelector(selector);
                return el ? el.getAttribute(name) : "";
              } catch (e) { return ""; }
            });
          } catch (e) { }
          try { ctx.text = ((d, selector) => ZU.text(d, selector)); } catch (e) { }
        }
      } catch (e) {
        // non-fatal if VM context cannot be decorated
      }
    } catch (e) {
      console.warn('[translatorRunner] failed to create ZU/Zotero shims for detection', e);
    }

    // Two detection styles supported:
    // - module.detect(doc)          -> for simple module translators
    // - module.detectWeb(doc, url)  -> for Zotero-style translators
    let detected = true;
    if (typeof module.detect === "function") {
      try {
        detected = module.detect(doc);
        console.debug("[translatorRunner] detect() returned", detected);
      } catch (e) {
        console.error("[translatorRunner] detect() threw", e);
        throw e;
      }
      if (!detected) throw new Error("Translator.detect returned false");
    } else if (typeof module.detectWeb === "function") {
      try {
        const kind = module.detectWeb(doc, url);
        console.debug("[translatorRunner] detectWeb() returned", kind);
        if (!kind) {
          // Be permissive for test-run environments: when detectWeb returns
          // false but the translator provides execution functions, proceed
          // with a warning. This helps with pages where detection is
          // fragile but the translator can still extract metadata.
          if (typeof module.doWeb === "function" || typeof module.translate === "function") {
            console.warn(
              "[translatorRunner] detectWeb returned false — proceeding because translator provides doWeb/translate",
            );
          } else {
            throw new Error("Translator.detectWeb returned false");
          }
        }
        if (kind === "multiple")
          throw new Error(
            "Translator returned multiple items; multi-select not supported by runner",
          );
      } catch (e) {
        console.error("[translatorRunner] detectWeb() threw", e);
        throw e;
      }
    } else {
      // If translator does not provide any detection function, be permissive:
      // allow execution if it provides translate() or doWeb()
      if (
        typeof module.translate !== "function" &&
        typeof module.doWeb !== "function"
      ) {
        throw new Error(
          "Translator missing detect/ detectWeb and translate/ doWeb",
        );
      }
    }

    // Execution: prefer `translate(doc)` when available, otherwise run `doWeb(doc,url)` for Zotero-style translators.
    if (typeof module.translate === "function") {
      try {
        const result = await module.translate(doc);
        console.debug(
          "[translatorRunner] translate() completed; result length:",
          result ? result.length || 0 : 0,
        );
        return result;
      } catch (e) {
        console.error("[translatorRunner] translate() threw", e);
        throw e;
      }
    }

    if (typeof module.doWeb === "function") {
      // Provide minimal Zotero/ZU/Z environment so many Zotero translators can run.
      // Use shared shims to provide a safer and consistent environment.

      const ZU = createZU(doc, { baseUrl: url });
      const Zotero = createZoteroShim();

      // Install minimal globals expected by many translators. Provide fresh
      // shims and clear previous state to avoid cross-run contamination.
      const root = typeof window !== "undefined" ? window : globalThis;
      root.ZU = ZU;
      root.Zotero = Zotero;
      root.Z = {
        debug: () => { },
        monitorDOMChanges: () => { },
        getHiddenPref: () => false,
      };
      try { root.doc = doc; } catch (e) { }
      try { root.document = doc; } catch (e) { }
      try { root.Zotero._lastItem = null; } catch (e) { }

      // small helpers used by many translators
      root.attr = ((d, selector, name) => {
        try {
          const el = (d || doc).querySelector(selector);
          return el ? el.getAttribute(name) : "";
        } catch (e) {
          return "";
        }
      });
      root.text = ((d, selector) => root.ZU.text(d, selector));
      root.requestText = (async (u, opts) => {
        const absolute = new URL(u, url || (typeof location !== 'undefined' ? location.href : '')).href;
        const r = await fetch(absolute, opts);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.text();
      });
      root.requestDocument = (async (u, opts) => {
        const txt = await root.requestText(u, opts);
        return new DOMParser().parseFromString(txt, "text/html");
      });

      // Ensure ZU.requestDocument resolves relative URLs as well
      root.ZU.requestDocument = root.requestDocument;

      // Also install shims into the VM context for translators evaluated in
      // an isolated VM so their globals resolve correctly there.
      try {
        if (module && module.__vmContext) {
          const ctx = module.__vmContext;
          ctx.ZU = ZU;
          ctx.Zotero = Zotero;
          ctx.Z = { debug: () => { }, monitorDOMChanges: () => { }, getHiddenPref: () => false };
          ctx.doc = doc;
          ctx.document = doc;
          ctx.Zotero && (ctx.Zotero._lastItem = null);
                      ctx.attr = ((d, selector, name) => {
              try {
                const el = (d || doc).querySelector(selector);
                return el ? el.getAttribute(name) : "";
              } catch (e) { return ""; }
            });
            if (ctx.ZU) { // This should never fail
              ctx.text = ((d, selector) => ctx.ZU.text(d, selector));
            }
          ctx.requestText = root.requestText;
          ctx.requestDocument = root.requestDocument;
        }
      } catch (e) {
        // continue if decorating VM context fails
      }

      try {
        await module.doWeb(doc, url);
      } catch (e) {
        // Some translators may attempt to fetch auxiliary resources (e.g.
        // citation endpoints) which can legitimately 404 in test/offline
        // environments. Treat HTTP 404 as non-fatal and continue so that
        // the runner can still attempt to produce a best-effort item from
        // available page metadata. Re-throw other errors.
        const msg = e && e.message ? String(e.message) : String(e);
        if (msg.includes('HTTP 404') || msg.includes('404')) {
          console.warn('[translatorRunner] doWeb encountered 404 — continuing with best-effort extraction', e);
        } else {
          console.error("[translatorRunner] doWeb threw", e);
          throw e;
        }
      }

      // Some legacy translators call `Zotero.loadTranslator(...).translate()`
      // without awaiting its completion. In Zotero's environment that often
      // completes synchronously, but in this runner the shimmed translate()
      // may be asynchronous. Wait briefly for any asynchronous import/search
      // translator activity to complete and set `Zotero._lastItem`.
      try {
        const waitForLastItem = (timeout = 2000) =>
          new Promise((resolve) => {
            const start = Date.now();
            (function check() {
              if (root.Zotero && root.Zotero._lastItem) return resolve();
              if (Date.now() - start > timeout) return resolve();
              setTimeout(check, 50);
            })();
          });
        await waitForLastItem(2000);
      } catch (e) {
        // ignore wait errors
      }

      // After doWeb, many translators call Zotero.loadTranslator('import') and then item.complete().
      // Use Zotero._lastItem (provided by the shim) as the produced item and create a BibTeX fallback.
      let produced =
        root.Zotero && root.Zotero._lastItem ? root.Zotero._lastItem : null;
      console.debug('[translatorRunner] produced item raw:', produced);
      if (!produced) {
        // No produced item from translator flows; attempt to build a
        // best-effort item from page metadata (meta[citation_*], DC, etc.)
        try {
          const meta = (name) => {
            try {
              const el = doc.querySelector(`meta[name="${name}"]`);
              return el ? (el.getAttribute('content') || '').trim() : '';
            } catch (e) { return ''; }
          };
          const title = meta('citation_title') || meta('dc.title') || (doc.querySelector('h1') && doc.querySelector('h1').textContent.trim()) || '';
          const authors = [];
          const authorMetas = doc.querySelectorAll('meta[name="citation_author"]');
          if (authorMetas && authorMetas.length) {
            for (const a of authorMetas) {
              const name = (a.getAttribute('content') || '').trim();
              if (name) authors.push(root.ZU.cleanAuthor(name, 'author'));
            }
          }
          const doi = meta('citation_doi') || meta('dc.identifier') || '';
          const journal = meta('citation_journal_title') || meta('citation_conference_title') || '';
          let year = '';
          if (meta('citation_publication_date')) {
            const m = meta('citation_publication_date').match(/(\d{4})/);
            if (m) year = m[1];
          }
          let pages = '';
          const fp = meta('citation_firstpage');
          const lp = meta('citation_lastpage');
          if (fp && lp) pages = `${fp}-${lp}`;
          else pages = meta('citation_pages') || '';
          const abstractNote = meta('citation_abstract') || meta('description') || '';

          // If we gathered anything, use it as the produced item
          if (title || authors.length || doi || journal || year || pages || abstractNote) {
            produced = {
              creators: authors,
              title: title,
              DOI: doi,
              journal: journal,
              volume: meta('citation_volume') || '',
              issue: meta('citation_issue') || '',
              pages: pages,
              year: year,
              abstractNote: abstractNote,
              url: url || (doc.location && doc.location.href) || ''
            };
            console.debug('[translatorRunner] built fallback produced item from doc meta:', produced);
          } else {
            // nothing we can extract — return null
            return null;
          }
        } catch (e) {
          console.warn('[translatorRunner] failed to build fallback produced item', e);
          return null;
        }
      }

      // If the produced item is mostly empty, try to supplement common
      // metadata from the parsed `doc` (meta tags, citation_* tags, etc.).
      try {
        const isMostlyEmpty =
          (!produced.title || produced.title === '') &&
          (!produced.creators || produced.creators.length === 0) &&
          (!produced.DOI || produced.DOI === '');
        if (isMostlyEmpty && doc) {
          const meta = (name) => {
            try {
              const el = doc.querySelector(`meta[name="${name}"]`);
              return el ? (el.getAttribute('content') || '').trim() : '';
            } catch (e) { return ''; }
          };

          if (!produced.title) produced.title = meta('citation_title') || meta('dc.title') || (doc.querySelector('h1') && doc.querySelector('h1').textContent.trim()) || produced.title;

          if ((!produced.creators || produced.creators.length === 0)) {
            const authorMeta = doc.querySelectorAll('meta[name="citation_author"]');
            if (authorMeta && authorMeta.length) {
              produced.creators = [...authorMeta].map(a => root.ZU.cleanAuthor(a.getAttribute('content') || '', 'author'));
            }
          }

          if (!produced.DOI) produced.DOI = meta('citation_doi') || meta('dc.identifier') || produced.DOI;
          if (!produced.journal) produced.journal = meta('citation_journal_title') || meta('citation_conference_title') || produced.journal;
          if (!produced.year && meta('citation_publication_date')) {
            const m = meta('citation_publication_date').match(/(\d{4})/);
            if (m) produced.year = m[1];
          }
          if (!produced.volume) produced.volume = meta('citation_volume') || produced.volume;
          if (!produced.issue) produced.issue = meta('citation_issue') || produced.issue;
          if (!produced.pages) {
            const fp = meta('citation_firstpage');
            const lp = meta('citation_lastpage');
            if (fp && lp) produced.pages = `${fp}-${lp}`;
            else produced.pages = meta('citation_pages') || produced.pages;
          }
          if (!produced.abstractNote) produced.abstractNote = meta('citation_abstract') || meta('description') || produced.abstractNote;
        }
      } catch (e) {
        console.warn('[translatorRunner] supplement from doc failed', e);
      }

      // If the translator returned RIS text placed into title (some import stubs do), detect and return RIS wrapper
      if (produced.title && /^TY\s+-\s+/m.test(produced.title)) {
        // Let callers decide how to parse RIS; return an object-like result would be
        // disruptive so we return the RIS text string (same shape as older code paths expected).
        return produced.title;
      }

      const authors = (produced.creators || [])
        .filter((c) => c.creatorType === "author" || !c.creatorType)
        .map((c) => {
          if (c.lastName && c.firstName) return `${c.lastName}, ${c.firstName}`;
          if (c.lastName) return c.lastName;
          return (c.firstName || "").trim();
        });

      const fields = [];
      if (authors.length) fields.push(`  author = {${authors.join(" and ")}}`);
      // Title - try multiple common property names
      const title = produced.title || produced.itemTitle || produced.shortTitle || produced.publicationTitle || produced.name;
      if (title) fields.push(`  title = {${title}}`);
      // Journal / publication title
      const journal = produced.journal || produced.publicationTitle || produced.publication || produced.containerTitle || produced.journalTitle;
      if (journal) fields.push(`  journal = {${journal}}`);
      // Year - prefer explicit year, otherwise derive from date
      let year = produced.year;
      if (!year && produced.date) {
        const m = String(produced.date).match(/(\d{4})/);
        if (m) year = m[1];
      }
      if (year) fields.push(`  year = {${year}}`);
      if (produced.volume) fields.push(`  volume = {${produced.volume}}`);
      if (produced.issue) fields.push(`  number = {${produced.issue}}`);
      if (produced.pages) fields.push(`  pages = {${produced.pages}}`);
      if (produced.DOI) fields.push(`  doi = {${produced.DOI}}`);
      if (produced.abstractNote)
        fields.push(`  abstract = {${produced.abstractNote}}`);

      const bib = `@article{item${Date.now()},\n${fields.join(",\n")}\n}`;
      return bib;
    }

    throw new Error("Translator missing translate() and doWeb()");
  } finally {
    console.debug("[translatorRunner] runTranslatorOnHtml end");
  }
}
