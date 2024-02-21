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

Zotero.GoogleDocs.Client = function() {
	this.documentId = document.location.href.match(/https:\/\/docs.google.com\/document\/d\/([^/]*)/)[1];
	this.id = Zotero.Utilities.randomString();
	
	this._fields = null;
	this._doc = null;
	
	Zotero.GoogleDocs.clients[this.id] = this;
};
Zotero.GoogleDocs.Client.isV2 = true;
Zotero.GoogleDocs.Client.prototype = {
	/**
	 * Called before each integration transaction once
	 */
	init: async function() {
		this.currentFieldID = await Zotero.GoogleDocs.UI.getSelectedFieldID();
		this.isInLink = Zotero.GoogleDocs.UI.isInLink();
		this.orphanedCitationAlertShown = false;
		this.insertingNote = false;
		this.insertNoteIndex = 1;
		this.queued = {
			fields: {},
			insert: [],
			insertPieces: [],
			documentData: null,
			bibliographyStyle: null
		};
		this._documentExport = false;
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
			documentId: this.documentId,
			outputFormat: 'html',
			supportedNotes: ['footnotes'],
			supportsImportExport: true,
			supportsTextInsertion: true,
			supportsCitationMerging: true,
			processorName: "Google Docs"
		}
	},

	getGoogleDocument: async function() {
		if (this._doc) return this._doc;
		Zotero.debug('Google Docs [getGoogleDocument()]: Retrieving document from API');
		this._doc = new Zotero.GoogleDocs.Document(await Zotero.GoogleDocs_API.getDocument(this.documentId));
		return this._doc;
	},
	
	resetGoogleDocument: function() {
		this._doc = this._fields = null;
	},
	
	getDocumentData: async function() {
		const doc = await this.getGoogleDocument();
		return doc.getDocumentData();
	},

	/**
	 * This is a sneaky method where all actual calls to gdocs occur and multiple queued document
	 * changes are performed
	 * @param data {String} - from Zotero. Serialized doc data string
	 * @returns {Promise}
	 */
	setDocumentData: async function(data) {
		const doc = await this.getGoogleDocument();
		let currentData = doc.getDocumentData();
		if (currentData != data) {
			doc.setDocumentData(data);
		}
		doc.commitFields();
		this._documentExport = false;
		this._doc = this._fields = null;
		await doc.commitBatchedUpdates();
	},
	
	activate: async function(force) {
		Zotero.GoogleDocs.UI.activate(force);
	},
	
	cleanup: async function() {},
	
	complete: async function() {
		if (!this.insertingNote) {
			await Zotero.GoogleDocs.UI.moveCursorToEndOfCitation();
		}
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
		if (this._fields) return this._fields;
		
		// If we had just inserted the {Updating} link and try to fetch fields, sometimes the
		// sync to Google Servers is unfinished and the race condition is resolved to revert
		// client-side changes. But if we wait in _insertField() then the citation dialog
		// has to wait for doc sync before it is displayed, which can take a long time. On the
		// other hand we only need to wait for save in the first place for a get operation - to
		// to fetch the fields here to be displayed in the Cited section of the citation dialog
		await Zotero.GoogleDocs.UI.waitToSaveInsertion();
		const doc = await this.getGoogleDocument();
		
		let fields;
		fields = doc.getFields(Zotero.GoogleDocs.config.fieldPrefix, !this._documentExport);
		Zotero.GoogleDocs.UI.orphanedCitations.setCitations(doc.orphanedCitations);

		this._fieldsByFieldId = {};
		fields.forEach(field => this._fieldsByFieldId[field.id] = field);
		fields = fields.map(field => field.serialize());
		return fields;
	},

	async getField(fieldID) {
		await this.getFields();
		return this._fieldsByFieldId[fieldID];
	},

	setBibliographyStyle: async function(firstLineIndent, bodyIndent, lineSpacing, entrySpacing,
						   tabStops, tabStopsCount) {
		const doc = await this.getGoogleDocument();
		doc.setBibliographyStyle(JSON.stringify({firstLineIndent, bodyIndent, lineSpacing, entrySpacing,
			tabStops}));
	},

	insertText: async function(text) {
		this.insertingNote = true;
		await Zotero.GoogleDocs.UI.writeText(text);
		await Zotero.GoogleDocs.UI.waitToSaveInsertion();
		// Need to refetch google doc after insertion
		this.resetGoogleDocument();
	},	
	
	insertField: async function(fieldType, noteType) {
		var id = Zotero.Utilities.randomString(Zotero.GoogleDocs.config.fieldKeyLength);
		var field = {
			text: Zotero.GoogleDocs.config.citationPlaceholder,
			code: '{}',
			id,
			noteIndex: noteType ? this.insertNoteIndex : 0
		};
		
		this.queued.insert.push(field);
		await this._insertField(field);
		// Need to refetch google doc after insertion
		this.resetGoogleDocument();
		return field;
	},

	/**
	 * Insert a front-side link at selection with field ID in the url. The text and field code
	 * should later be saved from the server-side AppsScript code.
	 *
	 * @param {Object} field
	 */
	_insertField: async function(field) {
		var url = Zotero.GoogleDocs.config.fieldURL + field.id;

		if (field.noteIndex > 0) {
			await Zotero.GoogleDocs.UI.insertFootnote();
		}
		await Zotero.GoogleDocs.UI.insertLink(field.text, url);
	},

	convertPlaceholdersToFields: async function(placeholderIDs, noteType) {
		const doc = await this.getGoogleDocument();
		let response = await doc.placeholdersToFields(placeholderIDs, noteType);
		this.resetGoogleDocument();
		return response;
	},

	cursorInField: async function(showOrphanedCitationAlert=false) {
		if (!(this.currentFieldID)) return false;
		this.isInOrphanedField = false;
		
		var fields = await this.getFields();
		// The call to getFields() might change the selectedFieldID if there are duplicates
		let selectedFieldID = this.currentFieldID = await Zotero.GoogleDocs.UI.getSelectedFieldID();
		for (let field of fields) {
			if (field.id == selectedFieldID) {
				return field;
			}
		}
		if (selectedFieldID.startsWith("broken=")) {
			this.isInOrphanedField = true;
			if (showOrphanedCitationAlert === true && !this.orphanedCitationAlertShown) {
				let result = await Zotero.GoogleDocs.UI.displayOrphanedCitationAlert();
				if (!result) {
					throw new Error('Handled Error');
				}
				this.orphanedCitationAlertShown = true;
			}
			return false;
		}
		const doc = await this.getGoogleDocument();
		doc.commitBatchedUpdates();
		throw new Error(`Selected field ${selectedFieldID} not returned from Docs backend`);
	},
	
	canInsertField: async function() {
		return this.isInOrphanedField || !this.isInLink;
	},
	
	convert: async function(fieldIDs, fieldType, fieldNoteTypes) {
		let field = await this.getField(fieldIDs[0]);

		if (field.noteIndex != fieldNoteTypes[0]) {
			fieldIDs = new Set(fieldIDs);
			const doc = await this.getGoogleDocument();
			if (fieldNoteTypes[0] > 0) {
				await doc.inlineToFootnotes(fieldIDs);
			} else {
				await doc.footnotesToInline(fieldIDs);
			}
			this.resetGoogleDocument();
		}
	},

	importDocument: async function() {
		const doc = await this.getGoogleDocument();
		let result = await doc.importDocument(...arguments);
		this.resetGoogleDocument();
		return result;
	},

	exportDocument: async function() {
		this._documentExport = true;
		const doc = await this.getGoogleDocument();
		await doc.exportDocument(...arguments);
		this.resetGoogleDocument();
		Zotero.GoogleDocs.downloadInterceptBlocked = true;
	},
	
	setText: async function(fieldID, text, isRich) {
		let field = await this.getField(fieldID);
		field.setText(text);
	},

	setCode: async function(fieldID, code) {
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

		let field = await this.getField(fieldID);
		field.setCode(code);
	},
	
	delete: async function(fieldID) {
		let field = await this.getField(fieldID);
		field.delete();
		
		// For fields that are inserted in front-end but not back-end we need to
		// only undo the insert operation
		if (this.queued.insert[0] && this.queued.insert[0].id == fieldID) {
			let [field] = this.queued.insert.splice(0, 1);
			await Zotero.GoogleDocs.UI.undo();
			// For note citations we also need to undo the footnote insert
			if (field.noteIndex > 0) {
				await Zotero.GoogleDocs.UI.undo();
				await Zotero.GoogleDocs.UI.undo();
				await Zotero.GoogleDocs.UI.undo();
			}
			// Need to refetch fields
			this._fields = null;
		}
	}, 
	
	removeCode: async function(fieldID) {
		let field = await this.getField(fieldID);
		field.unlink();
		// This call is only ever a part of Unlink Citations, which means that
		// after it there will be no more Zotero links in the file
		Zotero.GoogleDocs.hasZoteroCitations = false;
	},
	
	select: async function(fieldID) {
		let field = await this.getField(fieldID);
		
		if (!field) {
			throw new Error(`Attempting to select field ${fieldID} that does not exist in the document`);
		}
		let url = Zotero.GoogleDocs.config.fieldURL+field.id;
		if (!await Zotero.GoogleDocs.UI.selectText(field.text, url)) {
			Zotero.debug(`Failed to select ${field.text} with url ${url}`);
		}
	},
};

})();
