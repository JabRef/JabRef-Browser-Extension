import fs from "node:fs/promises";
import path from "node:path";
import { defineWxtModule } from "wxt/modules";

export default defineWxtModule({
  name: "jabref-safari-xcode",
  setup(wxt) {
    if (wxt.config.browser !== "safari") {
      return;
    }

    wxt.hook("build:done", async () => {
      const root = wxt.config.root;
      const projectDir = path.join(root, "dist", "safari");
      const targetSwiftPath = path.join(
        projectDir,
        "JabRef Browser Extension Extension",
        "SafariWebExtensionHandler.swift",
      );
      const sourceSwiftPath = path.join(root, "scripts", "SafariWebExtensionHandler.swift");

      await fs.copyFile(sourceSwiftPath, targetSwiftPath);
    });
  },
});
