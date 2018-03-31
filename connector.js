Zotero.Connector = new function() {
	this.callMethod = Zotero.Promise.method(function(options, data, cb, tab) {
		console.log("JabFox: Tried to contact Zotero standalone: " + options);
		throw new Error("Zotero Offline");
	})

	this.callMethodWithCookies = function(options, data, tab) {
		if (options == "saveItems") {
			this.convertToBibTex(data.items)
				.then((bibtex) => this.sendBibTexToJabRef(bibtex));
		} else {
			console.log("Tried to contact Zotero standalone: " + options);
			throw new Error("Zotero Offline");
		}
	}

	this.checkIsOnline = Zotero.Promise.method(function() {
		var deferred = Zotero.Promise.defer();
		// Pretend that we are connected to Zotero standalone
		deferred.resolve(true);
		return deferred.promise;
	})

	this.prepareForExport = function(items) {
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			for (var j = 0; j < item.attachments.length; j++) {
				var attachment = item.attachments[j];

				// Pretend we downloaded the file since otherwise it is not exported
				if (attachment.url) {
					attachment.localPath = attachment.url;
				}
			}
		}
	}

	this.convertToBibTex = function(items) {
		this.prepareForExport(items);

		console.log("JabFox: Convert items to BibTeX: %o", items);
		var deferred = Zotero.Promise.defer();

		browser.runtime.sendMessage({
			"onConvertToBibtex": "convertStarted"
		});

		var translation = new Zotero.Translate.Export();
		translation.setItems(items);
		translation.setTranslator("9cb70025-a888-4a29-a210-93ec52da40d4"); // BibTeX
		translation.setHandler("done", function(obj, worked) {
			if (worked) {
				deferred.resolve(obj.string);
			} else {
				deferred.reject("Problem translating the item to BibTeX.")
			}
		});
		translation.translate();

		return deferred.promise;
	}

	this.sendBibTexToJabRef = function(bibtex) {
		browser.runtime.sendMessage({
			"onSendToJabRef": "sendToJabRefStarted"
		});
		console.log("JabFox: Send BibTeX to JabRef: %o", bibtex);

		browser.runtime.sendNativeMessage("org.jabref.jabref", {
				"text": bibtex
			})
			.then(response => {
				console.log("JabFox: Got response from JabRef: %o with details %o", response.message, response.output);
				if (response.message == 'ok') {
					browser.runtime.sendMessage({
						"popupClose": "close"
					});
				}
			}, error => {
				console.error("JabFox: Error connecting to JabRef: %o", error);
			});
	}
}
