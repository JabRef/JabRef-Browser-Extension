/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
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

/**
 * A class which will be passed the results of translation as Zotero items and collections.
 *
 * This is a virtual class for reference implementation purposes
 * A consumer of the translation code should implement these functions
 */
Zotero.Translate.ItemSaver = function(libraryID, attachmentMode, forceTagType) {};
Zotero.Translate.ItemSaver.ATTACHMENT_MODE_IGNORE = 0;
Zotero.Translate.ItemSaver.ATTACHMENT_MODE_DOWNLOAD = 1;
Zotero.Translate.ItemSaver.ATTACHMENT_MODE_FILE = 2;

/**
 * Only used by import translators and can remain a no-OP
 * @param {Array} collections
 */
Zotero.Translate.ItemSaver.prototype.saveCollection = function(collections) {};

/**
 * Called by Zotero.Translate upon successful item translation
 * @param {Object[]} jsonItems - Items in Zotero.Item.toArray() format
 * @param {Function} [attachmentCallback] A callback that receives information about attachment
 *     save progress. The callback will be called as attachmentCallback(attachment, false, error)
 *     on failure or attachmentCallback(attachment, progressPercent) periodically during saving.
 * @param {Function} [itemsDoneCallback] A callback that is called once all top-level items are
 *     done saving with a list of items. Can include saved notes, but should exclude attachments.
 */
Zotero.Translate.ItemSaver.prototype.saveItems = async function (jsonItems, attachmentCallback, itemsDoneCallback) {
	throw new Error(`Zotero.Translate.ItemSaver.prototype.saveItems: not implemented`);
};

// Used by export translators in Zotero
Zotero.Translate.ItemGetter = function() {
	this._itemsLeft = null;
	this._itemID = 1;
};

Zotero.Translate.ItemGetter.prototype = {
	get numItemsRemaining() {
		return this._itemsLeft.length
	},
	
	setItems: function(items) {
		this._itemsLeft = items;
		this.numItems = this._itemsLeft.length;
	},

	setCollection: function (collection, getChildCollections) {
		throw new Error(`Zotero.Translate.ItemGetter.prototype.setCollection: not implemented`);
	},

	/**
	 * NOTE: This function should use the Zotero.Promise.method wrapper which adds a
	 * isResolved property to the returned promise for noWait translation.
	 */
	setAll: Zotero.Promise.method(function (libraryID, getChildCollections) {
		throw new Error(`Zotero.Translate.ItemGetter.prototype.setAll: not implemented`);
	}),
	
	/**
	 * Retrieves the next available item
	 */
	nextItem: function() {
		if(!this._itemsLeft.length) return false;
		var item = this._itemsLeft.shift();
		if (this.legacy) {
			item = Zotero.Utilities.Item.itemToLegacyExportFormat(item);
		}
		if (!item.attachments) {
			item.attachments = [];
		}
		if (!item.notes) {
			item.notes = [];
		}

		// convert single field creators to format expected by export
		if(item.creators) {
			for(var i=0; i<item.creators.length; i++) {
				var creator = item.creators[i];
				if(creator.name) {
					creator.lastName = creator.name;
					creator.firstName = "";
					delete creator.name;
					creator.fieldMode = 1;
				}
			}
		}
		
		item.itemID = this._itemID++;
		return item;
	},
	
	nextCollection: function() {
		return false;
	}
}
