Zotero.Connector = new function() {
	this.callMethod = Zotero.Promise.method(function(options, data, cb, tab) {
		console.log("Tried to contact Zotero standalone: " + options);
		throw new Error("Zotero Offline");
	})

	this.callMethodWithCookies = function(options, data, tab) {
		if (options == "saveItems") {
			this.convertToBibTex(data.items)
				.then((bibtex) => console.log("I got BibTeX! %o", bibtex));
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

	this.convertToBibTex = function(items) {
		var deferred = Zotero.Promise.defer();

		translation = new Zotero.Translate.Export();
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
}
