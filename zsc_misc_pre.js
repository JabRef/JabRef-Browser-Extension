/**
 * This file provides external functions and methods for zotero-scholar-citations/chrome/content/zsc.js (zsc/zsc.js).
 */

/***********************************************************************************************************************
 * Zotero.Notifier
 *
 * source derived from:
 * - zotero-connectors/src/zotero/chrome/content/zotero/xpcom/notifier.js
 *
 **********************************************************************************************************************/
Zotero.Notifier = new function() {

	this.registerObserver = function (ref, types, id, priority) {

	};

	this.unregisterObserver = function (id) {

	};
};

/***********************************************************************************************************************
 * ZscItem
 *
 * source derived from:
 * - zotero-connectors/src/zotero/chrome/content/zotero/xpcom/data/item.js
 * - zotero-connectors/src/zotero/chrome/content/zotero/xpcom/data/dataObject.js
 *
 * @param item
 * @constructor
 **********************************************************************************************************************/
let ZscItem = function(item) {
	// exemplary content:
	this.itemType = "journalArticle";
	this.creators = [
		{
			"firstName": "F.",
			"lastName": "Cali",
			"creatorType": "author"
		},
		{
			"firstName": "M.",
			"lastName": "Conti",
			"creatorType": "author"
		},
		{
			"firstName": "E.",
			"lastName": "Gregori",
			"creatorType": "author"
		}
	];
	this.notes = [];
	this.tags = [
		{"tag": "tuning"},
		{"tag": "wireless LAN"},
		{"tag": "IEEE standards"},
		{"tag": "telecommunication standards"},
		{"tag": "access protocols"},
		{"tag": "IEEE 802.11 protocol"},
		{"tag": "throughput limit"},
		{"tag": "dynamic tuning"},
		{"tag": "wireless LAN"},
		{"tag": "WLAN"},
		{"tag": "medium access control"},
		{"tag": "MAC protocol"},
		{"tag": "wireless channel"},
		{"tag": "efficiency"},
		{"tag": "contention window"},
		{"tag": "backoff algorithm"},
		{"tag": "performances"},
		{"tag": "sensitiveness"},
		{"tag": "network configuration parameters"},
		{"tag": "active stations"},
		{"tag": "hidden terminals"},
		{"tag": "capacity"},
		{"tag": "enhanced protocol"},
		{"tag": "Throughput"},
		{"tag": "Access protocols"},
		{"tag": "Wireless LAN"},
		{"tag": "Media Access Protocol"},
		{"tag": "Wireless application protocol"},
		{"tag": "Bandwidth"},
		{"tag": "Algorithm design and analysis"},
		{"tag": "Distributed algorithms"},
		{"tag": "Runtime"},
		{"tag": "Upper bound"}
	];
	this.seeAlso = [];
	this.attachments = [
		{
			"title": "IEEE Xplore Abstract Record",
			"url": "https://ieeexplore.ieee.org/abstract/document/893874",
			"mimeType": "text/html"
		}
	];
	this.itemID = "893874";
	this.publicationTitle = "IEEE/ACM Transactions on Networking";
	this.title = "Dynamic tuning of the IEEE 802.11 protocol to achieve a theoretical throughput limit";
	this.date = "December 2000";
	this.volume = "8";
	this.issue = "6";
	this.pages = "785-799";
	this.abstractNote = "In wireless LANs (WLANs), the medium access control (MAC) protocol is the main element that determines the efficiency in sharing the limited communication bandwidth of the wireless channel. In this paper we focus on the efficiency of the IEEE 802.11 standard for WLANs. Specifically, we analytically derive the average size of the contention window that maximizes the throughput, hereafter theoretical throughput limit, and we show that: 1) depending on the network configuration, the standard can operate very far from the theoretical throughput limit; and 2) an appropriate tuning of the backoff algorithm can drive the IEEE 802.11 protocol close to the theoretical throughput limit. Hence we propose a distributed algorithm that enables each station to tune its backoff algorithm at run-time. The performances of the IEEE 802.11 protocol, enhanced with our algorithm, are extensively investigated by simulation. Specifically, we investigate the sensitiveness of our algorithm to some network configuration parameters (number of active stations, presence of hidden terminals). Our results indicate that the capacity of the enhanced protocol is very close to the theoretical upper bound in all the configurations analyzed.";
	this.DOI = "10.1109/90.893874";
	this.ISSN = "1558-2566";
	this.conferenceName = "IEEE/ACM Transactions on Networking";
	this.proceedingsTitle = "IEEE/ACM Transactions on Networking";
	this.libraryCatalog = "IEEE Xplore";
	this.id = "TPOlkafz";

	//this.clearItem();
	this.deleteContentOfItem();

	// add all elements from given item
	if (item) {
		for (let key in item)
		{
			this[key] = item[key];
		}
	}
};

