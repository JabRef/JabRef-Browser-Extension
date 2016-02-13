var self = require('sdk/self');
const {
  Cc, Ci, Cu
} = require("chrome");

var Zotero = Cc["@zotero.org/Zotero;1"].getService(Ci.nsISupports).wrappedJSObject;

var buttons = require('sdk/ui/button/action');
var tabs = require("sdk/tabs");
var tab_utils = require("sdk/tabs/utils");
var utils = require('sdk/window/utils');
var {
  viewFor
} = require("sdk/view/core");
var preferences = require("sdk/simple-prefs").prefs;

// Add import button to Firefox toolbar.
var importButton = buttons.ActionButton({
  id: "import-button",
  label: "Import references into JabRef",
  icon: {
    "16": "./JabRef-icon-16.png",
    "48": "./JabRef-icon-48.png"
  },
  onClick: handleImportClick,
});

/*
 * Get the underlying document of the tab.
 */
function getDocumentForTab(tab) {
  var lowLevelTab = viewFor(tab);

  // Get the ContentDocument of the tab
  var browser = tab_utils.getBrowserForTab(lowLevelTab);
  return browser.contentDocument;
}

/*
 * Import items found on the present website.
 */
function handleImportClick(state) {
  // Get active tab
  var activeTab = tabs.activeTab;
  var doc = getDocumentForTab(activeTab);

  // Detect reference items
  startImport(doc);
}

/*
 * Sends all the contained reference items in doc to JabRef.
 */
function startImport(doc) {
  /*if (!(doc instanceof HTMLDocument))
    return;
  if (doc.documentURI.startsWith("about:"))
    return;
*/
  // Search for translators
  var translate = new Zotero.Translate.Web();
  translate.setDocument(doc);
  translate.setHandler("translators", function(obj, item) {
    searchAndExportReferenceItems(obj, item)
  });
  // false = only return one translator
  translate.getTranslators(false);
}

/*
 * Called when a translator search initiated with Zotero.Translate.getTranslators() is completed. Uses the found translator to search for items and export them.
 */
function searchAndExportReferenceItems(translate, translators) {
  var items = [];
  translate.setTranslator(translators[0]);
  translate.clearHandlers("itemDone");
  translate.clearHandlers("done");
  translate.setHandler("itemDone", function(obj, dbItem, item) {
    items.push(dbItem);
  });
  translate.setHandler("done", function() {
    exportItems(items);
  });

  translate.translate();
  //translate.translate(false); // this would not save the items to the database
}

/*
 * Exports the given items to JabRef.
 */
function exportItems(items) {
  var copyItems = items.slice(0);
  if (items.length <= 0)
    return;

  // Create a new temporary file
  var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("TmpD", Ci.nsIFile);
  file.append("zotero_export.bib");
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);

  var exportTranslator = new Zotero.Translate.Export();
  //exportTranslator.setTranslator('9cb70025-a888-4a29-a210-93ec52da40d4'); // BibTeX
  exportTranslator.setTranslator('b6e39b57-8942-4d11-8259-342c46ce395f'); // BibLaTeX
  //exportTranslator.setItems([dbItem]);
  exportTranslator.setItems(items);
  exportTranslator.setLocation(file);

  exportTranslator.clearHandlers("done");
  exportTranslator.setHandler("done", function(obj, returnValue) {
    importIntoJabRef(file);
  });

  exportTranslator.translate();
  // translate() deletes items array this is why we use the cloned array here
  deleteItemsFromZoteroDatabase(copyItems);
}

/*
 * Imports the given bib file into JabRef.
 */
function importIntoJabRef(file) {
  var jabRef = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
  var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
  var jabRefPath = preferences.jabRefPath;
  jabRef.initWithPath(jabRefPath);
  //jabRef.initWithPath("C:\\Program Files (x86)\\JabRef\\JabRef.exe");
  //jabRef.initWithPath("C:\\Windows\\notepad.exe");
  process.init(jabRef);

  var args = ["--importToOpen", file.path];
  //var args = [file.path];
  process.run(false, args, args.length);
}

/*
 * Delete items from Zotero db.
 */
function deleteItemsFromZoteroDatabase(items) {
  for (i = 0; i < items.length; i++) {
    Zotero.Items.erase(items[i].id);
  }
}

/*
 * Listen for tab content loads.
 */
tabs.on('ready', function(tab) {
  var doc = getDocumentForTab(tab);

  // Search for translators
  var translate = new Zotero.Translate.Web();
  translate.setDocument(doc);
  translate.setHandler("translators", function(obj, translators) {
    if (!translators.length) {
      // No translators found, so disable button
      importButton.state(tab, {
        disabled: true,
        // We have to change the icon to gray since disabled=true does not gray-out the button (this is a bug https://bugzilla.mozilla.org/show_bug.cgi?id=1167559)
        icon: {
          "16": "./JabRef-icon-16-gray.png",
          "48": "./JabRef-icon-48-gray.png"
        },
        label: "Import references into JabRef: no references found on website."
      });
    } else {
      // Translators found, so update label
      importButton.state(tab, {
        label: "Import references into JabRef using " + translators[0].label
      });
    }
  });
  translate.getTranslators(false);
});
