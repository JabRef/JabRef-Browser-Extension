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
        "[translatorRunner] importing module",
        translatorModuleOrPath,
      );
      loaded = await import(translatorModuleOrPath);
    } else {
      loaded = translatorModuleOrPath;
      console.debug("[translatorRunner] using provided module object");
    }

    // Prefer default export when present
    const module = loaded && loaded.default ? loaded.default : loaded;

    // create a DOM from the html string
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString || "", "text/html");
    console.debug(
      "[translatorRunner] created DOM for HTML (length:",
      (htmlString || "").length,
      ")",
    );

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
        if (!kind) throw new Error("Translator.detectWeb returned false");
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

      // Install minimal globals expected by many translators. We avoid overwriting
      // existing globals if present in the environment.
      const root = typeof window !== "undefined" ? window : globalThis;
      root.ZU = root.ZU || ZU;
      root.Zotero = root.Zotero || Zotero;
      root.Z = root.Z || {
        debug: () => {},
        monitorDOMChanges: () => {},
        getHiddenPref: () => false,
      };

      // small helpers used by many translators
      root.attr =
        root.attr ||
        ((d, selector, name) => {
          try {
            const el = (d || doc).querySelector(selector);
            return el ? el.getAttribute(name) : "";
          } catch (e) {
            return "";
          }
        });
      root.text = root.text || ((d, selector) => root.ZU.text(d, selector));
      root.requestText =
        root.requestText ||
        (async (u, opts) => {
          const absolute = new URL(u, url || location.href).href;
          const r = await fetch(absolute, opts);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.text();
        });
      root.requestDocument =
        root.requestDocument ||
        (async (u, opts) => {
          const txt = await root.requestText(u, opts);
          return new DOMParser().parseFromString(txt, "text/html");
        });

      // Ensure ZU.requestDocument resolves relative URLs as well
      if (!root.ZU.requestDocument)
        root.ZU.requestDocument = root.requestDocument;

      try {
        await module.doWeb(doc, url);
      } catch (e) {
        console.error("[translatorRunner] doWeb threw", e);
        throw e;
      }

      // After doWeb, many translators call Zotero.loadTranslator('import') and then item.complete().
      // Use Zotero._lastItem (provided by the shim) as the produced item and create a BibTeX fallback.
      const produced =
        root.Zotero && root.Zotero._lastItem ? root.Zotero._lastItem : null;
      if (!produced) {
        // no produced item — return null to indicate nothing extracted
        return null;
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
      if (produced.title) fields.push(`  title = {${produced.title}}`);
      if (produced.journal) fields.push(`  journal = {${produced.journal}}`);
      if (produced.year) fields.push(`  year = {${produced.year}}`);
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
