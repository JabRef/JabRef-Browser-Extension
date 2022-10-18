/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2019 Center for History and New Media
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

'use strict';
(function() {

const EXPORTED_DOCUMENT_MARKERS = ["ZOTERO_TRANSFER_DOCUMENT", "ZOTERO_EXPORTED_DOCUMENT"];

Zotero.GoogleDocs.Document = class Document {
	constructor(json) {
		Object.assign(this, json);
		this._fields = null;
		this._links = null;
		this._placeholderLinks = null;
		this._batchedUpdates = [];
		this._updatesCommited = false;
		this.orphanedCitations = [];
		this.bodyRange = {
			startIndex: 0,
			endIndex: this.body.content[this.body.content.length-1].endIndex,
		};
		this.normalStyle = this.namedStyles.styles.find(style => style.namedStyleType === 'NORMAL_TEXT');
	}
	
	addBatchedUpdate(name, request) {
		let data = {};
		data[name] = request;
		this._batchedUpdates.push(data);
	}
	
	async commitBatchedUpdates() {
		Zotero.debug('Google Docs [commitBatchedUpdates()]: Committing batched updates');
		if (!this._batchedUpdates.length) {
			Zotero.debug('Google Docs [commitBatchedUpdates()]: Nothing to commit');
			return;
		}
		if (this._updatesCommited) {
			throw new Error('Google Docs [commitBatchedUpdates()]: Attempting to commit updates a second time with the same Document object');
		}
		let requestBody = { writeControl: { targetRevisionId: this.revisionId } };
		requestBody.requests = this._batchedUpdates;
		this._batchedUpdates = [];
		let response = await Zotero.GoogleDocs_API.batchUpdateDocument(this.documentId, requestBody);
		this.revisionId = response.writeControl.requiredRevisionId;
		this._updatesCommited = true;
		return response;
	}

	commitFields(onlyText) {
		let fields = this.getFields();
		// Reverse order so that front edits don't affect end text position indices
		for (let i = fields.length-1; i >= 0; i--) {
			fields[i].write(onlyText);
		}
	}

	getDocumentData() {
		if (this.isExportedDocument()) {
			return EXPORTED_DOCUMENT_MARKERS[0];
		}
		let dataFields = this.getFields(config.dataPrefix);
		if (!dataFields.length) {
			return JSON.stringify({dataVersion: 4});
		} else {
			return dataFields[0].code;
		}
	}
	
	setDocumentData(data) {
		let documentDataField = this.getFields(config.dataPrefix)[0];
		if (documentDataField) {
			for (let namedRange of documentDataField.namedRanges) {
				this.addBatchedUpdate('deleteNamedRange', { namedRangeId: namedRange.namedRangeId });
			}
		}
		this.encodeRange(this.bodyRange, data, config.dataPrefix);
	}
	
	isExportedDocument() {
		let text = this._reduceStructuralElements(this.body.content);
		return EXPORTED_DOCUMENT_MARKERS.some(marker => text.startsWith(marker));
	}

	async exportDocument(_, importInstructions) {
		// Convert fields
		let fields = this.getFields();
		for (let i = fields.length - 1; i >= 0; i--) {
			let field = fields[i];
			field.setText(field.code);
		}
		
		// Append document data
		let docData = this.getDocumentData();
		if (docData) {
			docData = "\nDOCUMENT_PREFERENCES " + docData;
			this.addBatchedUpdate('insertText', { text: docData,
				location: { index: this.bodyRange.endIndex-1, } });
			this.addBatchedUpdate('updateTextStyle', {
				textStyle: { link: { url: config.fieldURL } },
				fields: 'link',
				range: { startIndex: this.bodyRange.endIndex-1, endIndex: this.bodyRange.endIndex-1 + docData.length }
			});
		}
		
		this.commitFields(true);
		
		for (let i = fields.length - 1; i >= 0; i--) {
			let field = fields[i];
			field.namedRanges.forEach((namedRange) => {
				this.addBatchedUpdate('deleteNamedRange', { namedRangeId: namedRange.namedRangeId });
			});
		}
		
		// Insert export marker, empty paragraph, import instructions and another empty paragraph
		let startContent = `${EXPORTED_DOCUMENT_MARKERS[0]}\n\n${importInstructions}\n\n`;
		this.addBatchedUpdate('insertText', { text: startContent, location: { index: 1, } });

		return this.commitBatchedUpdates();
	}

	async importDocument() {
		let importField = (link, text) => {
			let key = Zotero.Utilities.randomString(config.fieldKeyLength);
			var field = new Field(this, link, key, [], config.fieldPrefix);
			field.setText('{Imported field}');
			field.setCode(text);
			field.write(false, true);
		}
		let dataImported = false;
		const importTypes = {
			"ITEM CSL_CITATION ": importField,
			"BIBL ": importField,
			"DOCUMENT_PREFERENCES ": (link, text) => {
				dataImported = true;
				this.setDocumentData(text.substr("DOCUMENT_PREFERENCES ".length));
				this.addBatchedUpdate('deleteContentRange', { range: Utilities.getRangeFromLinks(link) });
			},
		};
		let links = this.getLinks();
		for (var i = links.length-1; i >= 0; i--) {
			let link = links[i];
			let text = link.text.trim();
			for (let key in importTypes) {
				if (text.startsWith(key)) {
					importTypes[key](link, text);
				}
			}
		}
		let text = this._reduceStructuralElements(this.body.content);
		let importMarkerAndInstructionsText = text.split('\n').slice(0, 4).join('\n');
		this.addBatchedUpdate('deleteContentRange', { range: {
			startIndex: 1,
			endIndex: 2 + importMarkerAndInstructionsText.length
		} });
		if (dataImported) {
			await this.commitBatchedUpdates();
		}
		return dataImported;
	}

	getBibliographyStyle() {
		let bibStyle = this._bibliographyStyle;
		if (!bibStyle) {
			bibStyle = this.getFields(config.biblStylePrefix);
			if (!bibStyle.length) {
				throw new Error("Trying to write bibliography without having set the bibliography style");
			}
			bibStyle = bibStyle[0].code;
		}
		bibStyle = JSON.parse(bibStyle);
		var paragraphStyle = {};
		// See https://github.com/zotero/zotero/blob/1f320e1f5d5fd818e2c2d532f4789e38792a77a2/chrome/content/zotero/xpcom/cite.js#L45

		// First line indent is calculated not from indent start, but from left margin in gdocs
		paragraphStyle.indentStart = {
			magnitude: (bibStyle.bodyIndent+bibStyle.firstLineIndent) * config.twipsToPoints,
			unit: "PT"
			};
		paragraphStyle.indentStart = { magnitude: bibStyle.bodyIndent*config.twipsToPoints, unit: "PT" };
		paragraphStyle.lineSpacing = bibStyle.lineSpacing/2.40;
		paragraphStyle.spaceAbove = { magnitude: bibStyle.entrySpacing*config.twipsToPoints, unit: "PT" };
		// Read only for now
		// https://developers.google.com/docs/api/reference/rest/v1/documents#paragraphstyle
		// https://issuetracker.google.com/issues/36765521
		// if (bibStyle.tabStops.length) {
		// 	paragraphStyle.tabStops = bibStyle.tabStops.map(tabStop => {
		// 		return {
		// 			offset: { magnitude: tabStop*config.twipsToPoints, unit: "PT" },
		// 			alignment: "START"
		// 		}
		// 	});
		// }
		return paragraphStyle;
	}

	setBibliographyStyle(data) {
		this._bibliographyStyle = data;
		let bibliographyStyleField = this.getFields(config.biblStylePrefix)[0];
		if (bibliographyStyleField) {
			for (let namedRange of bibliographyStyleField.namedRanges) {
				this.addBatchedUpdate('deleteNamedRange', { namedRangeId: namedRange.namedRangeId });
			}
		}
		this.encodeRange(this.bodyRange, data, config.biblStylePrefix);
	}
	
	/**
	 * Get all fields with a specified prefix
	 *
	 * @param prefix {String} [config.fieldPrefix] Field prefix
	 * @param highlightOrphans {Boolean} [false] Should highlight orphaned citations red
	 * @returns {[]}
	 */
	getFields(prefix, highlightOrphans=false) {
		prefix = prefix || config.fieldPrefix;
		const isField = config.fieldPrefix == prefix;
		if (isField && this._fields) return this._fields;

		let rangeFields = {};
		this._placeholderLinks = [];

		for (let rangeName in this.namedRanges) {
			if (!rangeName.startsWith(prefix)) continue;
			let namedRangeParent = this.namedRanges[rangeName];
			for (let namedRange of namedRangeParent.namedRanges) {
				let key = "";
				if (isField) {
					key = rangeName.substr(prefix.length, config.fieldKeyLength);
				}

				if (rangeFields[key]) {
					rangeFields[key].push(namedRange);
				} else {
					rangeFields[key] = [namedRange];
				}
			}
		}
		let fields = [];
		if (isField) {
			let field;
			Utilities.filterFieldLinks(this.getLinks()).forEach((link, idx) => {
				let key = link.url.substr(config.fieldURL.length, config.fieldKeyLength);
				if (rangeFields[key]) {
					// We have a corresponding namedRange for this link (i.e. field code is not unlinked)
					// First link in the text with this key
					if (!rangeFields[key].exists) {
						field = new Field(this, link, key, rangeFields[key], prefix, field);
						rangeFields[key].exists = field;
					}
					// Not first encounter of the same link in the text.
					else {
						const isBibl = rangeFields[key][0].name.substr((prefix+key).length+3, 4) == 'BIBL';
						if (!isBibl) {
							// There are multiple links for the same key, which means that citations have been copied
							// so we need to assign them a new key and manually copy the named ranges associated with
							// the citation field code
							var newKey = this._changeFieldLinkKey(link);
							var ranges = this._copyNamedRanges(rangeFields[key], key, newKey, link);
							key = newKey;
							field = new Field(this, link, key, ranges, prefix, field);
						} else {
							rangeFields[key].exists.links.push(link);
							return;
						}
					}
					fields.push(field);
				} else if (link.text == config.citationPlaceholder) {
					field = new Field(this, link, key, [], prefix);
					fields.push(field);
				} else if (key && highlightOrphans) {
					this.handleOrphanedCitation(link);
				}
			});
		}
		for (let key in rangeFields) {
			if (isField) {
				// Remove namedRanges that do not have a link associated with them
				if (!rangeFields[key].exists) {
					for (let namedRange of rangeFields[key]) {
						this.addBatchedUpdate('deleteNamedRange', { namedRangeId: namedRange.namedRangeId });
					}
				}
			} else {
				// Document preferences have no associated links and need to be added manually
				var field = {code: this.decodeRanges(rangeFields[key], prefix), namedRanges: rangeFields[key]};
				fields.push(field);
			}
		}
		if (isField) {
			this._fields = fields;
		}
		return fields;
	}

	getLinks() {
		if (this._links) return this._links;
		let links = [];
		var reducer = (elem, paragraphStyle, noteIndex=0, footnoteId=null) => {
			if (elem.textRun) {
				let textRun = elem.textRun;
				if (textRun.textStyle && textRun.textStyle.link && textRun.textStyle.link.url) {
					let lastLink = links[links.length-1];
					// Merge adjacent links (e.g. starting in a new line)
					if (lastLink && lastLink.endIndex == elem.startIndex && lastLink.url == textRun.textStyle.link.url) {
						lastLink.endIndex = elem.endIndex;
						lastLink.text = lastLink.text + textRun.content;
						links[links.length-1] = lastLink;
						return;
					}
					let link = {
						url: textRun.textStyle.link.url,
						startIndex: elem.startIndex || 0,
						endIndex: elem.endIndex,
						text: textRun.content,
						textStyle: textRun.textStyle,
						paragraphStyle: paragraphStyle,
						segmentId: footnoteId,
						noteIndex,
						footnoteId
					};
					links.push(link);
				}
			}
			else if (elem.footnoteReference) {
				let footnoteReference = elem.footnoteReference;
				this._reduceStructuralElements(this.footnotes[footnoteReference.footnoteId].content,
					(elem, paragraphStyle) => reducer(elem, paragraphStyle, parseInt(footnoteReference.footnoteNumber, 10), footnoteReference.footnoteId));
			}
		};
		this._reduceStructuralElements(this.body.content, reducer);
		this._links = links;
		return links;
	}

	async addPastedRanges(linksToCodes) {
		Zotero.debug("Google Docs: Adding pasted ranges");
		let rangeFields = {};
		let prefix = config.fieldPrefix;
		let linkedCitations = 0;
		for (let rangeName in this.namedRanges) {
			if (!rangeName.startsWith(prefix)) continue;
			let namedRangeParent = this.namedRanges[rangeName];
			for (let namedRange of namedRangeParent.namedRanges) {
				let key = "";
				key = rangeName.substr(prefix.length, config.fieldKeyLength);

				if (rangeFields[key]) {
					rangeFields[key].push(namedRange);
				} else {
					rangeFields[key] = [namedRange];
				}
			}
		}
		this.getLinks().forEach((link) => {
			var key = link.url.substr(config.fieldURL.length, config.fieldKeyLength);
			if (!key) return;

			if (linksToCodes[link.url]) {
				let range = Utilities.getRangeFromLinks(link);
				if (rangeFields[key]) {
					Zotero.debug('Google Docs: Citation "' + link.text + '" already has named ranges, refreshing named ranges');
					let newKey = this._changeFieldLinkKey(link);
					this._copyNamedRanges(rangeFields[key], key, newKey, range);
				} else {
					linksToCodes[link.url].codes.forEach((code) => {
						let namedRange = {
							name: code,
							range,
						};
						this.addBatchedUpdate('createNamedRange', namedRange);
					});
					linkedCitations++;
				}
				delete linksToCodes[link.url];
			}
		});
		await this.commitBatchedUpdates();
		let urls = Object.keys(linksToCodes);
		if (urls.length && !Array.isArray(linksToCodes[urls[0]])) {
			urls.forEach((url) => {
				this.orphanedCitations.push({
					url: url,
					key: url.substr(config.fieldURL.length, config.fieldKeyLength),
					text: linksToCodes[url].text
				});
			});
		}
		Zotero.debug('Google Docs: Total linked citations: ' + linkedCitations);
	}

	/**
	 * This is a destructive operation since it commits batched updates
	 * so a new document needs to be instantiated after it
	 */
	async inlineToFootnotes(fieldIDs) {
		let fields = this.getFields()
			// Sort for update by reverse order of appearance to correctly update the doc
			.reverse()
			// Do not include fields already in footnotes
			.filter(field => !field.noteIndex && fieldIDs.has(field.id));

		// Insert footnotes (and remove placeholders)
		for (let field of fields) {
			let range = field.getRange();
			this.addBatchedUpdate('createFootnote', { location: { index: range.endIndex, } });
			this.addBatchedUpdate('deleteContentRange', { range });
		}
		let response = await this.commitBatchedUpdates();
		this._updatesCommited = false;

		// Reinsert placeholders in the inserted footnotes
		fields.forEach((field, index) => {
			let range = {
				startIndex: 1,
				endIndex: field.text.length+1,
				// Every second response is from createFootnote
				segmentId: response.replies[index * 2].createFootnote.footnoteId
			};
			this.addBatchedUpdate('insertText', {
				text: field.text,
				location: {
					index: 1,
					segmentId: range.segmentId
				}
			});
			this.addBatchedUpdate('updateTextStyle', {
				textStyle: {
					link: {
						url: field.links[0].url
					}
				},
				fields: 'link',
				range
			});
			this.encodeRange(range, field.code, config.fieldPrefix + field.id);
		});
		return this.commitBatchedUpdates();
	}

	/**
	 * This is a destructive operation since it commits batched updates
	 * so a new document needs to be instantiated after it
	 */
	async footnotesToInline(fieldIDs) {
		let fields = this.getFields().filter(field => fieldIDs.has(field.id));
		let footnoteReferences = {};
		this._reduceStructuralElements(this.body.content, (elem) => {
			if (elem.footnoteReference) {
				footnoteReferences[elem.footnoteReference.footnoteId] = elem;
			}
		});
		for (let i = fields.length-1; i >= 0; i--) {
			let field = fields[i];
			let footnoteId = field.links[0].footnoteId;
			if (!footnoteId) continue;
			let footnoteText = this._reduceStructuralElements(this.footnotes[footnoteId].content);
			// There's other non-citation content in the footnote, so don't convert
			if (footnoteText.trim().length - field.text.length > 2) continue;
			let footnoteReference = footnoteReferences[footnoteId];
			this.addBatchedUpdate('deleteContentRange', { range: {
				startIndex: footnoteReference.startIndex,
				endIndex: footnoteReference.endIndex
			}});
			let newRange = {
				startIndex: footnoteReference.startIndex,
				endIndex: footnoteReference.startIndex + field.text.length
			}
			this.addBatchedUpdate('insertText', { text: field.text, location: { index: newRange.startIndex }});
			this.addBatchedUpdate('updateTextStyle', {
				textStyle: { link: { url: field.links[0].url } },
				fields: '*',
				range: newRange
			});
			this.encodeRange(newRange, field.code, config.fieldPrefix + field.id);
		}
		return this.commitBatchedUpdates();
	}
	
	async placeholdersToFields(placeholderIDs, noteType) {
		let document = new Zotero.GoogleDocs.Document(await Zotero.GoogleDocs_API.getDocument(this.documentId));
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
		// Sort for update by reverse order of appearance to correctly update the doc
		placeholders.sort((a, b) => b.endIndex - a.endIndex);
		if (noteType == 1 && !placeholders[0].footnoteId) {
			// Insert footnotes (and remove placeholders) (using the Google Docs API we can do that properly!)
			for (let placeholder of placeholders) {
				this.addBatchedUpdate('createFootnote', { 
					location: {
						index: placeholder.startIndex,
					}
				});
				// Sometimes when inserting footnotes they maintain the blue underlined link look
				// from citation placeholders so we force set the style here
				this.addBatchedUpdate('updateTextStyle', {
					textStyle: {
						underline: false,
						foregroundColor: this.normalStyle.textStyle.foregroundColor,
					},
					fields: '*',
					range: { startIndex: placeholder.startIndex, endIndex: placeholder.startIndex + 1 }
				});
				this.addBatchedUpdate('deleteContentRange', {
					range: {
						startIndex: placeholder.startIndex+1,
						endIndex: placeholder.endIndex+1,
					}
				});
			}
			let response = await this.commitBatchedUpdates();
			this._updatesCommited = false;

			// Reinsert placeholders in the inserted footnotes
			placeholders.forEach((placeholder, index) => {
				// Every second response is from createFootnote
				let footnoteId = response.replies[index * 3].createFootnote.footnoteId;
				this.addBatchedUpdate('insertText', {
					text: placeholder.text,
					location: { index: 1, segmentId: footnoteId }
				});
				let range = { startIndex: 1, endIndex: placeholder.text.length+1, segmentId: footnoteId };
				this.addBatchedUpdate('updateTextStyle', {
					textStyle: { link: { url: Zotero.GoogleDocs.config.fieldURL + placeholder.id } },
					fields: 'link',
					range
				});
				this.encodeRange(range, "TEMP", config.fieldPrefix + placeholder.id);
			});
			await this.commitBatchedUpdates();
		} else {
			for (let placeholder of placeholders) {
				let range = Utilities.getRangeFromLinks(placeholder);
				this.addBatchedUpdate('updateTextStyle', {
					textStyle: {
						link: {
							url: Zotero.GoogleDocs.config.fieldURL + placeholder.id
						}
					},
					fields: 'link',
					range
				});
				// When pasting text with links Google Docs extends the link to the
				// space before the placeholder, so we remove the link here.
				if (placeholder.text[0] == ' ') {
					this.addBatchedUpdate('updateTextStyle', {
						textStyle: {},
						fields: 'link',
						range: {
							startIndex: placeholder.startIndex,
							endIndex: placeholder.startIndex+1,
							segmentId: placeholder.footnoteId
						}
					});
				}
				this.encodeRange(range, "TEMP", config.fieldPrefix + placeholder.id);
			}
			await this.commitBatchedUpdates();
		}
		// Returning inserted fields in the order of appearance of placeholder IDs
		return placeholders.map(placeholder => {
			return {
				text: placeholder.text,
				code: placeholder.code,
				id: placeholder.id,
				noteIndex: noteType ? this.insertNoteIndex++ : 0
			};
		}).sort((a, b) => placeholderIDs.indexOf(a.id) - placeholderIDs.indexOf(b.id));
	}

	handleOrphanedCitation(link) {
		var key = link.url.substr(config.fieldURL.length);
		if (key.indexOf('broken=') === 0) {
			key = key.substr('broken='.length);
		} else {
			// Assign a new key in case the citation was copied and the original
			// one is still intact and has a working key. The url-key is later used
			// to select and highlight the orphaned citation in the gdocs editor
			key = Zotero.Utilities.randomString(config.fieldKeyLength)
		}
		this.orphanedCitations.push({
			url: config.brokenFieldURL + key,
			text: link.text,
			key: key
		});
		// Already processed previously
		if (link.url.indexOf(config.brokenFieldURL) === 0) return;

		// Change url to one with ?broken= prefix
		Zotero.debug('Google Docs: Found a new orphaned citation: "' + link.url + '": ' + link.text);
		var updateTextStyleRequest = {
			textStyle: {
				foregroundColor: { color: { rgbColor: { red: 0.8, green: 0.161, blue: 0.212 } } }, // #cc2936
				link: {
					url: config.brokenFieldURL + key
				}
			},
			range: Utilities.getRangeFromLinks(link),
			fields: '*'
		};
		this.addBatchedUpdate('updateTextStyle', updateTextStyleRequest);
	}

	_changeFieldLinkKey(link, key, prefix=config.fieldURL) {
		key = key || Zotero.Utilities.randomString(config.fieldKeyLength);
		var updateTextStyleRequest = {
			textStyle: {
				link: {
					url: prefix + key
				}
			},
			fields: '*',
			range: Utilities.getRangeFromLinks(link)
		};
		this.addBatchedUpdate('updateTextStyle', updateTextStyleRequest);
		return key;
	}

	_copyNamedRanges(ranges, oldKey, newKey, range) {
		let code = this.decodeRanges(ranges, config.fieldPrefix + oldKey);
		return this.encodeRange(range || bodyRange, code, config.fieldPrefix + newKey);
	}


	/**
	 * The idea is to encode a field using the names of NamedRanges
	 * https://developers.google.com/apps-script/reference/document/named-range
	 *
	 * So for a citation like (Adam, 2017) we'll have multiple NamedRanges covering the text
	 * each named Z_F000<part>, Z_F001<part> ... Z_F999<part>.
	 * This is required because the maximum length of a name of a namedRange is 255 characters and
	 * splitting it into 1000 parts allows us to encode about 25k characters for a field code.
	 *
	 * @param range {Range}
	 * @param code {String}
	 * @param prefix {String} The prefix string to use for encoding.
	 */
	encodeRange(range, code, prefix) {
		let codes = [];
		let i = 0;

		while (code.length) {
			let str = prefix + (i < 10 ? '00' : i < 100 ? '0' : '') + i;
			str += code.substr(0, 255 - prefix.length - 3);
			code = code.substr(255 - prefix.length - 3);
			codes.push(str);
			i++;
		}

		let ranges = [];
		for (i = 0; i < codes.length; i++) {
			let namedRange = {
				name: codes[i],
				range: Utilities.getRangeFromLinks(range),
			};
			ranges.push(namedRange);
			this.addBatchedUpdate('createNamedRange', namedRange);
		}
		return ranges;
	}

	decodeRanges(namedRanges, prefix) {
		let codes = namedRanges.map(namedRange => namedRange.name);
		codes.sort();
		let code = "";
		for (let i = 0; i < codes.length; i++) {
			let c = codes[i];
			if (c.substr(prefix.length, 3) != i) {
				for (let range of namedRanges) {
					this.addBatchedUpdate('deleteNamedRange', { namedRangeId: range.namedRangeId });
				}
				throw new Error("Ranges corrupt on " + c.substr(0, prefix.length+3) + ".\n" + JSON.stringify(codes));
			}
			code += c.substr(prefix.length+3);
		}
		return code
	}
	
	/**
	 * Based on:
	 * https://developers.google.com/docs/api/samples/extract-text
	 * 
	 * If reducer not provided will return full text run
	 * 
	 * @param elements {StructuralElement[]} e.g. this.body.content
	 * @param reducer {Function} the reduction function with signature (elem, initial)
	 * @param initial {*} initial reduction value
	 * @returns {*} final reduction value
	 */
	_reduceStructuralElements(elements, reducer, initial='') {
		if (!reducer) {
			reducer = this._reduceText;
		}
		for (let val of elements) {
			if ('paragraph' in val) {
				for (let elem of val.paragraph.elements) {
					initial = reducer(elem, val.paragraph.paragraphStyle, initial);
				}
			}
			else if ('table' in val) {
				for (let row of val.table.tableRows) {
					for (let cell of row.tableCells) {
						initial = this._reduceStructuralElements(cell.content, reducer, initial)
					}
				}
			}
			else if ('tableOfContents' in val) {
				initial = this._reduceStructuralElements(val.tableOfContents.content, reducer, initial);
			}
		}
		return initial;
	}
	
	_reduceText(elem, paragraphStyle, initial) {
		if (elem.textRun) return initial + elem.textRun.content || '';
		if (elem.footnoteReference) return initial + elem.footnoteReference.footnoteNumber || '';
		return initial;
	}
}

let Field = Zotero.GoogleDocs.Field = class {
	constructor(doc, link, key, namedRanges, prefix, previousField) {
		prefix = prefix || config.fieldPrefix;

		this._doc = doc;
		this.id = key;
		this.namedRanges = namedRanges;
		this.links = [link];
		this.adjacent = false;
		if (previousField) {
			previousField.adjacent = Utilities.getRangeFromLinks(previousField.links).endIndex === link.startIndex;
		}

		this.initialCode = this.code = this._doc.decodeRanges(namedRanges, prefix+key);
		this.text = link.text;
		this.noteIndex = link.noteIndex;
		
		this._queued = { text: null, code: null, delete: false };
	}
	
	/**
	 * This is a destructive operation. The Field object becomes invalid after it because
	 * you basically need to rescan the document for new link associations to make this.links valid again.
	 *
	 * We don't do that for performance reasons and because you shouldn't need to use
	 * this object again after writing without calling getFields()
	 */
	write(onlyText=false, ignoreBibliographyStyle=false) {
		let field = this._queued;
		this._queued = { text: null, code: null };
		var newTextRange = null;
		var newCode = (field.code && field.code != this.initialCode) ? field.code : undefined;
		if (field.delete) {
			this.namedRanges.forEach((namedRange) => {
				this._doc.addBatchedUpdate('deleteNamedRange', { namedRangeId: namedRange.namedRangeId });
			});
			this._doc.addBatchedUpdate('deleteContentRange', { range: Utilities.getRangeFromLinks(this.links) });
			return;
		}
		if (field.text) {
			let range = this.getRange();

			this._doc.addBatchedUpdate('deleteContentRange', { range });
			let textStyle = {
				underline: false,
				foregroundColor: this._doc.normalStyle.textStyle.foregroundColor,
				link: { url: config.fieldURL + this.id }
			};
			let paragraphStyle = {};
			var isBibl = field.code && field.code.substr(0, 4) == "BIBL" ||
				this.code.substr(0, 4) == "BIBL";
			if (isBibl && !ignoreBibliographyStyle) {
				paragraphStyle = this._doc.getBibliographyStyle();
			}
			newTextRange = new HTMLInserter().insert(this._doc, field.text, range.startIndex, range.segmentId, textStyle, paragraphStyle, onlyText);

			// TODO
			// Sigh. Removing a paragraph also removes paragraph styling of the next paragraph, 
			// so we apply it one more time here
			// isBibl && this.links[this.links.length-1].text.getParent().setAttributes(paragraphModifiers);

			// Links no longer valid after inserting text
			this.links = null;

			// Inserting text removes the named ranges
			// So if we were not planning to change the code we need to reinsert it
			if (!newCode) {
				newCode = this.code;
			}
		}

		if (!onlyText && newCode) {
			const prefix = config.fieldPrefix + this.id;
			// If this field is a shallow clone of an existing field, its named ranges
			// have been added as a batch update but not yet copied, so we need to delete
			// those batch updates, or we'll get named range duplication corruption.
			if (this.namedRanges[0] && !this.namedRanges[0].namedRangeId) {
				this._doc._batchedUpdates = this._doc._batchedUpdates.filter(update => {
					return !update.createNamedRange
						|| !update.createNamedRange.name.startsWith(prefix);
				});
			}
			else {
				this.namedRanges.forEach((namedRange) => {
					this._doc.addBatchedUpdate('deleteNamedRange', { namedRangeId: namedRange.namedRangeId });
				});
			}
			this.namedRanges = this._doc.encodeRange(newTextRange || this.getRange(),
				newCode, prefix);
		}
	}
	
	// Lazily sets field text. No batched updates added until write() is called.
	setText(text) {
		let div = document.createElement('div');
		div.innerHTML = text;
		div.style.fontSize = 0;
		this.text = div.innerText;
		this._queued.text = text;
	}

	// Lazily sets field code. No batched updates added until write() is called.
	setCode(code) {
		this.code = code;
		this._queued.code = code;
	}

	unlink() {
		this.namedRanges.forEach((namedRange) => {
			this._doc.addBatchedUpdate('deleteNamedRange', { namedRangeId: namedRange.namedRangeId });
		});
		this._doc.addBatchedUpdate('updateTextStyle', {
			textStyle: {},
			fields: 'link',
			range: Utilities.getRangeFromLinks(this.links)
		});
	}
	
	delete() {
		// Just a placeholder field not committed to the backend
		if (!this.namedRanges.length) {
			this._doc._fields = this._doc._fields.filter(field => field.id != this.id);
			return;
		}
		this._queued.delete = true;
	}
	
	getRange() {
		return Utilities.getRangeFromLinks(this.links)
	}

	serialize() {
		return {
			id: this.id,
			text: this.text,
			code: this.code,
			noteIndex: this.noteIndex,
			adjacent: this.adjacent
		}
	}
}

let Utilities = Zotero.GoogleDocs.Utilities = {
	getRangeFromLinks(links) {
		if (!Array.isArray(links)) {
			links = [links];
		}
		return {
			startIndex: Math.min(...(links.map(l => l.startIndex))),
			endIndex: Math.max(...(links.map(l => l.endIndex))),
			segmentId: links[0].segmentId
		}
	},

	filterFieldLinks(links) {
		return links.filter(function (link) {
			return link.url.indexOf(config.fieldURL) == 0
				&& link.url.length == config.fieldURL.length + config.fieldKeyLength;
		});
	},
}

let HTMLInserter = Zotero.GoogleDocs.HTMLInserter = class {
	constructor() {
		this.startIndex = 0;
		this.insertAt = 0;
		this.segmentId = null;
		this.firstParagraph = true;
		this.textToInsert = '';
		this._batchedUpdates = [];
		this.isIndentBlock = false;
		this.shouldIndent = false;
		this.shouldUnindent = false;
	}
	
	_styleProps = {
		fontStyle: (value, textStyle) => {
			if (value === 'normal') textStyle.italic = false;
		},
		fontVariant: (value, textStyle) => {
			if (value === 'small-caps') textStyle.smallCaps = true;
		},
		fontWeight: (value, textStyle) => {
			if (value === 'normal') textStyle.bold = false;
		},
		textDecoration: (value, textStyle) => {
			if (value === 'none') textStyle.underline = false;
			else if (value === 'underline') textStyle.underline = true;
		},
	};
	
	insert(doc, html, startIndex, segmentId, textStyle, paragraphStyle, ignoreHTML) {
		this.insertAt = this.startIndex = startIndex;
		this.segmentId = segmentId;
		
		let div = document.createElement('div');
		// For HTML like <i>Journal</i> <b>2016</b>.
		// The space between tags would get trimmed away, so we move it into the first tag
		div.innerHTML = html.replace(/(<\s*\/[^>]+>) +</gm, ' $1<').replace(/[' \n']+/gm, ' ').trim();
		div.style.fontSize = 0;
		
		document.body.appendChild(div);
		if (ignoreHTML) {
			this.addText(html, Object.assign({}, textStyle));
		}
		else {
			try {
				// Insert formatted text
				this.addElem(div, Object.assign({}, textStyle));
			} catch (e) {
				Zotero.debug('An error occurred when attempting to insert HTML into GDoc: ' + e.message, 1);
				Zotero.debug(html, 1);
				Zotero.logError(e);
				// Fall back to appending the HTML
				this.addText(html, Object.assign({}, textStyle));
			}
		}
		document.body.removeChild(div);
		
		const range = {
			startIndex,
			endIndex: startIndex + this.textToInsert.length,
			segmentId
		};
		
		doc.addBatchedUpdate('insertText', {
			text: this.textToInsert,
			location: { segmentId, index: startIndex }
		});
		doc._batchedUpdates = doc._batchedUpdates.concat(this._batchedUpdates);
		if (Object.keys(paragraphStyle).length) {
			doc.addBatchedUpdate('updateParagraphStyle', {
				paragraphStyle,
				fields: Object.keys(paragraphStyle).join(','),
				range
			});
		}

		return range;
	}
	
	queueText(text) {
		// Prevent double and leading spaces
		if (this.textToInsert.length === 0 || this.textToInsert.match(/[ \t\n]$/)) {
			text = text.replace(/^ /, '');
		}
		this.textToInsert += text;
		this.insertAt += text.length;
		if (this.isIndentBlock && text == '\n') {
			this.isIndentBlock = false;
			this.shouldUnindent = true;
		}
	}

	addElem(elem, textStyle) {
		textStyle = textStyle || {};
		if (elem.nodeType === Node.TEXT_NODE) {
			var text = elem.data;
			if (text.length === 0) return;
			return this.addText(text, Object.assign({}, textStyle));
		}
		else if (elem.nodeType !== Node.ELEMENT_NODE) {
			Zotero.debug('Google Docs: Attempting to insert non-element node: ' + elem);
			return;
		}

		var elemName = elem.nodeName.toLowerCase();
		switch (elemName) {
			case 'i':
			case 'em':
				textStyle.italic = true; break;
			case 'b':
				textStyle.bold = true; break;
			case 'sup':
				textStyle.baselineOffset = "SUPERSCRIPT"; break;
			case 'sub':
				textStyle.baselineOffset = "SUBSCRIPT"; break;
		}

		let style = elem.style;
		for (let key in this._styleProps) {
			if (style[key]) this._styleProps[key](style[key], textStyle);
		}
		
		for (let cls of elem.classList.values()) {
			// See https://docs.citationstyles.org/en/stable/specification.html#display
			if (cls === 'csl-block') {
				this.queueText('\n');
			}
			else if (cls === 'csl-indent') {
				this.isIndentBlock = true;
			}
			else if (cls === 'csl-entry') {
				// Don't insert the first paragraph, except when we're not in a new paragraph already
				if (!this.firstParagraph) {
					this.queueText('\n');
				}
				this.firstParagraph = false;
			}
			else if (cls === 'delayed-zotero-citation-updates') {
				textStyle.backgroundColor = { color: { rgbColor: { red: 221/255., green: 221/255., blue: 221/255. } } }; // #dddddd
			}
		}
		
		for (let child of elem.childNodes) {
			this.addElem(child, Object.assign({}, textStyle));
		}
		
		// End of element (</>) inserts
		for (let cls of elem.classList.values()) {
			if (cls === 'csl-left-margin') {
				this.queueText("\t");
			}
			else if (cls === 'csl-block') {
				this.queueText('\n');
			}
		}
	}

	addText(text, textStyle) {
		let range = {
			startIndex: this.insertAt,
			endIndex: this.insertAt + text.length,
			segmentId: this.segmentId
		};
		this.queueText(text);
		if (Object.keys(textStyle).length) {
			this.addBatchedUpdate('updateTextStyle', {
				textStyle,
				fields: '*',
				range
			});
		}
		if (this.shouldIndent || this.shouldUnindent) {
			this.addBatchedUpdate('updateParagraphStyle', {
				paragraphStyle: { indentStart: { magnitude: this.shouldIndent ? 18 : 0, unit: "PT" } },
				fields: 'indentStart',
				range
			});
			this.shouldIndent = this.shouldUnindent = false;
		}
		
	}
};

HTMLInserter.prototype.addBatchedUpdate = Zotero.GoogleDocs.Document.prototype.addBatchedUpdate;

var config = Zotero.GoogleDocs.config;

})();
