/*
	Initialize
*/
Zotero.Debug.init(1);
Zotero.Repo.init();
Zotero.Messaging.init();
Zotero.Connector_Types.init();
Zotero.Translators.init();


/*
	Show/hide import button for all tabs (when add-on is loaded).
*/
browser.tabs.query({})
	.then((tabs) => {
		// We wait a bit before injection to give Zotero time to load the translators
		setTimeout(() => {
			console.log("JabFox: Inject into open tabs %o", tabs);
			for (let tab of tabs) {
				lookForTranslators(tab);
			}
		}, 1500);
	});

/*
	Show/hide import button for the currently active tab, whenever the user navigates.
*/
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	browser.pageAction.show(tab.id);

	if (!changeInfo.url) {
		return;
	}
	browser.tabs.query({
			active: true,
			currentWindow: true
		})
		.then((tabs) => {
			if (tabId == tabs[0].id) {
				var tab = tabs[0];

				// Clear old translator information
				Zotero.Connector_Browser.onPageLoad(tab);

				lookForTranslators(tab);
			}
		});
});

/*
	Remove translator information when tab is closed.
*/
browser.tabs.onRemoved.addListener(Zotero.Connector_Browser.onPageLoad);

/*
	Disable add-on for special browser pages
*/
function isDisabledForURL(url) {
	return url.includes('chrome://') || url.includes('about:') || (url.includes('-extension://') && !url.includes('/test/'));
}

/*
	Searches for translators for the given tab and shows/hides the import button accordingly.
*/
function lookForTranslators(tab) {
	if (isDisabledForURL(tab.url)) {
		return;
	}

	console.log("JabFox: Searching for translators for %o", tab);
	Zotero.Translators.getWebTranslatorsForLocation(tab.url, tab.url).then((translators) => {
		console.log("JabFox: Found translators %o", translators[0]);
		if (translators[0].length == 0) {
			// No translators found, so hide button
			browser.pageAction.hide(tab.id);
		} else {
			// Translators found, so show button and update label
			browser.pageAction.show(tab.id);
			browser.pageAction.setTitle({
				tabId: tab.id,
				title: "Import references into JabRef using " + translators[0][0].label
			});
			//Zotero.Connector_Browser.onTranslators(translators[0], 0, "something/test", tab, 0);
		}
	});
}

browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	if (message.popupOpened) {
		// The popup opened, i.e. the user clicked on the page action button
		console.log("JabFox: Popup opened confirmed");

		browser.tabs.query({
				active: true,
				currentWindow: true
			})
			.then((tabs) => {
				var tab = tabs[0];

				Zotero.Connector_Browser.injectTranslationScripts(tab)
					.then(() => {
						console.log("JabFox: Start translation for tab %o", JSON.parse(JSON.stringify(tab)));
						Zotero.Connector_Browser._saveWithTranslator(tab, 0);
					});
			});
	}
});

Zotero.Translate.ItemGetter = function() {
	this._itemsLeft = [];
	this._collectionsLeft = null;
	this._exportFileDirectory = null;
	this.legacy = false;
};

Zotero.Translate.ItemGetter.prototype = {
	"setItems": function(items) {
		this._itemsLeft = items;
		this._itemsLeft.sort(function(a, b) {
			return a.id - b.id;
		});
		this.numItems = this._itemsLeft.length;
	},

	/**
	 * Retrieves the next available item
	 */
	"nextItem": function() {
		if (this._itemsLeft.length != 0) {
			return this._itemsLeft.shift();
		} else {
			return false;
		}
	}
}
