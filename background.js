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
			console.log("JabRef: Inject into open tabs %o", tabs);
			for (let tab of tabs) {
				lookForTranslators(tab);
			}
		}, 1500);
	});

/*
	Show/hide import button for the currently active tab, whenever the user navigates.
*/
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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

	console.log("JabRef: Searching for translators for %o", tab);
	Zotero.Translators.getWebTranslatorsForLocation(tab.url, tab.url).then((translators) => {
		if (translators[0].length == 0) {
			// No translators found, so hide button
			console.log("JabRef: No translators found");
			browser.pageAction.hide(tab.id);
		} else {
			// Potential translators found, Zotero will check if these can detect something on the website.
			// We will be notified about the result of this check using the `onTranslators` method below, so nothing to do here. 
			console.log("JabRef: Found potential translators %o", translators[0]);
		}
	});
}

function evalInTab(tabsId, code) {
	return browser.tabs.executeScript(tabsId, {
			code: code
		})
		.then(
			result => console.log(`JabRef: code executed`),
			error => console.log(`Error: ${error}`));
}

/*
	Is called after Zotero injected all scripts and checked if the potential translators can find something on the page.
	We need to hide or show the page action accordingly.
*/
onTranslators = function(translators, tabId, contentType) {
	if (translators.length == 0) {
		console.log("JabRef: Found no suitable translators for tab %o", JSON.parse(JSON.stringify(tabId)));
		browser.pageAction.hide(tabId);
	} else {
		console.log("JabRef: Found translators %o for tab %o", translators, JSON.parse(JSON.stringify(tabId)));

		browser.pageAction.show(tabId);
		browser.pageAction.setTitle({
			tabId: tabId,
			title: "Import references into JabRef using " + translators[0].label
		});
	}
}

browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	if (message.popupOpened) {
		// The popup opened, i.e. the user clicked on the page action button
		console.log("JabRef: Popup opened confirmed");

		browser.tabs.query({
				active: true,
				currentWindow: true
			})
			.then((tabs) => {
				var tab = tabs[0];

				console.log("JabRef: Start translation for tab %o", JSON.parse(JSON.stringify(tab)));
				Zotero.Connector_Browser.saveWithTranslator(tab, 0);
			});
	} else if (message.eval) {
		console.debug("JabRef: eval in background.js: %o", JSON.parse(JSON.stringify(message.eval)));
		return evalInTab(sender.tab.id, message.eval);
	} else if (message[0] == 'Connector_Browser.onTranslators') {
		// Intercept message to Zotero background script
		console.log("JabRef: Intercept message to Zotero background script", JSON.parse(JSON.stringify(message)));
		message[1][1] = sender.tab.id;
		onTranslators.apply(null, message[1]);
	} else if (message[0] == 'Debug.log') {
		console.log(message[1]);
	} else if (message[0] == 'Errors.log') {
		console.log(message[1]);
	} else {
		console.log("JabRef: other message in background.js: %o", JSON.parse(JSON.stringify(message)));
	}
});
