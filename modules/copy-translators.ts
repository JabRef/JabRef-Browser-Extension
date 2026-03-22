import fs from "node:fs";
import path from "node:path";
import { addPublicAssets, defineWxtModule } from "wxt/modules";

const SOURCE_SANDBOX_IMPORT = "../../sources/sandbox.js";
const OUTPUT_SANDBOX_IMPORT = "/sandbox.js";

export default defineWxtModule({
  name: "copy-translators",
  setup(wxt) {
    const sourceDir = path.resolve(wxt.config.root, "translators", "zotero");
    // const sandboxPath = path.resolve(wxt.config.root, "src", "utils", "sandbox.js");
    const stagedAssetsDir = path.resolve(wxt.config.wxtDir, "copy-translators-assets");
    const stagedTranslatorsDir = path.join(stagedAssetsDir, "translators");
    const stagedSourcesDir = path.join(stagedAssetsDir, "sources");

    if (!fs.existsSync(sourceDir)) {
      wxt.logger.warn("Translators directory not found:", sourceDir);
      return;
    }

    // if (!fs.existsSync(sandboxPath)) {
    //   wxt.logger.warn("Sandbox file not found:", sandboxPath);
    //   return;
    // }

    fs.rmSync(stagedAssetsDir, { recursive: true, force: true });
    fs.mkdirSync(stagedTranslatorsDir, { recursive: true });
    fs.mkdirSync(stagedSourcesDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

      const sourceFile = path.join(sourceDir, entry.name);
      const stagedFile = path.join(stagedTranslatorsDir, entry.name);
      const text = fs
        .readFileSync(sourceFile, "utf-8")
        .replaceAll(SOURCE_SANDBOX_IMPORT, OUTPUT_SANDBOX_IMPORT);

      fs.writeFileSync(stagedFile, text, "utf-8");
    }

    // fs.copyFileSync(sandboxPath, path.join(stagedSourcesDir, "sandbox.js"));

    addPublicAssets(wxt, stagedAssetsDir);
  },
});
