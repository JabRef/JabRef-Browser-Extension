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

Zotero.GoogleDocs.Document = class Document {
	constructor(json) {
		Object.assign(this, json);
	}
	
	getLinks() {
		let links = [];
		var reducer = (elem, noteIndex=0, footnoteId=null) => {
			if (elem.textRun) {
				let textRun = elem.textRun;
				if (textRun.textStyle && textRun.textStyle.link && textRun.textStyle.link.url) {
					let lastLink = links[links.length-1];
					if (lastLink && lastLink.endIndex == elem.startIndex && lastLink.url == textRun.textStyle.link.url) {
						lastLink.endIndex = elem.endIndex;
						lastLink.text = lastLink.text + textRun.content;
						links[links.length-1] = lastLink;
						return;
					}
					let link = {
						url: textRun.textStyle.link.url,
						startIndex: elem.startIndex,
						endIndex: elem.endIndex,
						text: textRun.content,
						noteIndex,
						footnoteId
					};
					links.push(link);
				}
			}
			else if (elem.footnoteReference) {
				let footnoteReference = elem.footnoteReference;
				this._reduceStructuralElements(this.footnotes[footnoteReference.footnoteId].content,
					(elem) => reducer(elem, parseInt(footnoteReference.footnoteNumber, 10), footnoteReference.footnoteId));
			}
		};
		this._reduceStructuralElements(this.body.content, reducer);
		return links;
	}
	
	getRangeFromLinks(links) {
		return {
			startIndex: Math.min(...(links.map(l => l.startIndex))),
			endIndex: Math.max(...(links.map(l => l.endIndex)))
		}
	}
	
	filterFieldLinks(links) {
		return links.filter(function (link) {
			return link.url.indexOf(Zotero.GoogleDocs.config.fieldURL) == 0
				&& link.url.length == Zotero.GoogleDocs.config.fieldURL.length + Zotero.GoogleDocs.config.fieldKeyLength;
		});
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
					initial = reducer(elem, initial);
				}
			}
			else if ('table' in val) {
				for (let row of val.table.tableRows) {
					for (let cell of row.tableCells) {
						initial = this._readStructuralElements(cell.content, reducer, initial)
					}
				}
			}
			else if ('tableOfContents' in val) {
				initial = this._readStructuralElements(val.tableOfContents.content, reducer, initial);
			}
		}
		return initial;
	}
	
	_reduceText(elem, initial) {
		return initial + elem.textRun || '';
	}
}