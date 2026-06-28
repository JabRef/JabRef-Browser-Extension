import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const projectDir = path.join(root, "dist", "safari");
const targetSwiftPath = path.join(
  projectDir,
  "JabRef Browser Extension Extension",
  "SafariWebExtensionHandler.swift",
);
const sourceSwiftPath = path.join(root, "scripts", "SafariWebExtensionHandler.swift");
const pbxprojPath = path.join(projectDir, "JabRef Browser Extension.xcodeproj", "project.pbxproj");

const BACKGROUND_HTML_FILE_REF = "9A0F0E0D0C0B0A0908070605";
const BACKGROUND_HTML_BUILD_FILE = "9A0F0E0D0C0B0A0908070606";

await fs.copyFile(sourceSwiftPath, targetSwiftPath);

let pbxproj = await fs.readFile(pbxprojPath, "utf8");

if (!pbxproj.includes("/* background.html */")) {
  pbxproj = pbxproj.replace(
    "/* End PBXBuildFile section */",
    `\t\t${BACKGROUND_HTML_BUILD_FILE} /* background.html in Resources */ = {isa = PBXBuildFile; fileRef = ${BACKGROUND_HTML_FILE_REF} /* background.html */; };\n/* End PBXBuildFile section */`,
  );

  pbxproj = pbxproj.replace(
    "/* End PBXFileReference section */",
    `\t\t${BACKGROUND_HTML_FILE_REF} /* background.html */ = {isa = PBXFileReference; lastKnownFileType = text.html; name = background.html; path = "../../safari-mv3/background.html"; sourceTree = "<group>"; };\n/* End PBXFileReference section */`,
  );

  pbxproj = pbxproj.replace(
    /(\t\t\t\t[A-F0-9]+ \/\* offscreen\.html \*\/,\n)(\t\t\t\t[A-F0-9]+ \/\* background\.js \*\/,)/,
    `$1\t\t\t\t${BACKGROUND_HTML_FILE_REF} /* background.html */,\n$2`,
  );

  pbxproj = pbxproj.replace(
    /(\t\t\t\t[A-F0-9]+ \/\* offscreen\.html in Resources \*\/,\n)(\t\t\t\t[A-F0-9]+ \/\* popup\.html in Resources \*\/,)/,
    `$1\t\t\t\t${BACKGROUND_HTML_BUILD_FILE} /* background.html in Resources */,\n$2`,
  );

  await fs.writeFile(pbxprojPath, pbxproj);
}
