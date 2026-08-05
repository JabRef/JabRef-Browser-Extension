import fs from "node:fs/promises";
import path from "node:path";
import { defineWxtModule } from "wxt/modules";

export default defineWxtModule({
  name: "jabref-safari-prepare",
  setup(wxt) {
    if (wxt.config.browser !== "safari") {
      return;
    }

    wxt.hook("build:done", async () => {
      const root = wxt.config.root;
      const safariBundleDir = path.join(root, ".output", `safari-mv${wxt.config.manifestVersion}`);
      const stagedSafariBundleDir = path.join(
        root,
        "dist",
        `safari-mv${wxt.config.manifestVersion}`,
      );
      const manifestPath = path.join(safariBundleDir, "manifest.json");
      const backgroundHtmlPath = path.join(safariBundleDir, "background.html");

      // Safari requires a background page and rejects these Chromium/Firefox-only entries.
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

      delete manifest.key;
      delete manifest.browser_specific_settings;
      delete manifest.content_scripts;
      if (Array.isArray(manifest.permissions)) {
        manifest.permissions = manifest.permissions.filter(
          (permission: string) => permission !== "offscreen",
        );
      }

      manifest.background = {
        page: "background.html",
      };

      const backgroundHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Background</title>
  </head>
  <body>
    <script type="module" src="./background.js"></script>
  </body>
</html>
`;

      await fs.writeFile(backgroundHtmlPath, backgroundHtml);
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await fs.rm(stagedSafariBundleDir, { recursive: true, force: true });
      await fs.cp(safariBundleDir, stagedSafariBundleDir, {
        recursive: true,
      });
    });
  },
});
