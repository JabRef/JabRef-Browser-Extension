var self = require('sdk/self');
const {
	Cc,
	Ci,
	Cu
} = require("chrome");

var Zotero = Cc["@zotero.org/Zotero;1"].getService(Ci.nsISupports).wrappedJSObject;

var buttons = require('sdk/ui/button/action');
var tabs = require("sdk/tabs");
var tab_utils = require("sdk/tabs/utils");
var utils = require('sdk/window/utils');
var {
	viewFor
} = require("sdk/view/core");
var {
	setTimeout
} = require("sdk/timers");
var preferences = require("sdk/simple-prefs").prefs;


/*
 * Add import button to Firefox toolbar.
 */
var importButton = buttons.ActionButton({
	id: "import-button",
	label: "Import references into JabRef",
	icon: {
		"16": "./JabRef-icon-16.png",
		"32": "./JabRef-icon-32.png",
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

	// Create and show panel
	var panel = require("sdk/panel").Panel({
		width: 330,
		height: 150,
		contentURL: "./progressPanel.html"
	});
	panel.port.on('winsize', function(data) {
		panel.resize(330, data.height);
	});
	panel.show({
		position: importButton
	});

	if (activeTab.contentType == "application/pdf") {
		startPdfImport(activeTab.url, panel);
	} else {
		// Detect and import bibliographic items
		startImport(doc, panel);
	}
}

/*
 * Detects contained bibliographic items and sends them to JabRef.
 */
function startImport(doc, panel) {
	// Set preference for taking automatic snapshots of the website when creating an item
	Zotero.Prefs.set("automaticSnapshots", preferences.takeAutomaticSnapshots);

	// Look for translators which are able to handle the current website
	var translate = new Zotero.Translate.Web();
	translate.setDocument(doc);
	translate.setHandler("translators", function(obj, item) {
		detectAndExportReferenceItems(obj, item, panel)
	});

	translate.getTranslators(false); // false = return only the first translator
}

/*
 * Called when a translator is found (search initiated by Zotero.Translate.getTranslators()).
 * Uses the translator to search for bibliographic items and export them.
 */
function detectAndExportReferenceItems(translate, translators, panel) {
	var items = [];
	translate.setTranslator(translators[0]);

	translate.clearHandlers("itemDone");
	translate.clearHandlers("done");
	translate.clearHandlers("attachmentProgress");

	translate.setHandler("itemDone", function(obj, dbItem, item) {
		// Prepare attachment data
		var attachments = [];
		for (var i = item.attachments.length - 1; i >= 0; i--) {
			attachments.push({
				attachmentId: JSON.stringify(item.attachments[i]).hashCode(),
				title: item.attachments[i].title,
				imageSrc: Zotero.Utilities.determineAttachmentIcon(item.attachments[i]),
			});
		};
		var finishedItem = {
			title: item.title,
			attachments: attachments,
			imageSrc: Zotero.ItemTypes.getImageSrc(item.itemType)
		};
		// Pass parsed item to progress window
		panel.port.emit("show", finishedItem);

		// Remember that this item was finished 
		items.push(dbItem);
	});

	translate.setHandler("done", function() {
		// Translation is done, so export the discovered items
		exportItems(items);

		// Hide panel in 1 sec
		setTimeout(function() {
			panel.hide();
		}, 1000);
	});

	translate.setHandler("attachmentProgress", function(obj, attachment, progress, error) {
		// Notify progress window about the attachment download
		panel.port.emit("updateProgress", {
			attachmentId: JSON.stringify(attachment).hashCode(),
			progress: progress
		});
	});

	// Run translator
	translate.translate();
	//translate.translate(false); // this would not save the items to the zotero database
}

/*
 * Exports the given items to JabRef.
 */
function exportItems(items) {
	if (items.length <= 0)
		return;

	// translate() deletes items array; this is why we save a cloned array here
	var copyItems = items.slice(0);

	// Create a new temporary file
	var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("TmpD", Ci.nsIFile);
	file.append("zotero_export.bib");
	file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);

	// Prepare export
	var exportTranslator = new Zotero.Translate.Export();

	if (preferences.exportMode == 0) {
		exportTranslator.setTranslator('b6e39b57-8942-4d11-8259-342c46ce395f'); // BibLaTeX
	} else {
		exportTranslator.setTranslator('9cb70025-a888-4a29-a210-93ec52da40d4'); // BibTeX
	}
	exportTranslator.setItems(items);
	exportTranslator.setLocation(file);

	exportTranslator.clearHandlers("done");
	exportTranslator.setHandler("done", function(obj, returnValue) {
		importIntoJabRef(file);

		// Delete saved items from zotero database, so we don't leave any traces
		deleteItemsFromZoteroDatabase(copyItems);
	});

	// Perform export
	exportTranslator.translate();
}

/*
 * Sends the given bib file to JabRef.
 */
function importIntoJabRef(file) {
	importPathIntoJabRef(file.path);
}

/*
 * Sends the file path or url to JabRef.
 */
function importPathIntoJabRef(path) {
	// Get JabRef executable
	var jabRef = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	jabRef.initWithPath(preferences.jabRefPath);
	// Start JabRef
	var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
	process.init(jabRef);
	var args = ["--importToOpen", path];
	process.run(false, args, args.length);
}

/*
 * Delete items from Zotero db.
 */
function deleteItemsFromZoteroDatabase(items) {
	for (i = 0; i < items.length; i++) {
		// Zotero also will delete the attachments if we delete the item
		// so we trick Zotero and mark the attachments as linked so they are not deleted 
		var attachments = items[i].getAttachments();
		for (var attachmentId in attachments) {
			var attachment = Zotero.Items.get(attachments[attachmentId]);
			attachment.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL;
			attachment.save();
		}

		Zotero.Items.erase(items[i].id);
	}
}

/*
 * For PDFs, sends the URL directly to JabRef since Zotero does not have an importer which handles PDFs.
 */
function startPdfImport(url, panel) {
	importPathIntoJabRef(url);
}

/*
 * Listen for tab content loads in order to enable/disable the import button.
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
					"32": "./JabRef-icon-32-gray.png",
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

/*
 * Get hashcode of string
 * Code from http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
 */
String.prototype.hashCode = function() {
	var hash = 0;
	if (this.length == 0) return hash;
	for (i = 0; i < this.length; i++) {
		char = this.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
}
