import fs from "node:fs";
import path from "node:path";
import { addPublicAssets, defineWxtModule } from "wxt/modules";

export default defineWxtModule({
  name: "copy-translators",
  setup(wxt) {
    const sourceDir = path.resolve(wxt.config.root, "translators", "zotero");
    const stagedAssetsDir = path.resolve(wxt.config.wxtDir, "copy-translators-assets");
    const stagedTranslatorsDir = path.resolve(stagedAssetsDir, "translators");

    if (!fs.existsSync(sourceDir)) {
      wxt.logger.warn("Translators directory not found:", sourceDir);
      return;
    }

    fs.rmSync(stagedAssetsDir, { recursive: true, force: true });
    fs.mkdirSync(stagedTranslatorsDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

      const sourceFile = path.join(sourceDir, entry.name);
      const stagedFile = path.join(stagedTranslatorsDir, entry.name);
      fs.copyFileSync(sourceFile, stagedFile);
    }

    addPublicAssets(wxt, stagedAssetsDir);
  },
});
