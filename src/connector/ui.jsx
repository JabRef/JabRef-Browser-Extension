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
			let insertPromise = this.waitToSaveInsertion();
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
				await insertPromise;
				let documentId = document.location.href.match(/https:\/\/docs.google.com\/document\/d\/([^/]*)/)[1];
				let orphanedCitations;
				if (Zotero.GoogleDocs.Client.isV2) {
					let doc = new Zotero.GoogleDocs.Document(await Zotero.GoogleDocs_API.getDocument(documentId));
					await doc.addPastedRanges(linksToRanges);
					orphanedCitations = doc.orphanedCitations;
				} else {
					let response = await Zotero.GoogleDocs_API.run(documentId, 'addPastedRanges', [linksToRanges]);
					orphanedCitations = response.orphanedCitations;
				}
				if (orphanedCitations && orphanedCitations.length) {
					Zotero.GoogleDocs.UI.orphanedCitations.setCitations(response.orphanedCitations);
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
		this.isUpdating = display || !this.isUpdating;
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
			let indicatorIconElement = document.querySelector('#docs-toolbar-mode-switcher .goog-toolbar-menu-button-caption .docs-icon-img');
			let inWritingMode = indicatorIconElement.className.includes('edit-pen');
			if (this.enabled != inWritingMode) {
				this.toggleEnabled(inWritingMode);
			}
		}.bind(this));
		this.modeObserver.observe(document.querySelector('#docs-toolbar-mode-switcher'), {attributes: true});
		this.toggleEnabled(!!document.querySelector('#docs-toolbar-mode-switcher .goog-toolbar-menu-button-caption .docs-icon-img'));
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
		let modifiers = await Zotero.Prefs.getAsync('shortcuts.cite');

		// Store for access by Menu and Linkbubble widgets
		this.shortcut = Zotero.Utilities.Connector.kbEventToShortcutString(modifiers);
		// The toolbar button is managed by GDocs
		document.querySelector('#zoteroAddEditCitation').dataset.tooltip =
			`Add/edit Zotero citation (${this.shortcut})`;

		var textEventTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
		Zotero.Inject.addKeyboardShortcut(Object.assign(modifiers), Zotero.GoogleDocs.editField, textEventTarget);
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
		var pasteTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body.children[0];
		if (!pasteTarget) {
			// The body has no children on Safari
			pasteTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body;
		}
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
		await Zotero.Promise.delay();
	},
	
	clickElement: async function(element) {
		element.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
		await Zotero.Promise.delay();
		element.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, button: 0}));
		element.dispatchEvent(new MouseEvent('mouseclick', {bubbles: true, button: 0}));
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
		// Selection doesn't update unless the tab is active
		await this.activate(true);
		var openFindDialogKbEvent = {ctrlKey: true, key: 'f', keyCode: '70'};
		if (Zotero.isMac) {
			openFindDialogKbEvent = {metaKey: true, key: 'f', keyCode: '70'};
		}
		// On document load findinput is not present, but we need to set its value before
		// clicking ctrl+f
		if (!document.querySelector('.docs-findinput-input')) {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent(openFindDialogKbEvent);
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-close'));

			document.querySelector('.docs-findinput-input').value = text;
			await Zotero.GoogleDocs.UI.sendKeyboardEvent(openFindDialogKbEvent);
			await Zotero.GoogleDocs.UI.clickElement(document.querySelector('#docs-findbar-id .docs-icon-close'));
		} else {
			document.querySelector('.docs-findinput-input').value = text;
			await Zotero.GoogleDocs.UI.sendKeyboardEvent(openFindDialogKbEvent);
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
		if (selectedText.length) {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Backspace", keyCode: 8});
		}
		await Zotero.GoogleDocs.UI.openInsertLinkPopup();
		let textInput = document.getElementsByClassName('docs-link-insertlinkbubble-text')[0];
		// Sudden 2021-05-03 change
		if (!textInput) {
			textInput = document.getElementsByClassName('docs-link-smartinsertlinkbubble-text')[0];
		}
		textInput.value = text;
		textInput.dispatchEvent(new InputEvent('input', {data: text, bubbles: true}));
		var urlInput = document.getElementsByClassName('docs-link-urlinput-url')[0];
		// New gdocs link input UI.
		if (!urlInput) {
			urlInput = document.getElementsByClassName('docs-link-searchinput-search')[0];
		}
		urlInput.value = url;
		urlInput.dispatchEvent(new InputEvent('input', {data: url, bubbles: true}));
		await Zotero.Promise.delay();

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
		selection = selection.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
		return selection;
	},
	
	moveCursorToEndOfCitation: async function() {
		var selectedText = this.getSelectedText();
		if (selectedText.length) {
			var textEventTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
			textEventTarget.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39}));
			await Zotero.Promise.delay();
		}
		// We don't have a way to know whether our changes submitted via the API have propagated
		// to the client yet, and the cursor moves back to before-the-citation location after
		// they do.
		// This is not ideal, but it will work for users with decent internet connection
		await Zotero.Promise.delay(500);
		return this.getSelectedFieldID();
	},
	
	openInsertLinkPopup: async function() {
		await this.clickElement(document.getElementById('insertLinkButton'));
		return await Zotero.Promise.delay();
	},
	
	closeInsertLinkPopup: async function(confirm=true) {
		urlInput = document.querySelector('.docs-link-insertlinkbubble .docs-link-urlinput-url');
		if (!urlInput) {
			urlInput = document.querySelector('.docs-link-searchinput-search');
		}	
		let eventTarget = document.querySelector('.docs-calloutbubble-bubble.docs-linkbubble-bubble').parentElement;
		if (confirm && urlInput.value) {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Enter", keyCode: 13}, eventTarget);
		}
		else {
			let textEventTarget = document.querySelector('.docs-texteventtarget-iframe');
			// Recently GDocs has made a change to footnote navigation where pressing [Escape]
			// within the footnote jumps the cursor out of the footnote. This however has created
			// an issue where issuing [Escape] to close the insert link popup also jumps out of a footnote
			// which breaks citing if the cursor is already in the footnote (we open the insert link dialog
			// to check whether we're in a Zotero link and then immediately close it).
			// Unfortunately simply sending an [Escape] keyboard event to the insert link popup does nothing.
			// After two days of reading minified code I have discovered that gdocs expects the active element
			// to be outside of the insert link popup when the insert link popup
			// receives the blur event triggered by either pressing [Escape] or clicking somewhere else on
			// on the document.
			// In real world this happens because the [Escape] keydown event switches the active element to
			// the textEventTarget but the keyup event is then still issued on the originally active element
			// -- the insert link popup, and the keyup event is used to close the actual dialog.
			// The reason for the kix code being like this is probably so that switching windows (which issues
			// the 'blur' event) wouldn't close the insert link popup.
			// We skip issuing all the keyboard events and just refocus and issue a 'blur' event directly.
			let focusTarget = textEventTarget.contentDocument.querySelector('div');
			if (!focusTarget) {
				focusTarget = textEventTarget.contentDocument.body;
			}
			focusTarget.focus();
			urlInput.dispatchEvent(new FocusEvent('blur', {bubbles: true}));
			if (urlInput.value) {
				textEventTarget.contentDocument
					.dispatchEvent(new KeyboardEvent('keydown', {key: "ArrowRight", keyCode: 39}));
			}
			textEventTarget.focus();
		}
		await Zotero.Promise.delay();
	},
	
	getSelectedFieldID: async function() {
		await Zotero.GoogleDocs.UI.openInsertLinkPopup();
		urlInput = document.querySelector('.docs-link-insertlinkbubble .docs-link-urlinput-url');
		if (!urlInput) {
			urlInput = document.querySelector('.docs-link-searchinput-search');
		}
		url = urlInput.value;
		
		await Zotero.GoogleDocs.UI.closeInsertLinkPopup(false);
		
		let isZoteroLink = url.indexOf(Zotero.GoogleDocs.config.fieldURL) == 0;
		if (!isZoteroLink) return null;
		return url.substr(Zotero.GoogleDocs.config.fieldURL.length);
	},

	// Wait for google docs to save the text insertion
	waitToSaveInsertion: async function() {
		await Zotero.Promise.delay(5);
		var deferred = Zotero.Promise.defer();
		// In case the new UI is being pushed out in phases we'll keep the old logic for now
		var newStyleSaveLabel = document.querySelector('.docs-save-indicator-container');
		if (!newStyleSaveLabel) {
			// We cannot check for specific text because of localization, so we just wait for the text
			// to change. Best bet.
			var observer = new MutationObserver(() => deferred.resolve());
			var saveLabel = document.getElementsByClassName('docs-title-save-label-text')[0];
			observer.observe(saveLabel, {childList: true});	
		} else {
			// Ahh this used to be a pain but google added a sync indicator so now waiting to finalize
			// an insertion is super reliable!
			if (!document.querySelector('.docs-icon-sync')) {
				// Except that it isn't, since the sync is not triggered immediately (anymore?)
				// so some waits to save insertion have been falling through and causing failed pastes.
				await Zotero.Promise.delay(1000);
				// We wait an extra second and if there's still no sync indicator then:
				// - The action that we thought should trigger a sync doesn't actually do that
				// - Or a full sync will have occurred in this second and we're clear to do whatever we need
				//   in the backend
				if (!document.querySelector('.docs-icon-sync')) {
					return;
				}
			}
			observer = new MutationObserver(() => {
				if (!document.querySelector('.docs-icon-sync')) {
					deferred.resolve()
				}
			});
			saveLabel = document.querySelector('.docs-save-indicator-container');
			observer.observe(saveLabel, {childList: true, subtree: true});
		}
		await deferred.promise;
		observer.disconnect();
	}
}

