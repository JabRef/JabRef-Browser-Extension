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
var isIntegrationEnabled = true;
if(window.top) {
	try {
		isTopWindow = window.top == window;
	} catch(e) {};
}	
if (!isTopWindow) return;

/**
 * Inject the Zotero menubutton ASAP so that kix attaches handlers for
 * hovering and clicking events when it initializes
 */

var menuAdded = false;
var buttonAdded = false;
var templateElem;

function addMenuOption(menubar) {
	if (isIntegrationEnabled) {
		var docsHelpMenu = document.getElementById('docs-help-menu');
		templateElem = document.createElement('template');
		templateElem.innerHTML = `<div id="docs-zotero-menubutton" class="menu-button goog-control goog-inline-block" role="menuitem" aria-haspopup="true" aria-disabled="false">Zotero</div>`;
		menubar.insertBefore(templateElem.content.firstChild, docsHelpMenu);
	}
	menuAdded = true;
}

function addToolbarButton(toolbar) {
	if (isIntegrationEnabled) {
		var imageURL;
		if (Zotero.isBrowserExt) {
			imageURL = browser.extension.getURL('images/zotero-z-16px-offline.png');
		} else {
			imageURL = `${safari.extension.baseURI}safari/images/zotero-new-z-16px.png`;
		}
		var shortcut = 'Ctrl+Alt+C';
		if (Zotero.isMac) {
			shortcut = 'Ctrl+⌘C';
		}
		var docsMoreButton = document.querySelector('#docs-primary-toolbars #docs-toolbar #moreButton');
		templateElem = document.createElement('template');
		templateElem.innerHTML = `<div id="zoteroAddEditCitation" class="goog-inline-block goog-toolbar-button" style="background-image: url(${imageURL}); background-repeat:no-repeat; background-position: center;" role="button" data-tooltip="Add/edit Zotero citation (${shortcut})"></div>`;
		toolbar.insertBefore(templateElem.content.firstChild, docsMoreButton);
	}
	buttonAdded = true;
}
var menubar = document.querySelector('#docs-menubar');
menubar && addMenuOption(menubar);
var toolbar = document.querySelector('#docs-toolbar');
toolbar && addToolbarButton(toolbar);

function removeUI() {
	if (menuAdded) {
		let menubutton = document.querySelector('#docs-zotero-menubutton');
		menubutton.parentNode.removeChild(menubutton);
	}
	if (buttonAdded) {
		let button = document.querySelector('#zoteroAddEditCitation');
		button.parentNode.removeChild(button);
	}
}

// We cannot identify whether we have edit access in the doc on load, so we inject UI so that
// kix code attaches relevant event listeners, but later remove it if it's a view-only doc
var editAccessObserver = new MutationObserver(function(mutations) {
	for (let mutation of mutations) {
		for (let node of mutation.addedNodes) {
			if (node.classList && node.classList.contains('titlebar-request-access-button')) {
				isIntegrationEnabled = false;
				removeUI();
			}
		}
	}
	if (menuAdded && buttonAdded) {
		editAccessObserver.disconnect();
	}
});

editAccessObserver.observe(document.documentElement, {childList: true, subtree: true});

// Need to kick this off asynchronously regardless of whether we've added the menu options synchronously here or not
(async function() {
	await Zotero.initDeferred.promise;
	isIntegrationEnabled = isIntegrationEnabled && await Zotero.Prefs.getAsync('integration.googleDocs.enabled');
	if (!isIntegrationEnabled) {
		if (menuAdded) {
			let menubutton = document.querySelector('#docs-zotero-menubutton');
			menubutton.parentNode.removeChild(menubutton);
		}
		if (buttonAdded) {
			let button = document.querySelector('#zoteroAddEditCitation');
			button.parentNode.removeChild(button);
		}
	}
})();

if (menuAdded && buttonAdded) {
	return;
}

var observer = new MutationObserver(function(mutations) {
	for (let mutation of mutations) {
		for (let node of mutation.addedNodes) {
			if (node.id == 'docs-menubar') {
				addMenuOption(node);
			}
			if (node.id == 'docs-toolbar') {
				addToolbarButton(node);
			}
		}
	}
	if (menuAdded && buttonAdded) {
		observer.disconnect();
	}
});

observer.observe(document.documentElement, {childList: true, subtree: true});

})();