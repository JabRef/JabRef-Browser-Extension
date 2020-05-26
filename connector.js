if (!Date.prototype.toISODate) {
	Date.prototype.toISODate = function() {
		return this.getFullYear() + '-' +
			('0' + (this.getMonth() + 1)).slice(-2) + '-' +
			('0' + this.getDate()).slice(-2);
	}
}

Zotero.Connector = new function() {
	this.callMethod = Zotero.Promise.method(function(options, data, cb, tab) {
		throw new Error("JabRef: Tried to contact Zotero standalone: " + options);
	})
	
	console.log("Haini: Launching Zotero Connector, waiting for callback");
	this.callMethodWithCookies = function(options, data, tab) {
		console.log("Haini: We got a callback in connector.js");
		if (options == "saveItems") {
			this.convertToBibTex(data.items)
				.then((bibtex) => this.sendBibTexToJabRef(bibtex));
		} else if (options == "saveSnapshot") {
			console.log("Haini: We are no longer ignoring saveSnapshot branch")
			this.convertToBibTex(data)
				.then((bibtex) => this.sendBibTexToJabRef(bibtex));
			// Ignore this
		} else {
			throw new Error("JabRef: Tried to contact Zotero standalone: " + options);
		}
	}

	this.checkIsOnline = Zotero.Promise.method(function() {
		var deferred = Zotero.Promise.defer();
		// Pretend that we are connected to Zotero standalone
		deferred.resolve(true);
		return deferred.promise;
	})

	this.prepareForExport = function(items) {
		// TODO: Get value from preferences
		console.log("Haini: Passing prepareForExport with %o", items);
		var shouldTakeSnapshots;
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			for (var j = 0; j < item.attachments.length; j++) {
				var attachment = item.attachments[j];

				var isLink = attachment.mimeType === 'text/html' || attachment.mimeType === 'application/xhtml+xml';
				console.log("Haini: We should pass here? %o", attachment.mimeType);
				if (isLink && attachment.snapshot !== false) {
					// Snapshot
					if (shouldTakeSnapshots && attachment.url) {
						attachment.localPath = attachment.url;
					} else {
						// Ignore
						console.log("Haini: IGNORE BRANCH?!");
					}
				} else {
					// Normal file
					// Pretend we downloaded the file since otherwise it is not exported
					if (attachment.url) {
						attachment.localPath = attachment.url;
					}
				}
			}

			// Fix date string
			if (item.accessDate) {
				item.accessDate = new Date().toISODate();
			}
		}
	}

	this.convertToBibTex = function(items) {
		this.prepareForExport(items);

		browser.runtime.sendMessage({
			"onConvertToBibtex": "convertStarted"
		});

		return browser.tabs.query({
			currentWindow: true,
			active: true
		}).then(tabs => {
			for (let tab of tabs) {
				return browser.tabs.sendMessage(
					tab.id, {
						convertToBibTex: items
					}
				);
			}
		})
	}

	this.sendBibTexToJabRef = function(bibtex) {
		browser.runtime.sendMessage({
			"onSendToJabRef": "sendToJabRefStarted"
		});
		console.log("JabRef: Send BibTeX to JabRef: %o", bibtex);

		browser.runtime.sendNativeMessage("org.jabref.jabref", {
				"text": bibtex
			})
			.then(response => {
				console.log("JabRef: Got response from JabRef: %o with details %o", response.message, response.output);
				if (response.message == 'ok') {
					browser.runtime.sendMessage({
						"popupClose": "close"
					});
				}
			}, error => {
				console.error("JabRef: Error connecting to JabRef: %o", error);
				browser.runtime.sendMessage({
					"errorWhileSendingToJabRef": error.message
				});
			});
	}
}
