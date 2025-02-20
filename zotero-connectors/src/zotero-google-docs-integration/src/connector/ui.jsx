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

let zoteroIconURL = Zotero.getExtensionURL('images/zotero-z-16px-offline.png');
let citationsUnlinkedIconURL = Zotero.getExtensionURL('images/citations-unlinked.png');

const TEXT_INPUT_SELECTORS = ['.docs-link-insertlinkbubble-text', '.docs-link-smartinsertlinkbubble-text',
	'.appsElementsLinkInsertionLinkTextInput input'];
const URL_INPUT_SELECTORS = ['.docs-link-urlinput-url', '.docs-link-searchinput-search',
	'.appsElementsLinkInsertionLinkSearchInput input'];
const SYNC_ICON_SELECTORS = ['.docs-icon-sync', '.docs-sync-20'];
const SYNC_TIMEOUT = 10e3;

/**
 * A class that hacks into the Google Docs editor UI to allow performing various actions that should
 * be properly done using AppsScript if our script was document-bound, but it is not.
 * Possibly prone to some breakage if Google changes the editor, although no minified JS is 
 * called and it uses what seems to be stable classes and IDs in the html.
 */
Zotero.GoogleDocs.UI = {
	inLink: false,
	enabled: true,
	isUpdating: false,
	docSyncedPromise: Zotero.Promise.resolve(),

	init: async function () {
		await Zotero.Inject.loadReactComponents();
		let haveEditAccess = !document.querySelector('.titlebar-request-access-button');
		if (!haveEditAccess) {
			return;
		}
		await this.addKeyboardShortcuts();
		this.injectIntoDOM();
		if (this.checkIsDocx()) {
			return;
		}
		this.interceptDownloads();
		this.interceptPaste();
		this.initModeMonitor();
		Zotero.GoogleDocs.UI.LinkInsertBubble.init();
	},

	injectIntoDOM: async function () {
		Zotero.GoogleDocs.UI.menubutton = document.getElementById('docs-zotero-menubutton');

		// The Zotero Menu
		Zotero.GoogleDocs.UI.menuDiv = document.createElement('div');
		Zotero.GoogleDocs.UI.menuDiv.id = 'docs-zotero-menu-container';
		document.getElementsByTagName('body')[0].appendChild(Zotero.GoogleDocs.UI.menuDiv);
		Zotero.GoogleDocs.UI.menu = <Zotero.GoogleDocs.UI.Menu execCommand={Zotero.GoogleDocs.execCommand}/>;
		ReactDOM.render(Zotero.GoogleDocs.UI.menu, Zotero.GoogleDocs.UI.menuDiv);
		
		// The Zotero button
		Zotero.GoogleDocs.UI.button = document.querySelector('#zoteroAddEditCitation');
		Zotero.GoogleDocs.UI.button.addEventListener('click', () => {
			Zotero.GoogleDocs.UI.enabled && Zotero.GoogleDocs.execCommand('addEditCitation')
		});
		
		// CitationEditor - link bubble observer
		Zotero.GoogleDocs.UI.citationEditorDiv = document.createElement('div');
		Zotero.GoogleDocs.UI.citationEditorDiv.id = 'docs-zotero-citationEditor-container';
		document.getElementsByClassName('kix-appview-editor')[0].appendChild(Zotero.GoogleDocs.UI.citationEditorDiv);
		Zotero.GoogleDocs.UI.linkbubbleOverrideRef = React.createRef();
		Zotero.GoogleDocs.UI.citationEditor = 
			<Zotero.GoogleDocs.UI.LinkbubbleOverride
				ref={Zotero.GoogleDocs.UI.linkbubbleOverrideRef}
				edit={() => Zotero.GoogleDocs.editField()}
			/>;
		ReactDOM.render(Zotero.GoogleDocs.UI.citationEditor, Zotero.GoogleDocs.UI.citationEditorDiv);
		
		// Please wait screen
		Zotero.GoogleDocs.UI.pleaseWaitContainer = document.createElement('div');
		Zotero.GoogleDocs.UI.pleaseWaitContainer.id = 'docs-zotero-pleaseWait-container';
		document.querySelector('.kix-appview-editor-container').insertBefore(
			Zotero.GoogleDocs.UI.pleaseWaitContainer,
			document.querySelector('.kix-appview-editor'));
		ReactDOM.render(<Zotero.GoogleDocs.UI.PleaseWait ref={ref => Zotero.GoogleDocs.UI.pleaseWaitScreen = ref}/>,
			Zotero.GoogleDocs.UI.pleaseWaitContainer);
			
		// Orphaned citation UI
		Zotero.GoogleDocs.UI.orphanedCitationsContainer = document.createElement('div');
		Zotero.GoogleDocs.UI.orphanedCitationsContainer.classList.add('goog-inline-block');
		Zotero.GoogleDocs.UI.orphanedCitationsContainer.id = 'docs-zotero-orphanedCitation-container';
		document.querySelector('.docs-titlebar-buttons').insertBefore(
			Zotero.GoogleDocs.UI.orphanedCitationsContainer,
			document.querySelector('#docs-titlebar-share-client-button'));
		ReactDOM.render(<Zotero.GoogleDocs.UI.OrphanedCitations
			ref={ref => Zotero.GoogleDocs.UI.orphanedCitations = ref}/>,
			Zotero.GoogleDocs.UI.orphanedCitationsContainer)
	},
	
	interceptDownloads: async function() {
		// Wait for the menu to be loaded (not present in the DOM until user actually tries to access it)
		var downloadMenuItems = await new Promise(function(resolve) {
			var xpathResult = document.evaluate(
				'//span[@class="goog-menuitem-label" and contains(., "Microsoft Word (.docx)")]', 
				document
			);
			var menuItem = xpathResult.iterateNext();
			if (menuItem) return resolve(menuItem.parentElement.parentElement.parentElement.childNodes);
			var observer = new MutationObserver(function(mutations) {
				for (let mutation of mutations) {
					for (let node of mutation.addedNodes) {
						if (node.textContent.includes("Microsoft Word (.docx)")) {
							observer.disconnect();
							return resolve(node.childNodes);
						}
					}
				}
			});
			observer.observe(document.body, {childList: true});
		});
		let i = 0;
		for (let elem of downloadMenuItems) {
			if (elem.textContent.includes('.txt')) continue;
			elem.addEventListener('mouseup', async function(event) {
				if (!Zotero.GoogleDocs.hasZoteroCitations ||
					Zotero.GoogleDocs.downloadInterceptBlocked) return;
				if (Zotero.GoogleDocs.UI.dontInterceptDownload) {
					Zotero.GoogleDocs.UI.dontInterceptDownload = false;
					return;
				}
				event.stopImmediatePropagation();
				event.preventDefault();
				
				let msg = [
					Zotero.getString('integration_googleDocs_unlinkBeforeSaving_warning'),
					'\n\n',
					Zotero.getString('integration_googleDocs_unlinkBeforeSaving_instructions')
				].join('');
				let options = {
					title: Zotero.getString('general_warning'),
					button1Text: Zotero.getString('integration_googleDocs_unlinkBeforeSaving_downloadAnyway'),
					button2Text: Zotero.getString('general_cancel'),
					message: msg.replace(/\n/g, '<br/>')
				};

				let result = await Zotero.Inject.confirm(options);
				if (result.button == 1) {
					Zotero.GoogleDocs.UI.dontInterceptDownload = true;
					Zotero.GoogleDocs.UI.clickElement(elem);
				}
			});
			i++;
		}
	},
	
	interceptPaste: function() {
		let pasteTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body;
		pasteTarget.addEventListener('paste', async (e) => {
			this.setupWaitForSave();
			let data = (e.clipboardData || window.clipboardData)
				.getData('application/x-vnd.google-docs-document-slice-clip+wrapped');
			if (!data) return true;
			let docSlices = [JSON.parse(JSON.parse(data).data).resolved];
			if ('dsl_relateddocslices' in docSlices[0]) {
				// This is footnotes which are structured in the same way as the
				// main data object
				for (let key in docSlices[0].dsl_relateddocslices) {
					docSlices.push(docSlices[0].dsl_relateddocslices[key]);
				}
			}
			let keysToCodes = {};
			let ignoreKeys = new Set();
			for (let data of docSlices) {
				for (let k in data.dsl_entitymap) {
					let rangeName = data.dsl_entitymap[k].nre_n;
					if (!rangeName) continue;
					// Ignore document data and bibliography style
					if (rangeName.indexOf("Z_D") === 0 || rangeName.indexOf("Z_B") === 0) {
						ignoreKeys.add(k);
					} else {
						keysToCodes[k] = rangeName;
					}
				}
			}
			if (!Object.keys(keysToCodes).length) {
				return true;
			}
			// We could show a dialog here asking whether the user wishes to link pasted citations
			// but who is going to say no?
			// else {
			// 	let msg = [
			// 		Zotero.getString('integration_googleDocs_onCitationPaste_notice', ZOTERO_CONFIG.CLIENT_NAME),
			// 		'\n\n',
			// 		Zotero.getString('integration_googleDocs_onCitationPaste_warning'),
			// 	].join('');
			// 	let result = await this.displayAlert(msg, 0, 2);
			// 	if (!result) return true;
			// }
			let links = [], ranges = [], text = "";
			for (let data of docSlices) {
				for (let obj of data.dsl_styleslices) {
					if (obj.stsl_type == 'named_range') ranges = ranges.concat(obj.stsl_styles);
					else if (obj.stsl_type == 'link') links = links.concat(obj.stsl_styles);
				}
				text = text + data.dsl_spacers;
			}
			let linksToRanges = {};
			for (let i = 0; i < links.length; i++) {
				if (links[i] && links[i].lnks_link
						&& links[i].lnks_link.ulnk_url.startsWith(Zotero.GoogleDocs.config.fieldURL)) {
					let linkStart = i;
					let linkEnd = i+1;
					for (; i < links.length; i++) {
						if (links[i] && links[i].lnks_link === null) {
							linkEnd = i;
							break;
						}
					}
					let linkText = text.substring(linkStart, linkEnd);
					let link = links[linkStart].lnks_link.ulnk_url;
					let linkRanges = ranges[linkStart].nrs_ei.cv.opValue
					// `&& key in keysToCode` is kinda strange
					// since we have just grabbed all the named ranges above from doc slices
					// but we get reports of copy pasting failing occassionally
					// and finally got a reproducible case:
					// https://forums.zotero.org/discussion/80427/
						.filter(key => !ignoreKeys.has(key) && key in keysToCodes)
						.map(key => keysToCodes[key]);
					if (linkRanges.some(code => code.includes('CSL_BIBLIOGRAPHY'))) continue;
					linksToRanges[link] = {text: linkText, codes: linkRanges};
				}
			}
			if (!Object.keys(linksToRanges).length) {
				return true;
			}
			try {
				Zotero.GoogleDocs.UI.toggleUpdatingScreen(true);
				await this.waitToSaveInsertion();
				let docID = document.location.href.match(/https:\/\/docs.google.com\/document\/d\/([^/]*)/)[1];
				let tabID = new URL(document.location.href).searchParams.get('tab');
				let orphanedCitations;
				if (Zotero.GoogleDocs.Client.isV2) {
					let doc = new Zotero.GoogleDocs.Document(await Zotero.GoogleDocs_API.getDocument(docID, this.tabId));
					await doc.addPastedRanges(linksToRanges);
					orphanedCitations = doc.orphanedCitations;
				} else {
					let response = await Zotero.GoogleDocs_API.run({docID, tabID}, 'addPastedRanges', [linksToRanges]);
					orphanedCitations = response.orphanedCitations;
				}
				if (orphanedCitations && orphanedCitations.length) {
					Zotero.GoogleDocs.UI.orphanedCitations.setCitations(orphanedCitations);
				}
			} catch (e) {
				if (e.message == "Handled Error") {
					Zotero.debug('Handled Error in interceptPaste()');
					return;
				}
				Zotero.debug(`Exception in interceptPaste()`);
				Zotero.logError(e);
				Zotero.GoogleDocs.Client.prototype.displayAlert(e.message, 0, 0);
			} finally {
				Zotero.GoogleDocs.UI.toggleUpdatingScreen(false);
				Zotero.GoogleDocs.lastClient = null;
			}
		}, {capture: true});
	},
	
	checkIsDocx: function() {
		this.isDocx = document.querySelector('#office-editing-file-extension').innerHTML.includes('docx');
		return this.isDocx;
	},
	
	displayDocxAlert: function() {
		const options = {
			title: ZOTERO_CONFIG.CLIENT_NAME,
			button2Text: "",
			message: Zotero.getString('integration_googleDocs_docxAlert', ZOTERO_CONFIG.CLIENT_NAME),
		};
		return Zotero.Inject.confirm(options);
	},

	/**
	 * @returns {Promise<boolean>} true if citation editing should continue
	 */
	displayOrphanedCitationAlert: async function() {
		const options = {
			title: Zotero.getString('general_warning'),
			button1Text: Zotero.getString('integration_googleDocs_orphanedCitations_alertButton'),
			button2Text: "Cancel",
			button3Text: Zotero.getString('general_moreInfo'),
			message: Zotero.getString('integration_googleDocs_orphanedCitations_alert', ZOTERO_CONFIG.CLIENT_NAME),
		};
		let result = await Zotero.Inject.confirm(options);
		if (result.button == 2) {
			return false;
		}
		else if (result.button == 3) {
			Zotero.Connector_Browser.openTab('https://www.zotero.org/support/kb/google_docs_citations_unlinked');
			return false;
		}
		return true;
	},
	
	toggleUpdatingScreen: function(display) {
		if (typeof display === 'undefined') {
			this.isUpdating = !this.isUpdating;
		}
		else {
			this.isUpdating = display;
		}
		Zotero.GoogleDocs.UI.pleaseWaitScreen.toggle(this.isUpdating);
	},
	
	initModeMonitor: async function() {
		await new Promise(function(resolve) {
			if (!!document.querySelector('#docs-toolbar-mode-switcher .goog-toolbar-menu-button-caption .docs-icon-img')) return resolve();
			var observer = new MutationObserver(function(mutations) {
				if (!!document.querySelector('#docs-toolbar-mode-switcher .goog-toolbar-menu-button-caption .docs-icon-img')) {
					observer.disconnect();
					return resolve();
				}
			});
			observer.observe(document.querySelector('#docs-toolbar-mode-switcher'), {attributes: true});
		});
	
		this.modeObserver = new MutationObserver(function(mutations) {
			let modeSwitcherElement = document.querySelector('#docs-toolbar-mode-switcher');
			let inWritingMode = modeSwitcherElement.className.includes('edit-mode');
			if (this.enabled != inWritingMode) {
				this.toggleEnabled(inWritingMode);
			}
		}.bind(this));
		this.modeObserver.observe(document.querySelector('#docs-toolbar-mode-switcher'), {attributes: true});
		this.toggleEnabled(!!document.querySelector('#docs-toolbar-mode-switcher.edit-mode'));
	},
	
	toggleEnabled: function(state) {
		if (!state) state = !this.enabled;
		this.enabled = state;

		this.linkbubbleOverrideRef.current.forceUpdate();
		if (!state) {
			this.menubutton.classList.add('goog-control-disabled');
			this._menubuttonHoverRemoveObserver = new MutationObserver(function() {
				if (this.menubutton.classList.contains('goog-control-hover')) {
					this.menubutton.classList.remove('goog-control-hover');
				}
				if (this.menubutton.classList.contains('goog-control-open')) {
					this.menubutton.classList.remove('goog-control-open');
				}
			}.bind(this));
			this._menubuttonHoverRemoveObserver.observe(this.menubutton, {attributes: true});
			
			this.button.classList.add('goog-toolbar-button-disabled');
			this._buttonHoverRemoveObserver = new MutationObserver(function() {
				if (this.button.classList.contains('goog-toolbar-button-hover')) {
					this.button.classList.remove('goog-toolbar-button-hover');
				}
			}.bind(this));
			this._buttonHoverRemoveObserver.observe(this.button, {attributes: true});
		} else {
			this.menubutton.classList.remove('goog-control-disabled');
			this.button.classList.remove('goog-toolbar-button-disabled');
			if (this._menubuttonHoverRemoveObserver) {
				this._menubuttonHoverRemoveObserver.disconnect();
				this._buttonHoverRemoveObserver.disconnect();
				delete this._menubuttonHoverRemoveObserver;
			}
		}
	},

	addKeyboardShortcuts: async function() {
		// The main cite shortcut
		let modifiers = await Zotero.Prefs.getAsync('shortcuts.cite');

		// Store for access by Menu and Linkbubble widgets
		this.shortcut = Zotero.Utilities.Connector.kbEventToShortcutString(modifiers);
		// The toolbar button is managed by GDocs
		document.querySelector('#zoteroAddEditCitation').dataset.tooltip =
			`Add/edit Zotero citation (${this.shortcut})`;

		var textEventTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
		Zotero.Inject.addKeyboardShortcut(Object.assign(modifiers), Zotero.GoogleDocs.editField, textEventTarget);

		// Open Zotero menu shortcut, mimicking google doc's native shortcuts
		modifiers = {altKey: true, keyCode: 90}
		if (Zotero.isMac) {
			modifiers.ctrlKey = true;
		} else {
			modifiers.shiftKey = true;
		}
		Zotero.Inject.addKeyboardShortcut(Object.assign(modifiers), () => {
			this.clickElement(this.menubutton);
		}, textEventTarget);
	},
	
	activate: async function(force, message) {
		message = message || "Zotero needs the Google Docs tab to stay active for the current operation. " +
				"Please do not switch away from the browser until the operation is complete.";
		await Zotero.Connector_Browser.bringToFront(true);
		if (force && ! document.hasFocus()) {
			await this.displayAlert(message, 0, 0);
			return this.activate(force);
		}
	},
	
	displayAlert: async function (text, icons, options = 0) {
		if (typeof options == 'number') {
			switch (options) {
			case 0:
				options = {
					button1Text: 'OK',
					button2Text: ''
				};
				break;
			case 1:
				options = {
					button1Text: 'OK',
					button2Text: 'Cancel'
				};
				break;
			case 2:
				options = {
					button1Text: 'Yes',
					button2Text: 'No'
				};
				break;
			case 3:
				options = {
					button1Text: 'Yes',
					button2Text: 'No',
					button3Text: 'Cancel'
				};
				break;
			}
		}
		if (!options.title) {
			options.title = "Zotero";
		}
		options.message = text.replace(/\n/g, '<br/>');
		
		let result = await Zotero.Inject.confirm(options);
		return result.button;
	},

	/**
	 * Write text to the document via a paste event.
	 * 
	 * NOTE: Unsupported in Safari!
	 * 
	 * @param text
	 * @returns {Promise<void>}
	 */
	writeText: async function(text) {
		var evt;
		// On Safari this is the <body> element, but on other browsers it's a <div> in the <body>.
		// selector captures all both variants
		var pasteTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument.querySelector('[contenteditable]');
		if (!Zotero.isFirefox) {
			var dt = new DataTransfer();
			dt.setData('text/html', text);
			evt = new ClipboardEvent('paste', {clipboardData: dt});
		} else {
			evt = new ClipboardEvent('paste', {dataType: 'text/html', data: text});
		}
		// After reading minified code for 2 days I figured out why a synthetic 'text/plain' paste works,
		// but 'text/html' paste doesn't. Kix' code sets the paste target/input proxy to an empty string, then 
		// receives the paste event into it and on the next event loop looks at the innerHTML of the paste target
		// which is then inserted into the document proper. For some reason the synthetic paste event fails to
		// trigger the browser to set the input proxy's inner HTML, so we do it manually.
		// We set the pasteTarget.innerHTML in the next event loop callback which thankfully runs before
		// Kix's own code and allows us to paste in proper HTML. Beautiful.
		setTimeout(() => pasteTarget.innerHTML = text);
		pasteTarget.dispatchEvent(evt);
		this.setupWaitForSave();
		await Zotero.Promise.delay();
	},
	
	clickElement: async function(element) {
		element.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
		await Zotero.Promise.delay();
		element.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, button: 0}));
		element.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
		await Zotero.Promise.delay();
	},
	
	sendKeyboardEvent: async function(eventDescription, target) {
		if (!target) {
			target = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
			
			// Keyboard events to texteventtarget (i.e. the pseudo-element in focus
			// when the cursor is placed and blinking in a document) have to
			// be issued in this specific order or it breaks on slower systems
			target.dispatchEvent(new KeyboardEvent('keydown', eventDescription));
			await Zotero.Promise.delay();
			target.dispatchEvent(new KeyboardEvent('keyup', eventDescription));
			target.dispatchEvent(new KeyboardEvent('keypress', eventDescription));
			await Zotero.Promise.delay();
			return;
		}

		// Keyboard events to dialogs (only tested for the link dialog) have to be
		// issued in this order or they do not work
		target.dispatchEvent(new KeyboardEvent('keydown', eventDescription));
		target.dispatchEvent(new KeyboardEvent('keypress', eventDescription));
		await Zotero.Promise.delay();
		target.dispatchEvent(new KeyboardEvent('keyup', eventDescription));
		await Zotero.Promise.delay();
	},

	/**
	 * This is a crazy function that simulates user interface interactions to select text in
	 * the doc using the find dialog. We don't have any other tools to manipulate the location
	 * of the user cursor, or even to examine the document contents properly from the front-end for
	 * that matter (and we do not have access to user cursor from the back-end because our script
	 * is not document-bound)
	 * 
	 * @param {String} text - text to select
	 * @param {String} [url=null] - optional expected link of the text 
	 * @returns {Promise<void>}
	 */
	selectText: async function(text, url=null) {
		this.toggleUpdatingScreen(false);
		var openFindDialogKbEvent = {ctrlKey: true, key: 'f', keyCode: '70'};
		if (Zotero.isMac) {
			openFindDialogKbEvent = {metaKey: true, key: 'f', keyCode: '70'};
		}
		// On document load findinput is not present, but we need to set its value before
		// clicking ctrl+f
		if (!document.querySelector('.docs-findinput-input')) {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent(openFindDialogKbEvent);
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-close'));

			await Zotero.GoogleDocs.UI.sendKeyboardEvent(openFindDialogKbEvent);
			document.querySelector('.docs-findinput-input').value = text;
			document.querySelector('.docs-findinput-input').dispatchEvent(new KeyboardEvent('input'));
			await Zotero.Promise.delay();
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-close'));
		} else {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent(openFindDialogKbEvent);
			document.querySelector('.docs-findinput-input').value = text;
			document.querySelector('.docs-findinput-input').dispatchEvent(new KeyboardEvent('input'));
			await Zotero.Promise.delay();
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-down'));
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-close'));
		}
		let match = /[0-9]+[^0-9]+([0-9]+)/.exec(document.querySelector('.docs-findinput-count').textContent);
		let numMatches = 0;
		if (match) {
			numMatches = parseInt(match[1]);
		}
		if (!numMatches) {
			return false;
		}
		if (!url || (Zotero.GoogleDocs.UI.inLink && Zotero.GoogleDocs.UI.lastLinkURL == url)) {
			return true;
		}
		
		for (numMatches--; numMatches > 0; numMatches--) {
			await this.activate(true);
			await Zotero.GoogleDocs.UI.sendKeyboardEvent(openFindDialogKbEvent);
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-down'));
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-close'));
			if (Zotero.GoogleDocs.UI.inLink && Zotero.GoogleDocs.UI.lastLinkURL == url) {
				return true;
			}
		}
	},
	
	insertFootnote: async function() {
		var insertFootnoteKbEvent = {ctrlKey: true, altKey: true, key: 'f', keyCode: 70};
		if (Zotero.isMac) {
			insertFootnoteKbEvent = {metaKey: true, altKey: true, key: 'f', keyCode: 70};
		}
		await Zotero.GoogleDocs.UI.sendKeyboardEvent(insertFootnoteKbEvent);
		// Somehow the simulated footnote shortcut inserts an "F" at the start of the footnote.
		// But not on a mac. Why? Why not on a Mac?
		if (!Zotero.isMac) {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Backspace", keyCode: 8});
		}
	},
	
	insertLink: async function(text, url) {
		var selectedText = this.getSelectedText();
		// If we do not remove the selected text content, then the insert link dialog does not
		// contain a field to specify link text and our code breaks
		if (selectedText.length) {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Backspace", keyCode: 8});
		}
		await Zotero.GoogleDocs.UI.openInsertLinkPopup();
		let textInput = this._getElemBySelectors(TEXT_INPUT_SELECTORS);
		textInput.value = text;
		textInput.dispatchEvent(new InputEvent('input', {data: text, bubbles: true}));
		let urlInput = this._getElemBySelectors(URL_INPUT_SELECTORS);
		urlInput.value = url;
		urlInput.dispatchEvent(new InputEvent('input', {data: url, bubbles: true}));

		await Zotero.GoogleDocs.UI.closeInsertLinkPopup(true);
	},
	
	undo: async function() {
		var undoKbEvent = {ctrlKey: true, key: 'z', keyCode: 90};
		if (Zotero.isMac) {
			undoKbEvent = {metaKey: true, key: 'z', keyCode: 90};
		}
		await Zotero.GoogleDocs.UI.sendKeyboardEvent(undoKbEvent);
	},
	
	isInLink: function() {
		return this.inLink
	},
	
	getSelectedText: function() {
		var selection = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body.textContent;
		// on macOS a U+200B ZERO WIDTH SPACE is the text content when nothing is selected here
		// so we remove and trim various unicode zero-width space characters here
		selection = selection.replace(/[\u200B-\u200D\uFEFF]/g, '');
		return selection;
	},
	
	getSelectedLink: function() {
		let elem = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body.querySelector('a');
		if (!elem) return "";
		else return elem.getAttribute('href');
	},
	
	moveCursorToEndOfCitation: async function() {
		// Sometimes it takes a while for the doc to receive updates from the back end
		// so we wait here preemptively. Worst case the cursor won't properly move to the front
		// of the item.
		await Zotero.Promise.delay(500);
		let isZoteroLink = url => url.indexOf(Zotero.GoogleDocs.config.fieldURL) == 0;
		
		let textEventTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
		let copyEventTarget = textEventTarget.querySelector('[contenteditable]');;
		copyEventTarget.innerHTML = ""
		copyEventTarget.dispatchEvent(new CustomEvent('copy'));
		let selectedText = this.getSelectedText();
		if (selectedText.length) {
			textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39}));
		}

		// Move cursor right until we are out of the Zotero link.
		textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39, shiftKey: true}));
		copyEventTarget.dispatchEvent(new CustomEvent('copy'));
		selectedText = this.getSelectedText();
		let selectionLink = this.getSelectedLink();
		while (selectedText.length && isZoteroLink(selectionLink)) {
			textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39}));
			copyEventTarget.innerHTML = ""
			textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39, shiftKey: true}));
			copyEventTarget.dispatchEvent(new CustomEvent('copy'));
			selectedText = this.getSelectedText();
			selectionLink = this.getSelectedLink();
		}
		textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowLeft", keyCode: 37}));
		copyEventTarget.innerHTML = ""
	},
	
	openInsertLinkPopup: async function(...args) {
		return Zotero.GoogleDocs.UI.LinkInsertBubble.open(...args);
	},
	
	closeInsertLinkPopup: async function(...args) {
		return Zotero.GoogleDocs.UI.LinkInsertBubble.close(...args);
	},
	
	/**
	 * Get the field ID under cursor by moving the selection left by one, and right by one character
	 * and checking whether the selected text is a Zotero citation
	 */
	getSelectedFieldID: async function() {
		let isZoteroLink = url => url.indexOf(Zotero.GoogleDocs.config.fieldURL) == 0;
		
		let textEventTarget = this._getElemBySelectors('.docs-texteventtarget-iframe').contentDocument;
		let copyEventTarget = textEventTarget.querySelector('[contenteditable]');;
		copyEventTarget.innerHTML = ""
		copyEventTarget.dispatchEvent(new CustomEvent('copy'));
		let selectionLink = this.getSelectedLink();
		let selectedText = this.getSelectedText();
		
		// If there is already selected text do not modify the selection cursor
		if (!isZoteroLink(selectionLink) && !selectedText.length) {
			// Otherwise check text to the left
			textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowLeft", keyCode: 37, shiftKey: true}));
			// If you modify the selection cursor by dispatching fake keyboard events and the current
			// document focus is not in the text of the document (but rather in e.g. a menu), the internal
			// google docs code does not update the element in the document which usually contains
			// the HTML of the selected text.
			// We dispatch a fake copy event which forces the update, and then we can retrieve
			// the updated current selection.
			// But we first set the copyEventTarget to be empty, because if the current selection is empty
			// the copy event doesn't update this field and it causes fake reports of selection.
			copyEventTarget.innerHTML = ""
			copyEventTarget.dispatchEvent(new CustomEvent('copy'));
			selectionLink = this.getSelectedLink()
			selectedText = this.getSelectedText();
			// If the cursor was at the start of the text then no selection in the previous step occurred
			if (selectedText.length) {
				textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39}));
				// The element with the selection content does not get reset when we reset the cursor like this
				// so we do it manually.
				copyEventTarget.innerHTML = ""
			}
			if (!isZoteroLink(selectionLink)) {
				// And check text to the right
				textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39, shiftKey: true}));
				copyEventTarget.innerHTML = ""
				copyEventTarget.dispatchEvent(new CustomEvent('copy'));
				selectionLink = this.getSelectedLink()
				selectedText = this.getSelectedText();
				textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowLeft", keyCode: 37}));
				copyEventTarget.innerHTML = ""
			}
		}

		if (!isZoteroLink(selectionLink)) return;
		return selectionLink.substr(Zotero.GoogleDocs.config.fieldURL.length);
	},
	
	setupWaitForSave: function() {
		// Setup a promise that will resolve when the sync indicator changes to spinner
		// and then back to not-spinner, or timeout in SYNC_TIMEOUT.
		this.docSyncedPromise = Promise.any([Zotero.Promise.delay(SYNC_TIMEOUT), new Promise((resolve) => {
			let syncStarted = !!this._getElemBySelectors(SYNC_ICON_SELECTORS, false);
			let observer = new MutationObserver(() => {
				if (!syncStarted) {
					if (this._getElemBySelectors(SYNC_ICON_SELECTORS, false)) {
						syncStarted = true;
					}
					return;
				}
				else if (!this._getElemBySelectors(SYNC_ICON_SELECTORS, false)) {
					observer.disconnect();
					resolve();
				}
			});
			let saveIndicator = this._getElemBySelectors('.docs-save-indicator-container');
			observer.observe(saveIndicator, {childList: true, subtree: true});
		})]);
	},

	// Wait for google docs to save the text insertion
	waitToSaveInsertion: async function() {
		return this.docSyncedPromise;
	},

	_getElemBySelectors(selectors, throwError=true) {
		if (!Array.isArray(selectors)) {
			selectors = [selectors];
		}
		for (let selector of selectors) {
			let elem = document.querySelector(selector);
			if (elem) return elem;
		}
		if (!throwError) return;
		Zotero.GoogleDocs.UI.displayAlert('Google Docs UI has changed. Please submit a <a href="https://www.zotero.org/support/reporting_problems">Report ID</a> from the Zotero Connector on the <a href="https://forums.zotero.org">Zotero Forums</a>.')
		throw new Error(`Google Docs UI has changed. Trying to retrieve ${JSON.stringify(selectors)}`);
	}
}

