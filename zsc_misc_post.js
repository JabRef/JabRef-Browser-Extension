/**
 * This file partially overrides methods of zotero-scholar-citations/chrome/content/zsc.js for customization purposes.
 */

zsc.processItems = function(items) {
	while (item = items.shift()) {
		if (!zsc.hasRequiredFields(item)) {
			if (isDebug()) Zotero.debug('[scholar-citations] '
				+ 'skipping item "' + item.getField('title') + '"'
				+ ' it has either an empty title or is missing creator information');
			continue;
		}
		this.retrieveCitationData(item, function(item, citeCount) {
			if (isDebug()) Zotero.debug('[scholar-citations] '
				+ 'Updating item "' + item.getField('title') + '"');
			zsc.updateItem(item, citeCount);
		});
	}
};