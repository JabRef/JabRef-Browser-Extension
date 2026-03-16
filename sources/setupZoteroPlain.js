globalThis.Zotero = {
  isConnector: true,
  isBrowserExt: true,
  logError: console.error,
  debug: console.debug,
  Prefs: {
    get(key) {
      switch (key) {
        case "automaticSnapshots":
          return false;
        case "downloadAssociatedFiles":
          return false;
        case "reportTranslationFailure":
          return true;
        default:
          throw new Error(`Unknown preference ${key}`);
      }
    },
  },
  Utilities: {},
  isManifestV3: true,
  Connector_Browser: {
    setKeepServiceWorkerAlive(_val) {
      // No-op in this context
    },
  },
};

globalThis.OS = {
  Path: {
    basename: (path) => path.split(/[\\/]/).pop(),
  },
};