/**
 * clears the item
 */
ZscItem.prototype.clearItem = function() {
	this.itemType = "";
	this.creators = [];
	this.notes = [];
	this.tags = [];
	this.seeAlso = [];
	this.attachments = [];
	this.itemID = "";
	this.publicationTitle = "";
	this.title = "";
	this.date = "";
	this.volume = "";
	this.issue = "";
	this.pages = "";
	this.abstractNote = "";
	this.DOI = "";
	this.ISSN = "";
	this.conferenceName = "";
	this.proceedingsTitle = "";
	this.libraryCatalog = "";
	this.id = "";
	this.extra = "";
};

/**
 * delete the content of the item
 */
ZscItem.prototype.deleteContentOfItem = function() {
	for (let property in this) {
		if (this.hasOwnProperty(property)) {
			delete this[property];
		}
	}
};

ZscItem.prototype.getField = function(field) {
	if (!field) {
		return "";
	}

	if (field === 'year') {
		let sanitizedYear = "";
		if (this.hasOwnProperty("year") && this['year']) {
			// Zotero.Date.strToISO(value): exemplary values which result in false: "", "  ", true, false, {}, ...
			let isoString = Zotero.Date.strToISO(this['year']); // returns false, if unsuccessful or a string (trimmed year) otherwise (e.g. "2020")
			if (isoString) {
				sanitizedYear = isoString.substr(0, 4); // added for safety purposes
			}
		}

		if (!sanitizedYear) {
			// sanitizedYear is either false or empty string ""
			if (this.hasOwnProperty("date") && this['date']) {
				// Zotero.Date.strToISO(value): exemplary values which result in false: "", "  ", true, false, {}, ...
				let isoDateString = Zotero.Date.strToISO(this['date']); // returns false, if unsuccessful or a string otherwise (e.g. "2020-01-18")
				if (isoDateString) {
					sanitizedYear = isoDateString.substr(0, 4);
				}
			}
		}

		if (sanitizedYear) {
			// sanitizedYear is a non-empty string
			return sanitizedYear;
		}
		else {
			return "";
		}
	} else if (field === 'date') {
		if (this.hasOwnProperty(field) && this[field]) {
			let isoDateString = Zotero.Date.strToISO(this[field]);
			return isoDateString || "";
		} else {
			return "";
		}
	} else if (field === 'DOI' || field === 'doi') {
		if (this.hasOwnProperty(field) && this[field]) {
			let cleanedDoi = Zotero.Utilities.cleanDOI(this[field]);
			return cleanedDoi || "";
		} else {
			return "";
		}
	}
	else {
		if (this.hasOwnProperty(field) && this[field]) {
			return this[field];
		} else {
			return "";
		}
	}
};

ZscItem.prototype.setField = function(field, value) {
	if (!field) {
		return;
	}

	if (typeof value == 'number') {
		value = "" + value;
	}
	else if (typeof value == 'string') {
		value = value.trim().normalize();
	}

	this[field] = value;
};

ZscItem.prototype.getCreators = function() {
	if (this.hasOwnProperty('creators') && this['creators']) {
		return this['creators'];
	}
	else {
		return [];
	}
};

/**
 * additional helper
 *
 * @returns {boolean}
 */
ZscItem.prototype.isExternalRequest = function() {
	if (this.getField('_externalRequest') === true) {
		return true;
	}
	else {
		return false;
	}
};

/**
 * additional helper
 *
 * @param success <code>true</code> if fetching the citation count was successful, <code>false</code> otherwise
 * @param itemComplete <code>false</code> if no data could be fetched since the item is incomplete, <code>true</code> otherwise
 * @param solvingCaptchaNeeded <code>true</code> if fetching the citation count from Google Scholar was not successful because a captcha needs to be solved first, <code>false</code> otherwise
 * @param tooManyRequests <code>true</code> if too many request were sent to Google Scholar, <code>false</code> otherwise
 */
ZscItem.prototype.setStatus = function(success, itemComplete, solvingCaptchaNeeded, tooManyRequests) {
	this.setField('_status', {success: success, itemComplete: itemComplete, solvingCaptchaNeeded: solvingCaptchaNeeded, tooManyRequests: tooManyRequests});
};

ZscItem.prototype.saveTx = function() {

};