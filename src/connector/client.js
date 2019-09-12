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
		dataPrefix: "Z_D",
	},
	clients: {},

	hasZoteroCitations: false,
	downloadInterceptBlocked: false,
	downloadIntercepted: false,

	name: "Zotero Google Docs Plugin",
	updateBatchSize: 32,
	
	init: async function() {
		if (!await Zotero.Prefs.getAsync('integration.googleDocs.enabled')) return;
		await Zotero.Inject.loadReactComponents();
		if (Zotero.isBrowserExt) {
			await Zotero.Connector_Browser.injectScripts(['zotero-google-docs-integration/ui.js']);
		}
		Zotero.GoogleDocs.UI.init();
		window.addEventListener(`${Zotero.GoogleDocs.name}.call`, async function(e) {
			var client = Zotero.GoogleDocs.clients[e.data.client.id];
			if (!client) {
				client = new Zotero.GoogleDocs.Client();
				await client.init();
			}
			client.call.apply(client, e.data.args);
		});
	},
	
	execCommand: async function(command, client) {
		if (!client) {
			client = new Zotero.GoogleDocs.Client();
			await client.init();
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
		await client.init();
		try {
			var field = await client.cursorInField();
		} catch (e) {
			if (e.message == "Handled Error") {
				Zotero.debug('Handled Error in editField()');
				return;
			}
			Zotero.debug(`Exception in editField()`);
			Zotero.logError(e);
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
	init: async function() {
		this.currentFieldID = await Zotero.GoogleDocs.UI.getSelectedFieldID();
		this.isInLink = Zotero.GoogleDocs.UI.isInLink();
	},
	
	call: async function(request) {
		var method = request.command.split('.')[1];
		var args = Array.from(request.arguments);
		var docID = args.splice(0, 1);
		var result;
		try {
			result = await this[method].apply(this, args);
		} catch (e) {
			// We will throw an error up to the client, which will end the integration transaction and
			// attempt to display a prompt, but since we handle locked client prompting
			// within api.js, we ignore client prompts here.
			if (e.message == "Handled Error") {
				Zotero.debug(`Handled Error in ${request.command}`);
				this.displayAlert = async function() {return 0};
			} else {
				Zotero.debug(`Exception in ${request.command}`);
				Zotero.logError(e);
			}
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
		return this.getActiveDocument();
	},
	
	getActiveDocument: async function() {
		Zotero.GoogleDocs.UI.toggleUpdatingScreen(true);
		return {
			documentID: this.documentID,
			outputFormat: 'html',
			supportedNotes: ['footnotes'],
			supportsImportExport: true,
			processorName: "Google Docs"
		}
	},
	
	getDocumentData: async function() {
		return Zotero.GoogleDocs_API.run(this.documentID, 'getDocumentData', Array.from(arguments));
	},
	
	setDocumentData: async function(data) {
		this.queued.documentData = data;
		var keys = Object.keys(this.queued.fields); 
		let batchSize = Zotero.GoogleDocs.updateBatchSize;
		let count = 0;
		while (count < keys.length || this.queued.documentData) {
			Zotero.debug(`GDocs: Updating doc. Batch ${batchSize}, numItems: ${keys.length - count}`);
			let batch = keys.slice(count, count+batchSize);
			try {
				await Zotero.GoogleDocs_API.run(this.documentID, 'complete', [
					Object.assign({}, this.queued, {
						fields: batch.map(key => this.queued.fields[key]),
						deletePlaceholder: count+batch < keys.length ? null : this.queued.deletePlaceholder
					})
				]);
			} catch(e) {
				if (e.status == 429 || e.message.startsWith('Too many changes applied before saving document.')) {
					// Apps script execution timed out
					if (batchSize == 1) {
						throw new Error(
							`Document update for batch size 1 failed with error ${e.message}. Not going to retry`);
					}
					// Cut the batch size for the session in half
					batchSize = Zotero.GoogleDocs.updateBatchSize = batchSize/2;
					Zotero.debug(`GDocs: HTTP 429/"Too many changes" from Google Docs. Reducing batch size to ${batchSize}`);
					Zotero.logError(e);
					if (!e.status) {
						// The document will be locked if it was a Too many changes error, so unlock first
						await Zotero.GoogleDocs_API.run(this.documentID, "unlockTheDoc", []);
					}
					continue;
				}
				throw e;
			}
			if (this.queued.insert) {
				this.fields.splice(this.insertIdx, 0, this.queued.insert);
			}
			this.queued.insert = null;
			this.queued.documentData = null;
			this.queued.bibliographyStyle = null;
			count += batchSize;
		}
		await Zotero.GoogleDocs.UI.moveCursorToEndOfCitation();
	},
	
	activate: async function(force) {
		Zotero.GoogleDocs.UI.activate(force);
	},
	
	cleanup: async function() {},
	
	complete: async function() {
		delete Zotero.GoogleDocs.clients[this.id];
		Zotero.GoogleDocs.UI.toggleUpdatingScreen(false);
	},
	
	displayAlert: async function(text, icons, buttons) {
		var result = await Zotero.GoogleDocs.UI.displayAlert(text, icons, buttons);
		if (buttons < 3) {
			return result % 2;
		} else {
			return 3 - result;
		}
	},
	
	getFields: async function() {
		if (this.fields) {
			let fields = this.fields;
			if (typeof this.insertIdx == 'number' && this.queued.insert) {
				let prevField = this.fields[this.insertIdx-1];
				let nextField = this.fields[this.insertIdx];
				let noteIndex = 1;
				if (prevField) {
					noteIndex = prevField.noteIndex == 0 ? 0 : prevField.noteIndex+1;
				} else if (nextField) {
					noteIndex = nextField.noteIndex == 0 ? 0 : nextField.noteIndex-1;
				}
				let insert = Object.assign({noteIndex}, this.queued.insert);
				fields = fields.slice(0, this.insertIdx).concat([insert],
					fields.slice(this.insertIdx));
			}
			return fields;
		}

		this.fields = await Zotero.GoogleDocs_API.run(this.documentID, 'getFields', [this.queued.conversion]);
		let i = 0;
		for (let field of this.fields) {
			if (field == -1) {
				this.insertIdx = i;
				break;
			}
			i++;
		}
		if (typeof this.insertIdx == 'number') {
			this.fields.splice(this.insertIdx, 1);
		}
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
		await this._insertField(field);
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
		await Zotero.GoogleDocs.UI.waitToSaveInsertion();
	},
	
	cursorInField: async function() {
		if (!(this.currentFieldID)) return false;
		
		var fields = await this.getFields();
		// The call to getFields() might change the selectedFieldID if there are duplicates
		let selectedFieldID = this.currentFieldID = await Zotero.GoogleDocs.UI.getSelectedFieldID();
		for (let field of fields) {
			if (field.id == selectedFieldID) {
				return field;
			}
		}
		throw new Error(`Selected field ${selectedFieldID} not returned from Docs backend`);
	},
	
	canInsertField: async function() {
		return !this.isInLink;
	},
	
	convert: async function(fieldIDs, fieldType, fieldNoteTypes) {
		var fields = await this.getFields();
		var fieldMap = {};
		for (let field of fields) {
			fieldMap[field.id] = field;
		}

		this.queued.conversion = true;
		if (fieldMap[fieldIDs[0]].noteIndex != fieldNoteTypes[0]) {
			// Note/intext conversions
			if (fieldNoteTypes[0] > 0) {
				// To footnote/endnote conversions are done client-side, because Apps Script has no
				// API to insert footnotes (!)
				// This will cause a properly big doc to go all jumpy and might scare users.
				// Might have to think about shading the screen with a note like "Zotero is working"
				// or something. On the other hand conversions should be relatively rare, so this is not a priority.
				
				await Zotero.GoogleDocs.UI.activate(true, "Zotero will now update your document and " +
					"needs the Google Docs tab to stay active. " +
					"Please do not switch away from the browser until the operation is complete.");
				
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
				await Zotero.GoogleDocs.UI.waitToSaveInsertion();
			} else {
				// To in-text conversions client-side are impossible, because there is no obvious way
				// to make the cursor jump from the footnote section to its corresponding footnote.
				// Luckily, this can be done in Apps Script.
				return Zotero.GoogleDocs_API.run(this.documentID, 'footnotesToInline', [
					fieldIDs,
				]);
			}
		}
	},
	
	setText: async function(fieldID, text, isRich) {
		if (!(fieldID in this.queued.fields)) {
			this.queued.fields[fieldID] = {id: fieldID};
		}
		// Fixing Google bugs. Google Docs XML parser ignores spaces between tags
		// e.g. <i>Journal</i> <b>2016</b>.
		// The space above is ignored, so we move it into the previous tag
		this.queued.fields[fieldID].text = text.replace(/(<\s*\/[^>]+>) +</g, ' $1<');
		this.queued.fields[fieldID].isRich = isRich;
	},

	setCode: async function(fieldID, code) {
		if (!(fieldID in this.queued.fields)) {
			this.queued.fields[fieldID] = {id: fieldID};
		}
		// The speed of updates is highly dependend on the size of
		// field codes. There are a few citation styles that require
		// the abstract field, but they are not many and the speed
		// improvement is worth the sacrifice. The users who need to
		// use the styles that require the abstract field will have to
		// cite items from a common group library.
		var startJSON = code.indexOf('{');
		var endJSON = code.lastIndexOf('}');
		if (startJSON != -1 && endJSON != -1) {
			var json = JSON.parse(code.substring(startJSON, endJSON+1));
			delete json.schema;
			if (json.citationItems) {
				for (let i = 0; i < json.citationItems.length; i++) {
					delete json.citationItems[i].itemData.abstract;
				}
				code = code.substring(0, startJSON) + JSON.stringify(json) + code.substring(endJSON+1);
			}
		}
		this.queued.fields[fieldID].code = code;
	},
	
	delete: async function(fieldID) {
		if (this.queued.insert && this.queued.insert.id == fieldID) {
			this.queued.insert = null;
			delete this.queued.fields[fieldID];
			this.queued.deletePlaceholder = true;
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
		// This call is a part of Unlink Citations, which means that
		// after this there will be no more Zotero links in the file
		Zotero.GoogleDocs.hasZoteroCitations = false;
	},
	
	select: async function(fieldID) {
		let fields = await this.getFields();
		let field = fields.find(f => f.id == fieldID);
		
		if (!field) {
			throw new Error(`Attempting to select field ${fieldID} that does not exist in the document`);
		}
		let url = Zotero.GoogleDocs.config.fieldURL+field.id;
		if (!await Zotero.GoogleDocs.UI.selectText(field.text, url)) {
			Zotero.debug(`Failed to select ${field.text} with url ${url}`);
		}
	},
	
	importDocument: async function() {
		delete this.fields;
		return Zotero.GoogleDocs_API.run(this.documentID, 'importDocument');
		Zotero.GoogleDocs.downloadInterceptBlocked = false;
	},

	exportDocument: async function() {
		await Zotero.GoogleDocs_API.run(this.documentID, 'exportDocument', Array.from(arguments));
		var i = 0;
		Zotero.debug(`GDocs: Clearing fields ${i++}`);
		while (!(await Zotero.GoogleDocs_API.run(this.documentID, 'clearAllFields'))) {
			Zotero.debug(`GDocs: Clearing fields ${i++}`)
		}
		Zotero.GoogleDocs.downloadInterceptBlocked = true;
	}
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
