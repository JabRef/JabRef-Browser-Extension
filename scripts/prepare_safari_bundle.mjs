import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, ".output", "safari-mv3");
const targetDir = path.join(root, "dist", "safari-mv3");

await fs.rm(targetDir, { recursive: true, force: true });
await fs.cp(sourceDir, targetDir, { recursive: true });

const manifestPath = path.join(targetDir, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

delete manifest.key;
delete manifest.browser_specific_settings;
delete manifest.content_scripts;
if (Array.isArray(manifest.permissions)) {
  manifest.permissions = manifest.permissions.filter((permission) => permission !== "offscreen");
}

const backgroundHtmlPath = path.join(targetDir, "background.html");
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

manifest.background = {
  page: "background.html",
};

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
