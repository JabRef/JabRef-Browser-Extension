Zotero.Connector = new function() {
	this.callMethod = Zotero.Promise.method(function(options, data, cb, tab) {
		throw new Zotero.CommunicationError("Zotero Offline", 0);
	})
}