Zotero.GoogleDocs.UI.LinkInsertBubble = {
	_linkInsertBubble: null,
	_linkInsertBubblePromise: null,
	_openDeferred: Zotero.Promise.defer(),
	_observer: null,
	_observeTimeout: null,
	
	init() {
		this._stylesheet = document.createElement('style');
		this._stylesheet.className = 'zotero-stylesheet';
		document.children[0].appendChild(this._stylesheet);
		this._linkInsertBubble = Zotero.GoogleDocs.UI._getElemBySelectors('.docsLinkSmartinsertlinkBubble', false);
		if (!this._linkInsertBubble) {
			// Link insert popup does not exist in the DOM until the user (or Zotero) opens
			// it for the first time, so we wait for that to happen
			this._linkInsertBubblePromise = new Promise((resolve) => {
				let observer = new MutationObserver(() => {
					this._linkInsertBubble = Zotero.GoogleDocs.UI._getElemBySelectors('.docsLinkSmartinsertlinkBubble', false);
					if (this._linkInsertBubble) {
						observer.disconnect();
						resolve(this._linkInsertBubble);
					}
				});
				observer.observe(Zotero.GoogleDocs.UI._getElemBySelectors('.kix-appview-editor'), { childList: true });
			})
		}
		else {
			this._linkInsertBubblePromise = Promise.resolve(this._linkInsertBubble);
		}
	},
	
	async get() {
		return this._linkInsertBubblePromise;
	},

	// Google Docs JS manages the styling of the insert link card and if we change it on the element
	// things break, so we force it invisible (to prevent from flash opening) via a stylesheet
	// injection
	makeInvisible() {
		this._stylesheet.sheet.insertRule('.docsLinkSmartinsertlinkCardContainer {visibility: hidden !important}')
	},

	makeVisible() {
		while (this._stylesheet.sheet.cssRules.length) {
			this._stylesheet.sheet.deleteRule(0)
		}
	},
	
	async waitToOpenAndMakeInvisible() {
		let linkInsertBubble = await this.get();
		this.makeInvisible();
		let observer, timeout;
		await new Promise((resolve) => {
			observer = new MutationObserver((mutationList) => {
				if (linkInsertBubble.style.opacity === '1' && !linkInsertBubble.style.transition) {
					// 2024 02 Google Docs linkbubble changes added an opening animation. If we attempt to close the dialog
					// too soon after opening it, it gets stuck in the animating view, with visibility: hidden; display block;,
					// breaking cursor clicks on the document. It has a 218ms animation that we wait for here.
					resolve();
				}
			});
			observer.observe(linkInsertBubble, { attributeFilter: ["style", 'subtree', 'childList', 'attributes'] });
			// Make sure we are not permanently breaking the insert link bubble if something
			// throws an error in our code and the observer does not get disconnected
			timeout = setTimeout(() => {
				Zotero.logError('GoogleDocs.UI.LinkInsertBubble: waiting to open has timed out. Link insert bubble animation watcher broken?')
				resolve();
			}, 2000);
		});
		clearTimeout(timeout);
		observer.disconnect()
	},
	
	async open() {
		// Setup insert link bubble hiding
		let openPromise = this.waitToOpenAndMakeInvisible();
		await Zotero.GoogleDocs.UI.clickElement(Zotero.GoogleDocs.UI._getElemBySelectors('#insertLinkButton'));
		await openPromise;
	},
	
	async waitToCloseAndMakeVisible() {
		let linkInsertBubble = await this.get();
		let observer, timeout;
		await new Promise((resolve) => {
			observer = new MutationObserver(() => {
				if (linkInsertBubble.style.opacity === '0' && !linkInsertBubble.style.transition) {
					// 2024 02 Google Docs linkbubble changes added an opening animation. If we attempt to close the dialog
					// too soon after opening it, it gets stuck in the animating view, with visibility: hidden; display block;,
					// breaking cursor clicks on the document. It has a 218ms animation that we wait for here.
					resolve();
				}
			});
			observer.observe(linkInsertBubble, { attributeFilter: ["style"] });
			// Make sure we are not permanently breaking the insert link bubble if something
			// throws an error in our code and the observer does not get disconnected
			timeout = setTimeout(() => {
				Zotero.logError('GoogleDocs.UI.LinkInsertBubble: waiting to close has timed out. Link insert bubble animation watcher broken?')
				resolve();
			}, 2000);
		});
		clearTimeout(timeout);
		observer.disconnect()
		this.makeVisible();
	},
	
	async close(confirm=true) {
		let urlInput = Zotero.GoogleDocs.UI._getElemBySelectors(URL_INPUT_SELECTORS);
		let eventTarget = document.querySelector('.docs-calloutbubble-bubble').parentElement;
		let closePromise = this.waitToCloseAndMakeVisible();
		// Make sure the dialog is fully opened before we attempt to close it
		if (confirm && urlInput.value) {
			Zotero.GoogleDocs.UI.setupWaitForSave();
			let applyButton = document.querySelector('.appsElementsLinkInsertionApplyButton');
			// Likely a bug in the new google docs link insertion UI where pressing Enter
			// does not close the dialog, and will probably be changed/fixed, but for now
			// we simulate a click on the apply button.
			// The reason the old code doesn't click the apply button is that when the previous
			// iteration of the link insertion bubble went live it didn't originally include an
			// apply button that we could click on and you could only accept the dialog by pressing
			// Enter. Sigh.	
			if (applyButton) {
				// But wait there's more. The button is disabled until urlInput is set, but sometimes
				// the button stays disabled for a little while longer.
				if (applyButton.hasAttribute('disabled')) {
					await new Promise((resolve) => {
						let observer = new MutationObserver(() => {
							if (!applyButton.hasAttribute('disabled')) {
								observer.disconnect();
								resolve();
							}
						});
						observer.observe(applyButton, {attributes: true});
					})
				}
				await Zotero.GoogleDocs.UI.clickElement(applyButton);
			}
			else {
				await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Enter", keyCode: 13}, eventTarget);
			}
		}
		else {
			let textEventTarget = document.querySelector('.docs-texteventtarget-iframe');
			urlInput.dispatchEvent(new KeyboardEvent('keydown', {key: "Escape", keyCode: 27, bubbles: true}));
			if (urlInput.value) {
				textEventTarget.contentDocument
					.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39}));
			}
			textEventTarget.focus();
		}
		await closePromise;
	}
};