Zotero.GoogleDocs.UI.Menu = class extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			open: Zotero.GoogleDocs.UI.menubutton.classList.contains('goog-control-open'),
			displayAddNoteButton: false
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
		
		let exportMenuItem = (
			<Zotero.GoogleDocs.UI.Menu.Item
				label="Switch word processors..."
				handleClick={async () => {
					let clientVersion = await Zotero.Connector.getClientVersion();
					if (clientVersion) {
						let major = parseInt(clientVersion.split('.')[0]);
						let patch = parseInt(clientVersion.split('.')[2]);
						if (! (major > 5 || major == 5 && patch >= 67)) {
							return Zotero.Connector_Browser.newerVersionRequiredPrompt();
						}
					}
					this.props.execCommand('exportDocument');
				}} />
		);
		
		let addNoteMenuItem = "";
		if (this.state.displayAddNoteButton) {
			addNoteMenuItem = (<Zotero.GoogleDocs.UI.Menu.Item label="Add note..." handleClick={this.props.execCommand.bind(this, 'addNote', null)} />);
		}
		
		return (
			<div id="docs-zotero-menu" className="goog-menu goog-menu-vertical docs-menu-hide-mnemonics" role="menu"
				style={style}>
				<Zotero.GoogleDocs.UI.Menu.Item label="Add/edit citation..." handleClick={this.props.execCommand.bind(this, 'addEditCitation', null)} accel={Zotero.GoogleDocs.UI.shortcut} />
				{addNoteMenuItem}
				<Zotero.GoogleDocs.UI.Menu.Item label="Add/edit bibliography" handleClick={this.props.execCommand.bind(this, 'addEditBibliography', null)} />
				<Zotero.GoogleDocs.UI.Menu.Item label="Document preferences..." handleClick={this.props.execCommand.bind(this, 'setDocPrefs', null)} />
				<Zotero.GoogleDocs.UI.Menu.Item label="Refresh" handleClick={this.props.execCommand.bind(this, 'refresh', null)} />
				{exportMenuItem}
				<Zotero.GoogleDocs.UI.Menu.Item label="Unlink citations..." handleClick={this.props.execCommand.bind(this, 'removeCodes', null)} />
			</div>
		);
	}

	componentDidMount() {
		this.observer = new MutationObserver(async function(mutations) {
			for (let mutation of mutations) {
				if (mutation.attributeName != 'class' || 
					mutation.target.classList.contains('goog-control-open') == this.state.open) continue;
				let open = mutation.target.classList.contains('goog-control-open');
				let displayAddNoteButton = await Zotero.Connector.getPref('googleDocsAddNoteEnabled');
				this.setState({ open, displayAddNoteButton });
			}
		}.bind(this));
		this.observer.observe(Zotero.GoogleDocs.UI.menubutton, {attributes: true});
	}
}

Zotero.GoogleDocs.UI.Menu.Item = class extends React.Component {
	constructor(props) {
		super(props);
		this.state = {highlight: false};
	}
	render() {
		let className = "goog-menuitem apps-menuitem";
		if (this.state.highlight) {
			className += " goog-menuitem-highlight";
			className += " goog-menuitem-highlight";
		}
		return (
			<div onMouseDown={this.props.handleClick} onMouseEnter={this.toggleHighlight.bind(this, true)} onMouseLeave={this.toggleHighlight.bind(this, false)}
				className={className} role="menuitem">
				
				<div className="goog-menuitem-content">
					<span className="goog-menuitem-label">{this.props.label}</span>
					{this.props.accel ? <span className="goog-menuitem-accel">{this.props.accel}</span> : ''}
				</div>
			</div>
		);
	}
	
	toggleHighlight(highlight) {
		this.setState({highlight});
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
			if (!citations.length && newCitations.length) setOpen(true);
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
