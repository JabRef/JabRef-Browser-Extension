convertToBibTex = function(items) {
	console.log("JabRef: Convert items to BibTeX: %o", items);
	var deferred = Zotero.Promise.defer();

	var translation = new Zotero.Translate.Export();
	translation.setItems(items);
	translation.setTranslator("9cb70025-a888-4a29-a210-93ec52da40d4"); // BibTeX
	translation.setHandler("done", function(obj, worked) {
		if (worked) {
			deferred.resolve(obj.string);
		} else {
			deferred.reject("Problem translating the item to BibTeX.")
		}
	});
	translation.translate();
	return deferred.promise;
}

Zotero.Translate.ItemGetter = function() {
	this._itemsLeft = [];
	this._collectionsLeft = null;
	this._exportFileDirectory = null;
	this.legacy = false;
};

Zotero.Translate.ItemGetter.prototype = {
	"setItems": function(items) {
		this._itemsLeft = items;
		this._itemsLeft.sort(function(a, b) {
			return a.id - b.id;
		});
		this.numItems = this._itemsLeft.length;
	},

	/**
	 * Retrieves the next available item
	 */
	"nextItem": function() {
		if (this._itemsLeft.length != 0) {
			return this._itemsLeft.shift();
		} else {
			return false;
		}
	}
}

// This information is needed for some translators
// Taken from https://github.com/zotero/zotero-schema/blob/master/schema.json
Zotero.Schema = new function() {
	this.CSL_TYPE_MAPPINGS_REVERSE = {
		'article': 'document',
		'article-journal': 'journalArticle',
		'article-magazine': 'magazineArticle',
		'article-newspaper': 'newspaperArticle',
		'bill': 'bill',
		'book': 'book',
		'broadcast': 'tvBroadcast',
		'chapter': 'bookSection',
		'entry-dictionary': 'dictionaryEntry',
		'entry-encyclopedia': 'encyclopediaArticle',
		'graphic': 'artwork',
		'interview': 'interview',
		'legal_case': 'case',
		'legislation': 'statute',
		'manuscript': 'manuscript',
		'map': 'map',
		'motion_picture': 'film',
		'paper-conference': 'conferencePaper',
		'patent': 'patent',
		'personal_communication': 'letter',
		'post': 'forumPost',
		'post-weblog': 'blogPost',
		'report': 'report',
		'song': 'audioRecording',
		'speech': 'presentation',
		'thesis': 'thesis',
		'webpage': 'webpage'
	};

	this.CSL_TEXT_MAPPINGS = {
		"abstract": [
			"abstractNote"
		],
		"archive": [
			"archive"
		],
		"archive_location": [
			"archiveLocation"
		],
		"authority": [
			"court",
			"legislativeBody",
			"issuingAuthority"
		],
		"call-number": [
			"callNumber",
			"applicationNumber"
		],
		"chapter-number": [
			"session"
		],
		"collection-number": [
			"seriesNumber"
		],
		"collection-title": [
			"seriesTitle",
			"series"
		],
		"container-title": [
			"publicationTitle",
			"reporter",
			"code"
		],
		"dimensions": [
			"artworkSize",
			"runningTime"
		],
		"DOI": [
			"DOI"
		],
		"edition": [
			"edition"
		],
		"event": [
			"meetingName",
			"conferenceName"
		],
		"event-place": [
			"place"
		],
		"genre": [
			"type",
			"programmingLanguage"
		],
		"ISBN": [
			"ISBN"
		],
		"ISSN": [
			"ISSN"
		],
		"issue": [
			"issue",
			"priorityNumbers"
		],
		"journalAbbreviation": [
			"journalAbbreviation"
		],
		"language": [
			"language"
		],
		"medium": [
			"medium",
			"system"
		],
		"note": [
			"extra"
		],
		"number": [
			"number"
		],
		"number-of-pages": [
			"numPages"
		],
		"number-of-volumes": [
			"numberOfVolumes"
		],
		"page": [
			"pages"
		],
		"publisher": [
			"publisher"
		],
		"publisher-place": [
			"place"
		],
		"references": [
			"history",
			"references"
		],
		"scale": [
			"scale"
		],
		"section": [
			"section",
			"committee"
		],
		"shortTitle": [
			"shortTitle"
		],
		"source": [
			"libraryCatalog"
		],
		"status": [
			"legalStatus"
		],
		"title": [
			"title"
		],
		"title-short": [
			"shortTitle"
		],
		"URL": [
			"url"
		],
		"version": [
			"versionNumber"
		],
		"volume": [
			"volume",
			"codeNumber"
		]
	};
	this.CSL_DATE_MAPPINGS = {
		"accessed": "accessDate",
		"issued": "date",
		"submitted": "filingDate"
	};
	this.CSL_NAME_MAPPINGS = {
		"author": "author",
		"bookAuthor": "container-author",
		"composer": "composer",
		"director": "director",
		"editor": "editor",
		"interviewer": "interviewer",
		"recipient": "recipient",
		"reviewedAuthor": "reviewed-author",
		"seriesEditor": "collection-editor",
		"translator": "translator"
	};
}

browser.runtime.onMessage.addListener(message => {
	if (message.convertToBibTex) {
		console.log("JabRef: Got task to convert %o to BibTeX", message.convertToBibTex);
		return convertToBibTex(message.convertToBibTex);
	}
});
