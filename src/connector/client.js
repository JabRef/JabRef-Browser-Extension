/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
					George Mason University, Fairfax, Virginia, USA
					http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/
(function() {
	
var isTopWindow = false;
if(window.top) {
	try {
		isTopWindow = window.top == window;
	} catch(e) {};
}	
if (!isTopWindow) return;

Zotero.GoogleDocs = {
	config: {
		fieldURL: 'https://www.zotero.org/google-docs/?',
		fieldKeyLength: 6,
		citationPlaceholder: "{Updating}",
		fieldPrefix: "Z_F",
		dataPrefix: "Z_D"
	},
	clients: {},

	name: "Zotero Google Docs Plugin",
	
	init: async function() {
		if (!await Zotero.Prefs.getAsync('integration.googleDocs.enabled')) return;
		await Zotero.Inject.loadReactComponents();
		if (Zotero.isBrowserExt) {
			await Zotero.Connector_Browser.injectScripts(['zotero-google-docs-integration/ui.js']);
		}
		Zotero.GoogleDocs.UI.init();
		window.addEventListener(`${Zotero.GoogleDocs.name}.call`, function(e) {
			var client = Zotero.GoogleDocs.clients[e.data.client.id];
			if (!client) {
				client = new Zotero.GoogleDocs.Client();
			}
			client.call.apply(client, e.data.args);
		});
	},
	
	execCommand: function(command, client) {
		if (!client) {
			client = new Zotero.GoogleDocs.Client();
		}
		window.dispatchEvent(new MessageEvent('Zotero.Integration.execCommand', {
			data: {client: {documentID: client.documentID, name: Zotero.GoogleDocs.name, id: client.id}, command}
		}));
		this.lastClient = client;
	},
	
	respond: function(client, response) {
		window.dispatchEvent(new MessageEvent('Zotero.Integration.respond', {
			data: {client: {documentID: client.documentID, name: Zotero.GoogleDocs.name, id: client.id}, response}
		}));
	},
	
	editField: async function() {
		// Use the last client with a cached field list to speed up the cursorInField() lookup
		var client = this.lastClient || new Zotero.GoogleDocs.Client();
		try {
			var field = await client.cursorInField();
		} catch (e) {
			return client.displayAlert(e.message, 0, 0);
		}
		// Remove lastClient fields to ensure execCommand calls receive fresh fields
		this.lastClient && delete this.lastClient.fields;
		if (field && field.code.indexOf("BIBL") == 0) {
			return Zotero.GoogleDocs.execCommand("addEditBibliography", client);
		} else {
			return Zotero.GoogleDocs.execCommand("addEditCitation", client);
		}
	},
};

Zotero.GoogleDocs.Client = function() {
	this.documentID = document.location.href.match(/https:\/\/docs.google.com\/document\/d\/([^/]*)/)[1];
	this.id = Zotero.Utilities.randomString();
	this.fields = null;
	this.queued = {fields: {}, insert: null, documentData: null, bibliographyStyle: null};
	Zotero.GoogleDocs.clients[this.id] = this;
};
Zotero.GoogleDocs.Client.prototype = {
	call: async function(request) {
		var method = request.command.split('.')[1];
		var args = Array.from(request.arguments);
		var docID = args.splice(0, 1);
		var result;
		try {
			result = await this[method].apply(this, args);
		} catch (e) {
			Zotero.debug(`Exception in ${request.command}`);
			Zotero.logError(e);
			result = {
				error: e.type || `Connector Error`,
				message: e.message,
				stack: e.stack
			}
		}
		
		if (method == 'complete') return result;
		return Zotero.GoogleDocs.respond(this, result ? JSON.stringify(result) : 'null');
	},
	
	getDocument: async function() {
		return {
			documentID: this.documentID,
			supportedNotes: ['footnotes']
		}
	},
	
	getActiveDocument: async function() {
		return {
			documentID: this.documentID,
			supportedNotes: ['footnotes']
		}
	},
	
	getDocumentData: async function() {
		return Zotero.GoogleDocs_API.run(this.documentID, 'getDocumentData', Array.from(arguments));
	},
	
	setDocumentData: async function(data) {
		this.queued.documentData = data;
		if (this.queued.insert) {
			await this._insertField(this.queued.insert);
		}
		var keys = Object.keys(this.queued.fields); 
		while (keys.length > 3) {
			let batch = keys.splice(keys.length-6, 5);
			await Zotero.GoogleDocs_API.run(this.documentID, 'complete', [
				this.queued.insert,
				this.queued.documentData,
				batch.map(key => this.queued.fields[key]),
				this.queued.bibliographyStyle
			]);
			this.queued.insert = null;
			this.queued.documentData = null;
			this.queued.bibliographyStyle = null;
		}
		return Zotero.GoogleDocs_API.run(this.documentID, 'complete', [
			this.queued.insert,
			this.queued.documentData,
			keys.map(key => this.queued.fields[key]),
			this.queued.bibliographyStyle
		]);
	},
	
	activate: async function(force) {
		Zotero.GoogleDocs.UI.activate(force);
	},
	
	cleanup: async function() {},
	
	complete: async function() {
		delete Zotero.GoogleDocs.clients[this.id];
	},
	
	displayAlert: async function(text, icons, buttons) {
		return Zotero.GoogleDocs.UI.displayAlert(text, icons, buttons);
	},
	
	getFields: async function() {
		if (this.fields) return this.fields.concat(this.queued.insert ? [this.queued.insert] : []);
		
		this.fields = await Zotero.GoogleDocs_API.run(this.documentID, 'getFields', Array.from(arguments));
		return this.getFields();
	},

	setBibliographyStyle: async function(firstLineIndent, bodyIndent, lineSpacing, entrySpacing,
						   tabStops, tabStopsCount) {
		this.queued.bibliographyStyle = {firstLineIndent, bodyIndent, lineSpacing, entrySpacing,
			tabStops};
	},
	
	insertField: async function(fieldType, noteType) {
		if (this.queued.insert) {
			throw new Error ("#insertField() called multiple times in a transaction");
		}
		var id = Zotero.Utilities.randomString(Zotero.GoogleDocs.config.fieldKeyLength);
		var field = {text: Zotero.GoogleDocs.config.citationPlaceholder, code: '{}', id, noteType};
		this.queued.insert = field;
		return field;
	},

	/**
	 * Insert a front-side link at selection with field ID in the url. The text and field code 
	 * should later be saved from the server-side AppsScript code.
	 * 
	 * @param {Object} field
	 */
	_insertField: async function(field, waitForSave=true) {
		var url = Zotero.GoogleDocs.config.fieldURL + field.id;

		if (field.noteType > 0) {
			await Zotero.GoogleDocs.UI.insertFootnote();
		}
		await Zotero.GoogleDocs.UI.insertLink(field.text, url);
		
		if (!waitForSave) {
			return;
		}
		// Wait for google docs to save the text insertion
		await Zotero.Promise.delay(5);
		var deferred = Zotero.Promise.defer();
		// We cannot check for specific text because of localization, so we just wait for the text
		// to change. Best bet.
		var observer = new MutationObserver(() => deferred.resolve());
		var saveLabel = document.getElementsByClassName('docs-title-save-label-text')[0];
		observer.observe(saveLabel, {childList: true});
		await deferred.promise;
		observer.disconnect();
	},
	
	cursorInField: async function() {
		if (!Zotero.GoogleDocs.UI.getSelectedFieldID()) return false;
		var fields = await this.getFields();
		// The call to getFields() might change the selectedFieldID if there are duplicates
		var selectedFieldID = Zotero.GoogleDocs.UI.getSelectedFieldID();
		for (let field of fields) {
			if (field.id == selectedFieldID) {
				return field;
			}
		}
		throw new Error(`Selected field ${selectedFieldID} not returned from Docs backend`);
	},
	
	canInsertField: async function() {
		return !Zotero.GoogleDocs.UI.isInLink();
	},
	
	convert: async function(fieldIDs, fieldType, fieldNoteTypes) {
		var fields = await this.getFields();
		var fieldMap = {};
		for (let field of fields) {
			fieldMap[field.id] = field;
		}
		
		if (fieldMap[fieldIDs[0]].noteIndex != fieldNoteTypes[0]) {
			// Note/intext conversions
			if (fieldNoteTypes[0] > 0) {
				// To footnote/endnote conversions are done client-side, because Apps Script has no
				// API to insert footnotes (!)
				// This will cause a properly big doc to go all jumpy and might scare users.
				// Might have to think about shading the screen with a note like "Zotero is working"
				// or something. On the other hand conversions should be relatively rare, so this is not a priority.
				
				for (let i = 0; i < fieldIDs.length; i++) {
					let noteType = fieldNoteTypes[i];
					if (noteType > 0) {
						let fieldID = fieldIDs[i];
						// Select and remove the existing field text, which places the cursor in the correct position
						await this.select(fieldID);
						await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Backspace", keyCode: 8});
						await this._insertField({id: fieldID, text: fieldMap[fieldID].text, noteType}, false);
					}
				}
				// Wait for google docs to save the text changes
				await Zotero.Promise.delay(5);
				var deferred = Zotero.Promise.defer();
				// We cannot check for specific text because of localization, so we just wait for the text
				// to change. Best bet.
				var observer = new MutationObserver(() => deferred.resolve());
				var saveLabel = document.getElementsByClassName('docs-title-save-label-text')[0];
				observer.observe(saveLabel, {childList: true});
				await deferred.promise;
				observer.disconnect();
			} else {
				// To in-text conversions client-side are impossible, because there is no obvious way
				// to make the cursor jump from the footnote section to its corresponding footnote.
				// Luckily, this can be done in Apps Script.
				return Zotero.GoogleDocs_API.run(this.documentID, 'footnotesToInline', [
					fieldIDs,
				]);
			}
			delete this.fields;
		}
	},
	
	setText: async function(fieldID, text, isRich) {
		if (!(fieldID in this.queued.fields)) {
			this.queued.fields[fieldID] = {id: fieldID};
		}
		this.queued.fields[fieldID].text = text;
		this.queued.fields[fieldID].isRich = isRich;
	},

	setCode: async function(fieldID, code) {
		if (!(fieldID in this.queued.fields)) {
			this.queued.fields[fieldID] = {id: fieldID};
		}
		this.queued.fields[fieldID].code = code;
	},
	
	delete: async function(fieldID) {
		if (this.queued.insert && this.queued.insert.id == fieldID) {
			this.queued.insert = null;
			return;
		}
		if (!(fieldID in this.queued.fields)) {
			this.queued.fields[fieldID] = {id: fieldID};
		}
		this.queued.fields[fieldID].delete = true;
	}, 
	
	removeCode: async function(fieldID) {
		if (this.queued.insert && this.queued.insert.id == fieldID) {
			this.queued.insert.removeCode = true;
		}
		if (!(fieldID in this.queued.fields)) {
			this.queued.fields[fieldID] = {id: fieldID};
		}
		this.queued.fields[fieldID].removeCode = true;
	},
	
	select: async function(fieldID) {
		let fields = await this.getFields();
		let field = fields.find(f => f.id == fieldID);
		
		if (!field) {
			throw new Error(`Attempting to select field ${fieldID} that does not exist in the document`);
		}
		await Zotero.GoogleDocs.UI.selectText(field.text, Zotero.GoogleDocs.config.fieldURL+field.id);
	},
};
		
if (document.readyState !== "complete") {
	window.addEventListener("load", function(e) {
		if (e.target !== document) return;
		Zotero.GoogleDocs.init();
	}, false);
} else {	
	Zotero.GoogleDocs.init();
}

})();
