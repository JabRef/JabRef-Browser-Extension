import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const projectDir = path.join(root, "dist", "safari");
const targetSwiftPath = path.join(projectDir, "JabRef Browser Extension Extension", "SafariWebExtensionHandler.swift");
const sourceSwiftPath = path.join(root, "scripts", "SafariWebExtensionHandler.swift");

await fs.copyFile(sourceSwiftPath, targetSwiftPath);
