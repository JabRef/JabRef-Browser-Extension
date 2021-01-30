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
	});

	this.callMethodWithCookies = function(options, data, tab) {
		if (options === "saveItems") {
			browser.storage.sync.get({'exportMode': 'bibtex', 'takeSnapshots': false, 'retrieveCitationCounts': false})
				.then(configuration => {
					// fetch current settings
					console.debug("exportMode: " + configuration.exportMode);
					console.debug("takeSnapshots: " + configuration.takeSnapshots);
					console.debug("retrieveCitationCounts: " + configuration.retrieveCitationCounts);

					let items = [];

					if (configuration.retrieveCitationCounts) {
						console.log("[scholar-citations] fetching citation counts...");

						// create zsc compatible items
						for (let i = 0; i < data.items.length; i++) {
							let item = new ZscItem(data.items[i]);
							// add internal metadata
							item.setField('_externalRequest', false); // false: triggered from browser; true: triggered from JabRef
							item.setStatus(false, true, false, false); // init: no success, item complete (initial assumption), no captcha, not too many requests
							items.push(item);
						}

						// get citations counts for all items
						zsc.processItems(items);
					} else {
						items = data.items;
					}

					this.convertToBibTex(items, configuration.exportMode, configuration.takeSnapshots)
						.then((bibtex) => this.sendBibTexToJabRef(bibtex));
				});
		} else if (options === "saveSnapshot") {
			// Ignore this
		} else {
			throw new Error("JabRef: Tried to contact Zotero standalone: " + options);
		}
	};

	this.checkIsOnline = Zotero.Promise.method(function() {
		var deferred = Zotero.Promise.defer();
		// Pretend that we are connected to Zotero standalone
		deferred.resolve(true);
		return deferred.promise;
	});

	this.prepareForExport = function(items, takeSnapshots) {
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			for (var j = 0; j < item.attachments.length; j++) {
				var attachment = item.attachments[j];

				var isLink = attachment.mimeType === 'text/html' || attachment.mimeType === 'application/xhtml+xml';
				if (isLink && attachment.snapshot !== false) {
					// Snapshot
					if (takeSnapshots && attachment.url) {
						attachment.localPath = attachment.url;
					} else {
						// Ignore
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
	};

	this.convertToBibTex = function(items, conversionMode, takeSnapshots) {
		this.prepareForExport(items, takeSnapshots);

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
						convertToBibTex: items,
						conversionMode: conversionMode
					}
				);
			}
		})
	};

	this.sendBibTexToJabRef = function(bibtex) {
		browser.runtime.sendMessage({
			"onSendToJabRef": "sendToJabRefStarted"
		});
		console.log("JabRef: Send BibTeX to JabRef: %o", bibtex);

		browser.runtime.sendNativeMessage("org.jabref.jabref", {
				"text": bibtex
			})
			.then(response => {
				if (response.message === 'ok') {
					console.log("JabRef: Got success response from JabRef with details %o", response.output);
					browser.runtime.sendMessage({
						"popupClose": "close"
					});
				} else {
					console.error("JabRef: Error connecting to JabRef: %o with details %o", response.message, response.output);
					browser.runtime.sendMessage({
						"errorWhileSendingToJabRef": error.output
					});
				}
			})
			.catch(error => {
				console.error("JabRef: Error connecting to JabRef: %o", error);
				browser.runtime.sendMessage({
					"errorWhileSendingToJabRef": error.message
				});
			});
	}
};
