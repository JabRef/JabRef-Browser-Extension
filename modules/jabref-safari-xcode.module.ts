import fs from "node:fs/promises";
import path from "node:path";
import { defineWxtModule } from "wxt/modules";

export default defineWxtModule({
  name: "jabref-safari-xcode",
  setup(wxt) {
    if (wxt.config.browser !== "safari") {
      return;
    }

    const sourceSwiftPath = path.join(wxt.config.root, "scripts", "SafariWebExtensionHandler.swift");
    const targetSwiftPath = path.join(
      wxt.config.root,
      "dist",
      "safari",
      "JabRef Browser Extension Extension",
      "SafariWebExtensionHandler.swift",
    );

    wxt.hook("build:done", () => fs.copyFile(sourceSwiftPath, targetSwiftPath));
  },
});