Zotero.GoogleDocs.UI.Menu = class extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			open: Zotero.GoogleDocs.UI.menubutton.classList.contains('goog-control-open'),
			displayAddNoteButton: false,
			displayCitationExplorerOption: false,
			highlightedItem: -1
		}
		this._items = [];
	}
	
	componentDidMount() {
		this.observer = new MutationObserver(async function(mutations) {
			for (let mutation of mutations) {
				if (mutation.attributeName != 'class' ||
					mutation.target.classList.contains('goog-control-open') == this.state.open) continue;
				let open = mutation.target.classList.contains('goog-control-open');
				let displayAddNoteButton = await Zotero.Connector.getPref('googleDocsAddNoteEnabled');
				let displayCitationExplorerOption = await Zotero.Connector.getPref('googleDocsCitationExplorerEnabled');
				this.setState({ open, displayAddNoteButton, displayCitationExplorerOption, highlightedItem: -1 });
			}
		}.bind(this));
		this.observer.observe(Zotero.GoogleDocs.UI.menubutton, {attributes: true});
		this._addKeyboardNavigation();
	}
	
	_addKeyboardNavigation() {
		document.querySelector('#docs-menubar').addEventListener('keydown', (e) => {
			if (!this.state.open) return;
			if (e.key == 'ArrowDown') {
				this._setHighlighted((this.state.highlightedItem + 1) % this._items.length);
			}
			else if (e.key == 'ArrowUp') {
				this._setHighlighted((this.state.highlightedItem - 1) % this._items.length);
			}
			else if (e.key == 'Enter') {
				if (this.state.highlightedItem != -1) {
					this._items[this.state.highlightedItem].props.activate();
				}
			}
			else {
				for (let item of this._items) {
					if (item.props.shortcutKey == e.key) {
						item.props.activate();
					}
				}
			}
		});
	}
	
	_setHighlighted(idx) {
		this.setState({ highlightedItem: idx })
		if (idx != -1) {
			document.querySelector('#docs-menubar').setAttribute('aria-activedescendant', `:z${idx}`);
		}
	}

	render() {
		let rect = Zotero.GoogleDocs.UI.menubutton.getBoundingClientRect();
		var style = {
			display: this.state.open ? 'block' : 'none',
			top: `${rect.top+rect.height}px`, left: `${rect.left}px`,
		};
		if (!Zotero.GoogleDocs.UI.enabled) {
			style.display = 'none';
		}
		
		// Hide the menu that gdocs governs - we display our own.
		if (this.state.open) {
			var menus = document.getElementsByClassName('goog-menu-vertical');
			for (let menu of menus) {
				if (menu.id != 'docs-zotero-menu') {
					menu.style.display = 'none';
				}
			}
		}
		
		this._items = [
			<Zotero.GoogleDocs.UI.Menu.Item label="Add/edit citation..." shortcutKey='c' activate={this.props.execCommand.bind(this, 'addEditCitation', null)} accel={Zotero.GoogleDocs.UI.shortcut} />,
		]
		
		if (this.state.displayAddNoteButton) {
			this._items.push(<Zotero.GoogleDocs.UI.Menu.Item label="Add note..." shortcutKey='n' activate={this.props.execCommand.bind(this, 'addNote', null)} />);
		}

		this._items.push(
			<Zotero.GoogleDocs.UI.Menu.Item label="Add/edit bibliography" shortcutKey='b' activate={this.props.execCommand.bind(this, 'addEditBibliography', null)} />,
		);
		
		if (this.state.displayCitationExplorerOption) {
			this._items.push(<Zotero.GoogleDocs.UI.Menu.Item label="Citation explorer..." shortcutKey='e' activate={this.props.execCommand.bind(this, 'citationExplorer', null)} />);
		}
		
		this._items.push(
			<Zotero.GoogleDocs.UI.Menu.Item label="Document preferences..." shortcutKey='p' activate={this.props.execCommand.bind(this, 'setDocPrefs', null)} />,
			<Zotero.GoogleDocs.UI.Menu.Item label="Refresh" shortcutKey='r' activate={this.props.execCommand.bind(this, 'refresh', null)} />,
			<Zotero.GoogleDocs.UI.Menu.Item
				label="Switch word processors..."
				shortcutKey='s'
				activate={async () => {
					let clientVersion = await Zotero.Connector.getClientVersion();
					if (clientVersion) {
						let major = parseInt(clientVersion.split('.')[0]);
						let patch = parseInt(clientVersion.split('.')[2]);
						if (! (major > 5 || major == 5 && patch >= 67)) {
							return Zotero.Connector_Browser.newerVersionRequiredPrompt();
						}
					}
					this.props.execCommand('exportDocument');
				}} />,
			<Zotero.GoogleDocs.UI.Menu.Item label="Unlink citations..." shortcutKey='u' activate={this.props.execCommand.bind(this, 'removeCodes', null)} />,
		)
		
		this._items.forEach((item, i) => {
			item.props.idx = i;
			item.props.highlighted = this.state.highlightedItem == i;
			item.props.setHighlighted = this._setHighlighted.bind(this);
		});
		
		return (
			<div id="docs-zotero-menu" className="goog-menu goog-menu-vertical docs-menu-hide-mnemonics" role="menu"
				style={style}>
				{this._items}
			</div>
		);
	}
}

