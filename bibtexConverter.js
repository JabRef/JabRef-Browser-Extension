convertToBibTex = function(items, conversionMode) {
	var deferred = Zotero.Promise.defer();
	var translation = new Zotero.Translate.Export();

	translation.setItems(items);
	if (conversionMode === 1) {
		console.log("JabRef: Converting item(s) to BibLaTeX: %o", items);
		translation.setTranslator("b6e39b57-8942-4d11-8259-342c46ce395f"); // BibLaTeX
	}
	else {
		console.log("JabRef: Converting item(s) to BibTeX: %o", items);
		translation.setTranslator("9cb70025-a888-4a29-a210-93ec52da40d4"); // BibTeX
	}
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

browser.runtime.onMessage.addListener(message => {
	if (message.convertToBibTex) {
		console.log("JabRef: Got task to convert %o to BibTeX", message.convertToBibTex);
		return convertToBibTex(message.convertToBibTex, message.conversionMode);
	}
});
