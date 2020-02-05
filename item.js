/***********************************************************************************************************************
 * source: reduced version of: zotero-connectors/src/zotero/chrome/content/zotero/xpcom/data/item.js
 *
 * @param itemTypeOrID
 * @constructor
 **********************************************************************************************************************/

Zotero.Item = function(itemTypeOrID) {
	if (arguments[1] || arguments[2]) {
		throw ("Zotero.Item constructor only takes one parameter");
	}
	
	this._disabled = false;
	
	// loadPrimaryData (additional properties in dataObject.js)
	this._itemTypeID = null;
	this._firstCreator = null;
	this._sortCreator = null;
	this._attachmentCharset = null;
	this._attachmentLinkMode = null;
	this._attachmentContentType = null;
	this._attachmentPath = null;
	this._attachmentSyncState = 0;
	this._attachmentSyncedModificationTime = null;
	this._attachmentSyncedHash = null;
	
	// loadCreators
	this._creators = [];
	this._creatorIDs = [];
	
	// loadItemData
	this._itemData = null;
	this._noteTitle = null;
	this._noteText = null;
	this._displayTitle = null;
	
	// loadChildItems
	this._attachments = null;
	this._notes = null;
	
	this._tags = [];
	this._collections = [];
	
	this._bestAttachmentState = null;
	this._fileExists = null;
	
	this._deleted = null;
	this._hasNote = null;
	
	this._noteAccessTime = null;
}

Zotero.Item.prototype._objectType = 'item';

Zotero.Item.prototype.getID = function() {
	Zotero.debug('Item.getID() is deprecated -- use Item.id');
	return this._id;
}

Zotero.Item.prototype.getType = function() {
	Zotero.debug('Item.getType() is deprecated -- use Item.itemTypeID');
	return this._itemTypeID;
}

Zotero.Item.prototype.isPrimaryField = function (fieldName) {
	Zotero.debug("Zotero.Item.isPrimaryField() is deprecated -- use Zotero.Items.isPrimaryField()");
	return this.ObjectsClass.isPrimaryField(fieldName);
}

Zotero.Item.prototype._get = function () {
	throw new Error("_get is not valid for items");
}

Zotero.Item.prototype._set = function () {
	throw new Error("_set is not valid for items");
}

//////////////////////////////////////////////////////////////////////////////
//
// Public Zotero.Item methods
//
//////////////////////////////////////////////////////////////////////////////
/*
 * Retrieves an itemData field value
 *
 * @param {String|Integer} field fieldID or fieldName
 * @param {Boolean} [unformatted] Skip any special processing of DB value
 *   (e.g. multipart date field)
 * @param {Boolean} includeBaseMapped If true and field is a base field, returns
 *   value of type-specific field instead
 *   (e.g. 'label' for 'publisher' in 'audioRecording')
 * @return {String} Value as string or empty string if value is not present
 */
Zotero.Item.prototype.getField = function(field, unformatted, includeBaseMapped) {
	
	//Zotero.debug('Requesting field ' + field + ' for item ' + this._id, 4);
	
	this._requireData('primaryData');
	
	// TODO: Add sortCreator
	if (field === 'firstCreator' && !this._id) {
		// Hack to get a firstCreator for an unsaved item
		let creatorsData = this.getCreators(true);
		return Zotero.Items.getFirstCreatorFromData(this.itemTypeID, creatorsData);
	} else if (field === 'id' || this.ObjectsClass.isPrimaryField(field)) {
		var privField = '_' + field;
		//Zotero.debug('Returning ' + (this[privField] ? this[privField] : '') + ' (typeof ' + typeof this[privField] + ')');
		return this[privField];
	} else if (field == 'year') {
		return this.getField('date', true, true).substr(0,4);
	}
	
	if (this.isNote()) {
		switch (Zotero.ItemFields.getName(field)) {
			case 'title':
				return this.getNoteTitle();
				
			default:
				return '';
		}
	}
	
	if (includeBaseMapped) {
		var fieldID = Zotero.ItemFields.getFieldIDFromTypeAndBase(
			this._itemTypeID, field
		);
	}
	
	if (!fieldID) {
		var fieldID = Zotero.ItemFields.getID(field);
	}
	
	let value = this._itemData[fieldID];
	
	if (value === undefined) {
		//Zotero.debug("Field '" + field + "' doesn't exist for item type " + this._itemTypeID + " in Item.getField()");
		return '';
	}
	
	// If the item is identified (has an id or key), this field has to be populated
	if (this._identified && value === null && !this._loaded.itemData) {
		throw new Zotero.Exception.UnloadedDataException(
			"Item data not loaded and field '" + field + "' not set for item " +  this.libraryKey,
			"itemData"
		);
	}
	
	value = (value !== null && value !== false) ? value : '';
	
	if (!unformatted) {
		// Multipart date fields
		if (Zotero.ItemFields.isDate(fieldID)) {
			value = Zotero.Date.multipartToStr(value);
		}
	}
	//Zotero.debug('Returning ' + value);
	return value;
}