Zotero.GoogleDocs.UI.Menu.Item = class extends React.Component {
	constructor(props) {
		super(props);
	}
	render() {
		let className = "goog-menuitem apps-menuitem";
		if (this.props.highlighted) {
			className += " goog-menuitem-highlight";
		}
		let label = this.props.label;
		let shortcutIdx = label.toLowerCase().indexOf(this.props.shortcutKey);
		// Underline shortcut key
		if (this.props.shortcutKey && shortcutIdx != -1) {
			label = <span className="goog-menuitem-label">{label.substring(0, shortcutIdx)}<u>{label[shortcutIdx]}</u>{label.substring(shortcutIdx + 1)}</span>;
		}
		else {
			label = <span className="goog-menuitem-label">{label}</span>;
		}
		return (
			<div onMouseDown={this.props.activate} onMouseEnter={this.toggleHighlight.bind(this, true)} onMouseLeave={this.toggleHighlight.bind(this, false)}
				className={className} role="menuitem" id={`:z${this.props.idx}`}>
				
				<div className="goog-menuitem-content">
					{label}
					{this.props.accel ? <span className="goog-menuitem-accel">{this.props.accel}</span> : ''}
				</div>
			</div>
		);
	}
	
	toggleHighlight(highlight) {
		this.props.setHighlighted(highlight ? this.props.idx : -1);
	}
};

