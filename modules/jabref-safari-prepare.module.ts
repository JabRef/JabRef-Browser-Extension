import fs from "node:fs/promises";
import path from "node:path";
import { defineWxtModule } from "wxt/modules";

export default defineWxtModule({
  name: "jabref-safari-prepare",
  async setup(wxt) {
    if (wxt.config.browser !== "safari") {
      return;
    }

    const configuredSafariOutputPath =
      wxt.config.safariXcode?.outputPath ??
      `.output/${wxt.config.safariXcode?.projectName ?? wxt.config.manifest.name ?? "safari-xcode"}`;
    const configuredSafariOutputDir = path.join(wxt.config.root, configuredSafariOutputPath);
    await fs.rm(configuredSafariOutputDir, {
      recursive: true,
      force: true,
    });
    await fs.mkdir(path.dirname(configuredSafariOutputDir), {
      recursive: true,
    });

    const stagedSafariBundleDir = path.join(
      wxt.config.root,
      "dist",
      `safari-mv${wxt.config.manifestVersion}`,
    );
    await fs.rm(stagedSafariBundleDir, {
      recursive: true,
      force: true,
    });

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
      await fs.cp(safariBundleDir, stagedSafariBundleDir, {
        recursive: true,
      });
    });
  },
});