/*
 * Set a field value, loading existing itemData first if necessary
 *
 * Field can be passed as fieldID or fieldName
 */
Zotero.Item.prototype.setField = function(field, value, loadIn) {
	
	if (value === undefined) {
		throw new Error(`'${field}' value cannot be undefined`);
	}
	
	// Normalize values
	if (typeof value == 'number') {
		value = "" + value;
	}
	else if (typeof value == 'string') {
		value = value.trim().normalize();
	}
	if (value === "" || value === null || value === false) {
		value = false;
	}
	
	//Zotero.debug("Setting field '" + field + "' to '" + value + "' (loadIn: " + (loadIn ? 'true' : 'false') + ") for item " + this.id + " ");
	
	if (!field) {
		throw new Error("Field not specified");
	}
	
	if (field == 'id' || field == 'libraryID' || field == 'key') {
		return this._setIdentifier(field, value);
	}
	
	// Primary field
	if (this.ObjectsClass.isPrimaryField(field)) {
		this._requireData('primaryData');
		
		if (loadIn) {
			throw new Error('Cannot set primary field ' + field + ' in loadIn mode in Zotero.Item.setField()');
		}
		
		switch (field) {
			case 'itemTypeID':
				break;
			
			case 'dateAdded':
			case 'dateModified':
				// Accept ISO dates
				if (Zotero.Date.isISODate(value)) {
					let d = Zotero.Date.isoToDate(value);
					value = Zotero.Date.dateToSQL(d, true);
				}
				
				// Make sure it's valid
				let date = Zotero.Date.sqlToDate(value, true);
				if (!date) throw new Error("Invalid SQL date: " + value);
				
				value = Zotero.Date.dateToSQL(date, true);
				break;
			
			case 'version':
				value = parseInt(value);
				break;
			
			case 'synced':
				value = !!value;
				break;
			
			default:
				throw new Error('Primary field ' + field + ' cannot be changed in Zotero.Item.setField()');
			
		}
		
		/*
		if (!Zotero.ItemFields.validate(field, value)) {
			throw("Value '" + value + "' of type " + typeof value + " does not validate for field '" + field + "' in Zotero.Item.setField()");
		}
		*/
		
		// If field value has changed
		if (this['_' + field] === value) {
			if (field == 'synced') {
				Zotero.debug("Setting synced to " + value);
			}
			else {
				Zotero.debug("Field '" + field + "' has not changed", 4);
				return false;
			}
		}
		else {
			Zotero.debug("Field '" + field + "' has changed from '" + this['_' + field] + "' to '" + value + "'", 4);
		}
		
		// Save a copy of the field before modifying
		this._markFieldChange(field, this['_' + field]);
		
		if (field == 'itemTypeID') {
			this.setType(value, loadIn);
		}
		else {
			
			this['_' + field] = value;
			
			if (!this._changed.primaryData) {
				this._changed.primaryData = {};
			}
			this._changed.primaryData[field] = true;
		}
		return true;
	}
	
	if (!loadIn) {
		this._requireData('itemData');
	}
	
	let itemTypeID = this.itemTypeID;
	if (!itemTypeID) {
		throw new Error('Item type must be set before setting field data');
	}
	
	var fieldID = Zotero.ItemFields.getID(field);
	if (!fieldID) {
		throw new Error('"' + field + '" is not a valid itemData field');
	}
	
	if (loadIn && this.isNote() && field == Zotero.ItemFields.getID('title')) {
		this._noteTitle = value ? value : "";
		return true;
	}
	
	// Make sure to use type-specific field ID if available
	fieldID = Zotero.ItemFields.getFieldIDFromTypeAndBase(itemTypeID, fieldID) || fieldID;
	
	if (value !== false && !Zotero.ItemFields.isValidForType(fieldID, itemTypeID)) {
		var msg = "'" + field + "' is not a valid field for type " + itemTypeID;
		
		if (loadIn) {
			Zotero.debug(msg + " -- ignoring value '" + value + "'", 2);
			return false;
		}
		else {
			throw new Error(msg);
		}
	}
	
	// If not a multiline field, strip newlines
	if (typeof value == 'string' && !Zotero.ItemFields.isMultiline(fieldID)) {
		value = value.replace(/[\r\n]+/g, " ");;
	}
	
	if (fieldID == Zotero.ItemFields.getID('ISBN')) {
		// Hyphenate ISBNs, but only if everything is in expected format and valid
		let isbns = ('' + value).trim().split(/\s*[,;]\s*|\s+/),
			newISBNs = '',
			failed = false;
		for (let i=0; i<isbns.length; i++) {
			let isbn = Zotero.Utilities.Internal.hyphenateISBN(isbns[i]);
			if (!isbn) {
				failed = true;
				break;
			}
			
			newISBNs += ' ' + isbn;
		}
		
		if (!failed) value = newISBNs.substr(1);
	}
	
	if (!loadIn) {
		// Save date field as multipart date
		if (value !== false
				&& (Zotero.ItemFields.isDate(fieldID))
				&& !Zotero.Date.isMultipart(value)) {
			value = Zotero.Date.strToMultipart(value);
		}
		// Validate access date
		else if (fieldID == Zotero.ItemFields.getID('accessDate')) {
			if (value && value != 'CURRENT_TIMESTAMP') {
				// Accept ISO dates
				if (Zotero.Date.isISODate(value) && !Zotero.Date.isSQLDate(value)) {
					let d = Zotero.Date.isoToDate(value);
					value = Zotero.Date.dateToSQL(d, true);
				}
				
				if (!Zotero.Date.isSQLDate(value) && !Zotero.Date.isSQLDateTime(value)) {
					Zotero.logError(`Discarding invalid ${Zotero.ItemFields.getName(field)} '${value}' `
						+ `for item ${this.libraryKey} in setField()`);
					return false;
				}
			}
		}
		
		// If existing value, make sure it's actually changing
		if ((this._itemData[fieldID] === null && value === false)
				|| (this._itemData[fieldID] !== null && this._itemData[fieldID] === value)) {
			return false;
		}
		
		// Save a copy of the field before modifying
		this._markFieldChange(
			Zotero.ItemFields.getName(field), this._itemData[fieldID]
		);
	}
	
	this._itemData[fieldID] = value;
	
	if (!loadIn) {
		if (!this._changed.itemData) {
			this._changed.itemData = {};
		}
		this._changed.itemData[fieldID] = true;
	}
	return true;
}

