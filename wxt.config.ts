import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["wxt-module-safari-xcode"],
  // Place source files in the `src` directory
  // https://wxt.dev/guide/essentials/project-structure.html#adding-a-src-directory
  srcDir: "src",
  targetBrowsers: ["chrome", "firefox", "opera", "edge", "safari"],
  manifestVersion: 3,
  safariXcode: {
    projectName: "JabRef Browser Extension",
    appCategory: "public.app-category.productivity",
    bundleIdentifier: "org.jabref.JabRef-Browser-Extension",
    outputPath: "dist/safari",
    projectType: "macos",
    openProject: false,
  },
  manifest: {
    browser_specific_settings: {
      gecko: {
        id: "@jabfox",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Alt+Shift+J",
        },
      },
    },
    description:
      "The JabRef browser extension imports new bibliographic information directly from the browser into JabRef.",
    homepage_url: "http://www.jabref.org/",
    host_permissions: ["<all_urls>"],
    icons: {
      "16": "/JabRef-icon-16.png",
      "48": "/JabRef-icon-48.png",
      "96": "/JabRef-icon-96.png",
      "128": "/JabRef-icon-128.png",
    },
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAimiMLZZCsf+p92UUzQRWYljtoUk0a9AuN+D3TJTFcm1BEDXKIDVmWG20S4yLQyYs8kWao3eTSdYykgsZLPtay1pFKtoM4csGB6sEOO+h25Nv/AU7pN5yH5PqcTIGkuH6AsQQQTPS1Y+vDfz+548oVXzK033l6ernhKRj4dngueZyQX89U38zkorq0/PPWfE8ppPzXiWo1Pn5C5scgzaHSfavIkbBpWuiJw6moSoYw4UxzmU6FmzjM/c8Ags/QPU/8M3BeC1eigStifBDkuIIDQtMtiTXEgCqHjIacB3uB7SJKL+0wsoREqoz3cX7uNLnB+DKu+s0OZKVah8gkliBLQIDAQAB",
    name: "JabRef Browser Extension",
    permissions: [
      "scripting",
      "activeTab",
      "tabs",
      "storage",
      "nativeMessaging",
      "offscreen",
      "webRequest",
      "declarativeNetRequest",
    ],
    web_accessible_resources: [
      {
        matches: ["<all_urls>"],
        resources: ["sandbox.js", "translators/*.js"],
      },
    ],
  },
  webExt: {
    openDevtools: true,
    startUrls: [
      "https://ieeexplore.ieee.org/abstract/document/893874",
      "https://arxiv.org/a/diez_t_1.html",
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