Zotero.GoogleDocs.UI.LinkbubbleOverride = class extends React.Component {
	constructor(props) {
		super(props);
		this.state = {open: false, top: "-10000px", left: "-10000px"};
	}
	async componentDidMount() {
		// Ensure clicks on the popup won't remove the actual link popup and prevent events from bubbling
		// Side effect of this is that we cannot rely on react's own event handling code
		ReactDOM.findDOMNode(this).addEventListener('mousedown', (event) => {
			event.stopPropagation();
			if (event.target.tagName == 'A') {
				this.props.edit();
			}
		}, false);
		
		this.linkbubble = await this.waitForLinkbubble();
		this.lastTop = "";
		let style = this.linkbubble.style;
		const url = Zotero.Utilities.trim(this.linkbubble.querySelector('a').href);
		const open = style.display != 'none';

		Zotero.GoogleDocs.UI.inLink = open;
		Zotero.GoogleDocs.UI.lastLinkURL = url;
		
		// Check if on zotero field link
		if (url.includes(Zotero.GoogleDocs.config.fieldURL)) {
			this.setState({open});
		}
		
		this.observer = new MutationObserver(function(mutations) {
			for (let mutation of mutations) {
				if (mutation.attributeName != 'style') continue;

				let style = this.linkbubble.style;
				const url = Zotero.Utilities.trim(this.linkbubble.querySelector('a').href);
				const open = style.display != 'none';

				Zotero.GoogleDocs.UI.inLink = open;
				Zotero.GoogleDocs.UI.lastLinkURL = url;
				
				// Check if on zotero field link
				if (!url.includes(Zotero.GoogleDocs.config.fieldURL)) {
					return this.setState({open: false});
				}

				// This is us moving the linkbubble away from view
				if (this.state.open == open &&
					style.top == '-100000px') return;
				
				return this.setState({open});
			}
		}.bind(this));
		this.observer.observe(this.linkbubble, {attributes: true, attributeOldValue: true});
	}
	
	waitForLinkbubble() {
		return new Promise(function(resolve) {
			var linkbubble = document.querySelector('#docs-link-bubble');	
			if (linkbubble) return resolve(linkbubble);
			var observer = new MutationObserver(function(mutations) {
				for (let mutation of mutations) {
					for (let node of mutation.addedNodes) {
						if (node.id == "docs-link-bubble") {
							observer.disconnect();
							Zotero.GoogleDocs.UI.inLink = true;
							return resolve(node);
						}
					}
				}
			});
			observer.observe(document.getElementsByClassName('kix-appview-editor')[0], {childList: true});
		});
	}
	
	render() {
		if (!this.state.open) {
			return <div></div>
		}
		Zotero.GoogleDocs.hasZoteroCitations = true;
		
		var top;
		// If we click away from the link and then on it again, google docs doesn't update
		// the linkbubble top position so we need to store it manually
		if (this.linkbubble.style.top == '-100000px') {
			top = this.lastTop;
		} else {
			top = this.lastTop = this.linkbubble.style.top;
			this.linkbubble.style.top = "-100000px";
		}
		var style = {left: this.linkbubble.style.left, top};
		// If plugin disabled we still don't want to show the linkbubble for Zotero citations,
		// but we don't want to show the Edit with Zotero linkbubble either.
		if (!Zotero.GoogleDocs.UI.enabled) {
			style.display = 'none';
		}
		return (
			<div
				className="docs-bubble docs-linkbubble-bubble docs-linkbubble-link-preview" role="dialog" style={style}>
				<div className="link-bubble-header">
					<div className="docs-link-bubble-mime-icon goog-inline-block docs-material">
						<div className="docs-icon goog-inline-block ">
							<div style={{
								backgroundImage: `url(${zoteroIconURL})`,
								backgroundRepeat: 'no-repeat',
								backgroundPosition: 'center',
								width: "100%",
								height: "100%"
							}} />
						</div>
					</div>
					<a style={{
						fontFamily: '"Google Sans",Roboto,RobotoDraft,Helvetica,Arial,sans-serif',
						fontWeight: 500,
						padding: "0 6px",
						textDecoration: "none !important"
					}} href="javascript:void(0);">Edit with Zotero</a>
					<span style={{color: '#777', textDecoration: 'none', marginRight: '6px'}}>
						 ({Zotero.GoogleDocs.UI.shortcut})
					 </span>
				</div>
			</div>
		);
	}
};