/*
 * Returns the number of creators for this item
 */
Zotero.Item.prototype.numCreators = function() {
	this._requireData('creators');
	return this._creators.length;
}


Zotero.Item.prototype.hasCreatorAt = function(pos) {
	this._requireData('creators');
	return !!this._creators[pos];
}


/**
 * @param  {Integer} pos
 * @return {Object|Boolean} The internal creator data object at the given position, or FALSE if none
 */
Zotero.Item.prototype.getCreator = function (pos) {
	this._requireData('creators');
	if (!this._creators[pos]) {
		return false;
	}
	var creator = {};
	for (let i in this._creators[pos]) {
		creator[i] = this._creators[pos][i];
	}
	return creator;
}


/**
 * @param  {Integer} pos
 * @return {Object|Boolean} The API JSON creator data at the given position, or FALSE if none
 */
Zotero.Item.prototype.getCreatorJSON = function (pos) {
	this._requireData('creators');
	return this._creators[pos] ? Zotero.Creators.internalToJSON(this._creators[pos]) : false;
}


/**
 * Returns creator data in internal format
 *
 * @return {Array<Object>}  An array of internal creator data objects
 *                          ('firstName', 'lastName', 'fieldMode', 'creatorTypeID')
 */
Zotero.Item.prototype.getCreators = function () {
	this._requireData('creators');
	// Create copies of the creator data objects
	return this._creators.map(function (data) {
		var creator = {};
		for (let i in data) {
			creator[i] = data[i];
		}
		return creator;
	});
}


/**
 * @return {Array<Object>} An array of creator data objects in API JSON format
 *                         ('firstName'/'lastName' or 'name', 'creatorType')
 */
Zotero.Item.prototype.getCreatorsJSON = function () {
	this._requireData('creators');
	return this._creators.map(data => Zotero.Creators.internalToJSON(data));
}


/**
 * Set or update the creator at the specified position
 *
 * @param {Integer} orderIndex
 * @param {Object} Creator data in internal or API JSON format:
 *                   <ul>
 *                     <li>'name' or 'firstName'/'lastName', or 'firstName'/'lastName'/'fieldMode'</li>
 *                     <li>'creatorType' (can be name or id) or 'creatorTypeID'</li>
 *                   </ul>
 * @param {Object} [options]
 * @param {Boolean} [options.strict] - Throw on invalid creator type
 */
