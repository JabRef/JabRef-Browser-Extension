import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { setSandbox } from "../sources/sandbox.js";

const TRANSLATORS_DIR = path.resolve(process.cwd(), "translators", "zotero");
const translatorFiles = (await readdir(TRANSLATORS_DIR)).filter((name) => name.endsWith(".js"));

setSandbox({
  ZU: {
    cleanAuthor: (_) => {},
    fieldIsValidForType: (_) => true,
  },
  Zotero: {
    Item: class {},
  },
  requestJSON: async () => {},
  requestText: async () => {},
  text: () => "",
  attr: () => "",
  DOMParser: class {
    parseFromString() {
      return {};
    }
  },
});

describe("Zotero translator", () => {
  for (const filename of translatorFiles) {
    it(`imports ${filename}`, async () => {
      const filePath = path.join(TRANSLATORS_DIR, filename);
      const moduleUrl = pathToFileURL(filePath).href;

      await expect(import(moduleUrl)).resolves.toBeDefined();
    });
  }
});
