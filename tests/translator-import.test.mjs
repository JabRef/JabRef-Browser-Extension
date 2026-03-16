import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { setSandbox } from "../sources/sandbox.js";

const TRANSLATORS_DIR = path.resolve(process.cwd(), "translators", "zotero");
const translatorFiles = (await readdir(TRANSLATORS_DIR)).filter((name) => name.endsWith(".js"));
const EXPORT_CANDIDATES = [
  "detectWeb",
  "doWeb",
  "detectImport",
  "doImport",
  "detectSearch",
  "doSearch",
  "doExport",
];

// DOMParser is provided by the browser environment
// So we mock it here
globalThis.DOMParser = class {
  parseFromString() {
    return {};
  }
};

setSandbox({
  ZU: {
    cleanAuthor: (_) => { },
    fieldIsValidForType: (_) => true,
  },
  Zotero: {
    Item: class { },
  },
  requestJSON: async () => { },
  requestText: async () => { },
  text: () => "",
  attr: () => "",
});

describe("Zotero translator", () => {
  for (const filename of translatorFiles) {
    if (filename === "Bibliontology RDF.js") {
      // Currently fails, needs https://github.com/zotero/translators/pull/3594
      it.skip(`skips ${filename} due to known issues`, () => { });
      continue;
    }

    const filePath = path.join(TRANSLATORS_DIR, filename);
    const moduleUrl = pathToFileURL(filePath).href;
    it(`imports ${filename}`, async () => {
      await expect(import(moduleUrl)).resolves.toBeDefined();
    });

    it(`exports expected entry points for ${filename}`, async () => {
      const mod = await import(moduleUrl);
      const exportedEntryPoints = EXPORT_CANDIDATES.filter(
        (fnName) => typeof mod[fnName] === "function",
      );

      expect(exportedEntryPoints, `${filename} should export at least one entry point`).not.toBe(
        [],
      );
    });
  }
});