Zotero.GoogleDocs.UI.PleaseWait = class extends React.Component {
	constructor(props) {
		super(props);
		this.state = {isHidden: true};
	}
	
	toggle(display) {
		this.setState({isHidden: !display});
	}
	
	render() {
		return (
			<div style={{
				position: "absolute",
				width: "100%",
				height: "100%",
				background: "#ffffffd4",
				zIndex: "100000",
				textAlign: "center",
				justifyContent: "center",
				paddingTop: "31px",
				display: this.state.isHidden ? "none" : 'flex',
			}}>
				<div className="docs-bubble">
					{Zotero.getString('integration_googleDocs_updating', ZOTERO_CONFIG.CLIENT_NAME)}
					<br/>
					{Zotero.getString('general_pleaseWait')}
				</div>
			</div>
		)
	}
}


Zotero.GoogleDocs.UI.OrphanedCitations = React.forwardRef(function(props, ref) {
	let [open, setOpen] = React.useState(false);
	let [citations, setCitations] = React.useState([]);
	
	React.useImperativeHandle(ref, () => ({
		setCitations: function(newCitations) {
			// Open upon first detecting orphaned citations
			if (newCitations.length && citations.length != newCitations.length) setOpen(true);
			setCitations(newCitations);
		}
	}));

	// A bit dirty here. Injecting a hover CSS rule. The other option is to
	// do it via background scripts, which would be a million lines of code
	// especially since we eval-load gdocs code on browserExt.
	const buttonID = "zotero-docs-orphaned-citations-button";
	const hoverRule = `#${buttonID}:hover {background: rgba(0, 0, 0, .06);}`;
	let styleElem;
	React.useEffect(() => {
		styleElem = document.createElementNS("http://www.w3.org/1999/xhtml", 'style');
		document.head.appendChild(styleElem);
		styleElem.sheet.insertRule(hoverRule);
		return () => {
			document.head.removeChild(styleElem);
		}
	}, []);

	React.useEffect(() => {
		let listener = () => open && setOpen(false);
		document.addEventListener('click', listener, {capture: true});
		return () => {
			document.removeEventListener('click', listener);
		}
	}, [open]);

	return ([
		<div
			role={"button"}
			id={buttonID}
			data-tooltip={Zotero.getString('integration_googleDocs_orphanedCitations_buttonTooltip', ZOTERO_CONFIG.CLIENT_NAME)}
			aria-label={Zotero.getString('integration_googleDocs_orphanedCitations_buttonTooltip', ZOTERO_CONFIG.CLIENT_NAME)}
			style={{
				borderRadius: "50%",
				cursor: "pointer",
				marginRight: "9px",
				marginLeft: "-9px",
				maxHeight: "40px",
				display: citations.length ? 'block' : 'none',
			}}
			onClick={() => setOpen(!open)}
		>
			<div className="goog-inline-block" style={{ width: "40px", height: "40px" }}>
				<div style={{
					backgroundImage: `url(${citationsUnlinkedIconURL})`,
					backgroundRepeat: 'no-repeat',
					backgroundPosition: 'center',
					width: "100%",
					height: "100%",
				}} />
			</div>
		</div>,
		<Zotero.GoogleDocs.UI.OrphanedCitationsList citations={citations} open={open}/>
	])
});

