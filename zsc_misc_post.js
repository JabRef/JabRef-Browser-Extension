/**
 * This file partially overrides methods of zotero-scholar-citations/chrome/content/zsc.js for customization purposes.
 */

zsc._captchaString = "Please show Google Scholar, that you are not a robot, by loading https://scholar.google.com, searching for any string and solving the shown captcha.";

zsc._preferDoiForLookupIfExisting = true; // additional setting; possible values: true, false (default: false; true: should be more accurate, assuming that the DOI is correct)
zsc._doiFieldName = 'DOI'; // additional setting; Zotero sends 'DOI' and JabRef as well

/**
 * additional helper
 *
 * does not check whether it is a valid DOI, only checks if it exists
 *
 * @param item
 * @returns {*|boolean}
 */
zsc.hasDoi = function(item) {
	return item.getField(zsc._doiFieldName)
		&& item.getField(zsc._doiFieldName).trim().length > 0;
};

/**
 * additional helper
 *
 * @param item
 * @returns {boolean|*|boolean}
 */
zsc.useDoiForLookup = function(item) {
	return zsc._preferDoiForLookupIfExisting && zsc.hasDoi(item);
};

zsc.processItems = function(items) {
	for (let i = 0; i < items.length; i++) {
		let item = items[i];
		if (zsc.useDoiForLookup(item)) {
			if (isDebug()) Zotero.debug('[scholar-citations] '
				+ 'DOI "' + item.getField(zsc._doiFieldName) + '" exists and'
				+ ' will be used, since it is preferred');
		}
		else if (!zsc.hasRequiredFields(item)) {
			if (isDebug()) Zotero.debug('[scholar-citations] '
				+ 'skipping item "' + item.getField('title') + '"'
				+ ' it has either an empty title or is missing creator information');
			browser.runtime.sendMessage({
				"onCitationCount": '' + zsc._noData
			});
			item.setField("citationCount", zsc._noData); // no data (title or creators missing)
			zsc.updateItem(item, -1); // info: added
			continue;
		}
		this.retrieveCitationData(item, function(item, citeCount) {
			if (isDebug()) Zotero.debug('[scholar-citations] '
				+ 'Updating item "' + item.getField('title') + '"');
			console.log("[scholar-citations] citation count: " + citeCount);
			if (citeCount > -1) {
				let paddedCitationCount = zsc.padLeftWithZeroes("" + citeCount);
				browser.runtime.sendMessage({
					"onCitationCount": '' + paddedCitationCount
				});
				item.setField("citationCount", paddedCitationCount);
			}
			else {
				browser.runtime.sendMessage({
					"onCitationCount": '' + zsc._noData
				});
				item.setField("citationCount", zsc._noData); // no data (no citation data)
			}
			zsc.updateItem(item, citeCount);
		});
	}
};

/**
 * additional helper
 *
 * @param item
 * @returns {string}
 */
zsc.generateItemDoiUrl = function(item) {
	let url = this._baseUrl
		+ 'scholar?hl=en&q='
		+ item.getField(zsc._doiFieldName).trim()
		+ '&num=1';
	return encodeURI(url);
};

// TODO: complex version, i.e. batching + retrying + blocking for solved captchas
// this prob. involves some nasty callback hell shit
// TODO: retries with random author permutations decreasing in author number :^)
zsc.retrieveCitationData = function(item, cb) {
	let url;
	if (zsc.useDoiForLookup(item)) {
		url = this.generateItemDoiUrl(item);
	}
	else {
		url = this.generateItemUrl(item);
	}
	if (isDebug()) Zotero.debug("[scholar-citations] GET " + url);
	let citeCount;
	let xhr = new XMLHttpRequest();
	xhr.open('GET', url, false); // TODO: original: async: true; improvement: make asynchronous calls possible
	xhr.onreadystatechange = function() {
		if (this.readyState === 4 && this.status === 200) {
			if (this.responseText.indexOf('www.google.com/recaptcha/api.js') === -1) {
				if (isDebug()) Zotero.debug("[scholar-citations] "
					+ "received non-captcha scholar results");
				cb(item, zsc.getCiteCount(this.responseText));
			} else {
				if (isDebug()) Zotero.debug("[scholar-citations] "
					+ "received a captcha instead of a scholar result");
				alert(zsc._captchaString);
				browser.runtime.sendMessage({
					"onGoogleScholarCaptcha": url
				});
				if (typeof Zotero.openInViewer !== 'undefined') {
					Zotero.openInViewer(url);
				} else if (typeof ZoteroStandalone !== 'undefined') {
					ZoteroStandalone.openInViewer(url);
				} else if (typeof Zotero.launchURL !== 'undefined') {
					Zotero.launchURL(url);
				} else {
					//window.gBrowser.loadOneTab(url, {inBackground: false});
				}
			}
		} else if (this.readyState === 4 && this.status === 429) {
			if (isDebug()) Zotero.debug('[scholar-citations] '
				+ 'could not retrieve the google scholar data. Server returned: ['
				+ xhr.status + ': '  + xhr.statusText + ']. '
				+ 'GS want\'s you to wait for ' + this.getResponseHeader("Retry-After")
				+ ' seconds before sending further requests.');

			if (this.responseText.indexOf('www.google.com/recaptcha/api.js') === -1) {
				if (isDebug()) Zotero.debug("[scholar-citations] "
					+ "received a captcha instead of a scholar result");
				alert(zsc._captchaString);
				browser.runtime.sendMessage({
					"onGoogleScholarCaptcha": url
				});
			}

		} else if (this.readyState === 4) {
			if (isDebug()) Zotero.debug('[scholar-citations] '
				+ 'could not retrieve the google scholar data. Server returned: ['
				+ xhr.status + ': '  + xhr.statusText + ']');
		} else {
			// request progress, I guess
		}
	};
	xhr.send();
};
