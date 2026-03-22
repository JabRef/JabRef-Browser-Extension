import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Place source files in the `src` directory
  // https://wxt.dev/guide/essentials/project-structure.html#adding-a-src-directory
  srcDir: "src",
  targetBrowsers: ["chrome", "firefox", "opera", "edge"],
  manifestVersion: 3,
  manifest: {
    browser_specific_settings: {
      gecko: {
        id: "@jabfox",
        // @ts-expect-error - https://github.com/wxt-dev/wxt/issues/1975
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    commands: {
      _execute_page_action: {
        suggested_key: {
          default: "Alt+Shift+J",
        },
      },
    },
    description:
      "The JabRef browser extension imports new bibliographic information directly from the browser into JabRef.",
    developer: {
      name: "JabRef",
      url: "http://www.jabref.org/",
    },
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
      "<all_urls>",
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
  hooks: {
    "build:manifestGenerated": (wxt, manifest) => {
      if (wxt.config.browser === "firefox") {
        manifest.page_action = {
          default_popup: "popup.html",
          default_icon: {
            "16": "JabRef-icon-16.png",
            "48": "JabRef-icon-48.png",
            "128": "JabRef-icon-128.png",
          },
          default_title: "Import references into JabRef",
        };
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