Zotero.GoogleDocs.UI.OrphanedCitationsList = function({ citations, open }) {
	function renderCitation(citation) {
		return (
			<li style={{
				fontSize: "var(--docs-material-font-size-normal,13px)",
				marginTop: ".6em"
			}}>
				<a className="zotero-orphaned-citation" href="#"
					onClick={() => Zotero.GoogleDocs.UI.selectText(citation.text, citation.url)}>
					{citation.text}
				</a>
			</li>
		);
	}

	return (
		<div className="zotero-orphaned-citations-popover docs-bubble" style={{
			position: "absolute",
			right: "-140px",
			top: "48px",
			width: "500px",
			minHeight: "5px",
			zIndex: "110000",
			display: open ? "block" : 'none',
			textAlign: "left",
		}}>
			<div className="zotero-orphaned-citations-disclaimer"
				style={{
					whiteSpace: 'normal',
					fontSize: "1.2em",
					color: "#333",
					marginBottom: ".4em"
				}}
				dangerouslySetInnerHTML={{
					__html: Zotero.getString('integration_googleDocs_orphanedCitations_disclaimer', ZOTERO_CONFIG.CLIENT_NAME)
				}}
			/>
			<ul className="zotero-orphaned-citations-list" style={{
				listStyle: "none",
				marginBottom: ".4em",
				padding: "0"
			}}>
				{citations.map(renderCitation)}
			</ul>
		</div>
	);
}

})();
