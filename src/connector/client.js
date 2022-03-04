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
		noteInsertionPlaceholderURL: 'https://www.zotero.org/?',
		fieldURL: 'https://www.zotero.org/google-docs/?',
		brokenFieldURL: 'https://www.zotero.org/google-docs/?broken=',
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
	
	execCommand: async (command, client, showOrphanedCitationAlert=true) => {
		if (Zotero.GoogleDocs.UI.isDocx) {
			return Zotero.GoogleDocs.UI.displayDocxAlert();
		}
		if (!client) {
			client = new Zotero.GoogleDocs.Client();
			await client.init();
		}

		if (command == 'addEditCitation') {
			// Check if we're in a broken field and cancel operation if user
			// wants clicks More Info
			try {
				await client.cursorInField(showOrphanedCitationAlert);
			} catch (e) {
				if (e.message != "Handled Error") {
					Zotero.logError(e);
				}
				return;
			}
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
			var field = await client.cursorInField(true);
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
			return Zotero.GoogleDocs.execCommand("addEditCitation", client, false);
		}
	},
};

Zotero.GoogleDocs.Client = function() {
	this.documentID = document.location.href.match(/https:\/\/docs.google.com\/document\/d\/([^/]*)/)[1];
	this.id = Zotero.Utilities.randomString();
	this.fields = null;
	Zotero.GoogleDocs.clients[this.id] = this;
};
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
		this.insertIdx = null;
		this.queued = {
			fields: {},
			insert: [],
			insertPieces: [],
			documentData: null,
			bibliographyStyle: null
		};
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
			supportsTextInsertion: true,
			processorName: "Google Docs"
		}
	},
	
	getDocumentData: async function() {
		return Zotero.GoogleDocs_API.run(this.documentID, 'getDocumentData', Array.from(arguments));
	},

	/**
	 * This is a sneaky method where all actual calls to gdocs occur and multiple queued document
	 * changes are performed
	 * @param data {String} - from Zotero. Serialized doc data string
	 * @returns {Promise}
	 */
	setDocumentData: async function(data) {
		this.queued.documentData = data;
		
		// Sorting keys in reverse field order
		var keys = Object.keys(this.queued.fields); 
		// Settings this.fields to the current fields since after the below calls to
		// google docs the fields in the doc will correspond to this.getFields() result
		// which includes fields to be inserted
		// this.fields might later be used in editField() above
		var fields = this.fields = await this.getFields();
		var fieldIDs = fields.map(f => f.id);
		keys.sort((a, b) => fieldIDs.indexOf(b) - fieldIDs.indexOf(a));
		
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
			this.queued.insert = null;
			this.queued.documentData = null;
			this.queued.bibliographyStyle = null;
			count += batchSize;
		}
		if (!this.insertingNote) {
			await Zotero.GoogleDocs.UI.moveCursorToEndOfCitation();
		}
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
			if (typeof this.insertIdx == 'number' && this.queued.insert.length) {
				let prevField = this.fields[this.insertIdx-1];
				let nextField = this.fields[this.insertIdx];
				let noteIndex = 1;
				if (prevField) {
					noteIndex = prevField.noteIndex == 0 ? 0 : prevField.noteIndex+1;
				} else if (nextField) {
					noteIndex = nextField.noteIndex == 0 ? 0 : nextField.noteIndex-1;
				}
				this.insertNoteIndex = noteIndex;
				let insert = [Object.assign(this.queued.insert[0], {noteIndex})].concat(this.queued.insert.slice(1));
				fields = fields.slice(0, this.insertIdx).concat(insert,
					fields.slice(this.insertIdx));
			}
			return fields;
		}

		let response = await Zotero.GoogleDocs_API.run(this.documentID, 'getFields', [this.queued.conversion]);
		this.fields = response.fields;
		this.orphanedCitations = response.orphanedCitations;
		Zotero.GoogleDocs.UI.orphanedCitations.setCitations(this.orphanedCitations);
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
		var id = Zotero.Utilities.randomString(Zotero.GoogleDocs.config.fieldKeyLength);
		var field = {
			text: Zotero.GoogleDocs.config.citationPlaceholder,
			code: '{}',
			id,
			noteIndex: noteType ? this.insertNoteIndex : 0
		};
		
		this.queued.insert.push(field);
		await this._insertField(field, false);
		return field;
	},

	insertText: async function(text) {
		this.insertingNote = true;
		await Zotero.GoogleDocs.UI.writeText(text);
		await Zotero.GoogleDocs.UI.waitToSaveInsertion();
	},

	/**
	 * Insert a front-side link at selection with field ID in the url. The text and field code
	 * should later be saved from the server-side AppsScript code.
	 *
	 * @param {Object} field
	 */
	_insertField: async function(field, waitForSave=true, ignoreNote=false) {
		var url = Zotero.GoogleDocs.config.fieldURL + field.id;

		if (field.noteIndex > 0) {
			await Zotero.GoogleDocs.UI.insertFootnote();
		}
		await Zotero.GoogleDocs.UI.insertLink(field.text, url);
		
		if (!waitForSave) {
			return;
		}
		await Zotero.GoogleDocs.UI.waitToSaveInsertion();
	},

	convertPlaceholdersToFields: async function(placeholderIDs, noteType) {
		let document = new Zotero.GoogleDocs.Document(await Zotero.GoogleDocs_API.getDocument(this.documentID));
		let links = document.getLinks();

		let placeholders = [];
		for (let link of links) {
			if (link.url.startsWith(Zotero.GoogleDocs.config.fieldURL) ||
				!link.url.startsWith(Zotero.GoogleDocs.config.noteInsertionPlaceholderURL)) continue;
			let id = link.url.substr(Zotero.GoogleDocs.config.noteInsertionPlaceholderURL.length);
			let index = placeholderIDs.indexOf(id);
			if (index == -1) continue;
			link.id = id;
			link.index = index;
			link.code = "TEMP";
			placeholders.push(link);
		}
		// Sanity check
		if (placeholders.length != placeholderIDs.length){
			throw new Error(`convertPlaceholdersToFields: number of placeholders (${placeholders.length}) do not match the number of provided placeholder IDs (${placeholderIDs.length})`);
		}
		let requestBody = { writeControl: { targetRevisionId: document.revisionId } };
		let requests = [];
		// Sort for update by reverse order of appearance to correctly update the doc
		placeholders.sort((a, b) => b.endIndex - a.endIndex);
		if (noteType == 1 && !placeholders[0].footnoteId) {
			// Insert footnotes (and remove placeholders) (using the Google Docs API we can do that properly!)
			for (let placeholder of placeholders) {
				requests.push({
					createFootnote: {
						location: {
							index: placeholder.startIndex,
						}
					}
				});
				requests.push({
					deleteContentRange: {
						range: {
							startIndex: placeholder.startIndex+1,
							endIndex: placeholder.endIndex+1,
						}
					}
				});
			}
			requestBody.requests = requests;
			let response = await Zotero.GoogleDocs_API.batchUpdateDocument(this.documentID, requestBody);
			
			// Reinsert placeholders in the inserted footnotes
			requestBody = {};
			requests = [];
			placeholders.forEach((placeholder, index) => {
				// Every second response is from createFootnote
				let footnoteId = response.replies[index * 2].createFootnote.footnoteId;
				requests.push({
					insertText: {
						text: placeholder.text,
						location: {
							index: 1,
							segmentId: footnoteId
						}
					}
				});
				requests.push({
					updateTextStyle: {
						textStyle: {
							link: {
								url: Zotero.GoogleDocs.config.fieldURL + placeholder.id
							}
						},
						fields: 'link',
						range: {
							startIndex: 1,
							endIndex: placeholder.text.length+1,
							segmentId: footnoteId
						}
					}
				});
			});
			requestBody.requests = requests;
			await Zotero.GoogleDocs_API.batchUpdateDocument(this.documentID, requestBody);
		} else {
			for (let placeholder of placeholders) {
				requests.push({
					updateTextStyle: {
						textStyle: {
							link: {
								url: Zotero.GoogleDocs.config.fieldURL + placeholder.id
							}
						},
						fields: 'link',
						range: {
							startIndex: placeholder.startIndex,
							endIndex: placeholder.endIndex,
							segmentId: placeholder.footnoteId
						}
					}
				});
				if (placeholder.text[0] == ' ') {
					requests.push({
						updateTextStyle: {
							textStyle: {},
							fields: 'link',
							range: {
								startIndex: placeholder.startIndex,
								endIndex: placeholder.startIndex+1,
								segmentId: placeholder.footnoteId
							}
						}
					});
				}
			}
			requestBody.requests = requests;
			await Zotero.GoogleDocs_API.batchUpdateDocument(this.documentID, requestBody);
		}
		// Reverse to sort in order of appearance, to make sure getFields returns inserted fields
		// in the correct order 
		placeholders.reverse();
		// Queue insert calls to apps script, where the insertion of field text and code will be finalized
		placeholders.forEach(placeholder => {
			var field = {
				text: placeholder.text,
				code: placeholder.code,
				id: placeholder.id,
				noteIndex: noteType ? this.insertNoteIndex++ : 0
			};
			this.queued.insert.push(field);
		});
		// Returning inserted fields in the order of appearance of placeholder IDs
		return Array.from(this.queued.insert).sort((a, b) => placeholderIDs.indexOf(a.id) - placeholderIDs.indexOf(b.id));
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
		throw new Error(`Selected field ${selectedFieldID} not returned from Docs backend`);
	},
	
	canInsertField: async function() {
		return this.isInOrphanedField || !this.isInLink;
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
				fieldIDs = new Set(fieldIDs);
				let document = new Zotero.GoogleDocs.Document(await Zotero.GoogleDocs_API.getDocument(this.documentID));
				let links = document.getLinks()
					.filter((link) => {
						if (!link.url.startsWith(Zotero.GoogleDocs.config.fieldURL)) return false;
						let id = link.url.substr(Zotero.GoogleDocs.config.fieldURL.length);
						return fieldIDs.has(id) && !link.footnoteId;
						
					})
					// Sort for update by reverse order of appearance to correctly update the doc
					.reverse();
				let requestBody = { writeControl: { targetRevisionId: document.revisionId } };
				let requests = [];
				
				// Insert footnotes (and remove placeholders)
				for (let link of links) {
					requests.push({
						createFootnote: {
							location: {
								index: link.endIndex,
							}
						}
					});
					requests.push({
						deleteContentRange: {
							range: {
								startIndex: link.startIndex,
								endIndex: link.endIndex,
							}
						}
					});
				}
				requestBody.requests = requests;
				let response = await Zotero.GoogleDocs_API.batchUpdateDocument(this.documentID, requestBody);

				// Reinsert placeholders in the inserted footnotes
				requestBody = {};
				requests = [];
				links.forEach((link, index) => {
					// Every second response is from createFootnote
					let footnoteId = response.replies[index * 2].createFootnote.footnoteId;
					requests.push({
						insertText: {
							text: link.text,
							location: {
								index: 1,
								segmentId: footnoteId
							}
						}
					});
					requests.push({
						updateTextStyle: {
							textStyle: {
								link: {
									url: link.url
								}
							},
							fields: 'link',
							range: {
								startIndex: 1,
								endIndex: link.text.length+1,
								segmentId: footnoteId
							}
						}
					});
				});
				requestBody.requests = requests;
				await Zotero.GoogleDocs_API.batchUpdateDocument(this.documentID, requestBody);
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
		if (this.queued.insert[0].id == fieldID) {
			let [field] = this.queued.insert.splice(0, 1);
			await Zotero.GoogleDocs.UI.undo();
			if (field.noteIndex > 0) {
				await Zotero.GoogleDocs.UI.undo();
				await Zotero.GoogleDocs.UI.undo();
				await Zotero.GoogleDocs.UI.undo();
			}
			delete this.queued.fields[fieldID];
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