Zotero.Item.prototype.setCreator = function (orderIndex, data, options = {}) {
	var itemTypeID = this._itemTypeID;
	if (!itemTypeID) {
		throw new Error('Item type must be set before setting creators');
	}
	
	this._requireData('creators');
	
	var origCreatorType = data.creatorType;
	data = Zotero.Creators.cleanData(data, options);
	
	if (data.creatorTypeID === undefined) {
		throw new Error("Creator data must include a valid 'creatorType' or 'creatorTypeID' property");
	}
	
	// If creatorTypeID isn't valid for this type, use the primary type
	if (!data.creatorTypeID || !Zotero.CreatorTypes.isValidForItemType(data.creatorTypeID, itemTypeID)) {
		let itemType = Zotero.ItemTypes.getName(itemTypeID);
		if (options.strict) {
			let e = new Error(`Invalid creator type '${origCreatorType}' for type ${itemType}`);
			e.name = "ZoteroInvalidDataError";
			throw e;
		}
		let msg = `Creator type '${origCreatorType}' isn't valid for ${itemType} -- `
			+ "changing to primary creator";
		Zotero.warn(msg);
		data.creatorTypeID = Zotero.CreatorTypes.getPrimaryIDForType(itemTypeID);
	}
	
	// If creator at this position hasn't changed, cancel
	let previousData = this._creators[orderIndex];
	if (previousData
			&& previousData.creatorTypeID === data.creatorTypeID
			&& previousData.fieldMode === data.fieldMode
			&& previousData.firstName === data.firstName
			&& previousData.lastName === data.lastName) {
		Zotero.debug("Creator in position " + orderIndex + " hasn't changed", 4);
		return false;
	}
	
	// Save copy of old creators for save() and notifier
	if (!this._changed.creators) {
		this._changed.creators = {};
		this._markFieldChange('creators', this._getOldCreators());
	}
	this._changed.creators[orderIndex] = true;
	this._creators[orderIndex] = data;
	return true;
}


/**
 * @param {Object[]} data - An array of creator data in internal or API JSON format
 */
Zotero.Item.prototype.setCreators = function (data, options = {}) {
	// If empty array, clear all existing creators
	if (!data.length) {
		while (this.hasCreatorAt(0)) {
			this.removeCreator(0);
		}
		return;
	}
	
	for (let i = 0; i < data.length; i++) {
		this.setCreator(i, data[i], options);
	}
}


/*
 * Remove a creator and shift others down
 */
Zotero.Item.prototype.removeCreator = function(orderIndex, allowMissing) {
	var creatorData = this.getCreator(orderIndex);
	if (!creatorData && !allowMissing) {
		throw new Error('No creator exists at position ' + orderIndex);
	}
	
	// Save copy of old creators for notifier
	if (!this._changed.creators) {
		this._changed.creators = {};
		
		var oldCreators = this._getOldCreators();
		this._markFieldChange('creators', oldCreators);
	}
	
	// Shift creator orderIndexes down, going to length+1 so we clear the last one
	for (var i=orderIndex, max=this._creators.length+1; i<max; i++) {
		var next = this._creators[i+1] ? this._creators[i+1] : false;
		if (next) {
			this._creators[i] = next;
		}
		else {
			this._creators.splice(i, 1);
		}
		
		this._changed.creators[i] = true;
	}
	
	return true;
}


/**
 * Migrate valid fields in Extra to real fields
 *
 * A separate save is required
 */
Zotero.Item.prototype.migrateExtraFields = function () {
	var { itemType, fields, creators, extra } = Zotero.Utilities.Internal.extractExtraFields(
		this.getField('extra'), this
	);
	if (itemType) {
		this.setType(Zotero.ItemTypes.getID(itemType));
	}
	for (let [field, value] of fields) {
		this.setField(field, value);
	}
	if (creators.length) {
		this.setCreators([...item.getCreators(), ...creators]);
	}
	this.setField('extra', extra);
	if (!this.hasChanged()) {
		return false;
	}
	
	Zotero.debug("Migrating Extra fields for item " + this.libraryKey);
	if (itemType) {
		Zotero.debug("Item Type: " + itemType);
	}
	if (fields.size) {
		Zotero.debug(Array.from(fields.entries()));
	}
	if (creators.length) {
		Zotero.debug(creators);
	}
	Zotero.debug(extra);
	
	return true;
}


/**
 * @return {Object} Return a copy of the creators, with additional 'id' properties
 */
Zotero.Item.prototype._getOldCreators = function () {
	var oldCreators = {};
	for (i=0; i<this._creators.length; i++) {
		let old = {};
		for (let field in this._creators[i]) {
			old[field] = this._creators[i][field];
		}
		// Add 'id' property for efficient DB updates
		old.id = this._creatorIDs[i];
		oldCreators[i] = old;
	}
	return oldCreators;
}
