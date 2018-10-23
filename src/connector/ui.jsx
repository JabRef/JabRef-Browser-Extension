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

/**
 * A class that hacks into the Google Docs editor UI to allow performing various actions that should
 * be properly done using AppsScript if our script was document-bound, but it is not.
 * Possibly prone to some breakage if Google changes the editor, although no minified JS is 
 * called and it uses what seems to be stable classes and IDs in the html.
 */
Zotero.GoogleDocs.UI = {
	inLink: false,

	init: async function () {
		await Zotero.Inject.loadReactComponents();
		this.injectIntoDOM();
		this.addKeyboardShortcuts();
		this.interceptDownloads();
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
		Zotero.GoogleDocs.UI.citationEditor = 
			<Zotero.GoogleDocs.UI.LinkbubbleOverride edit={() => Zotero.GoogleDocs.editField()}/>;
		ReactDOM.render(Zotero.GoogleDocs.UI.citationEditor, Zotero.GoogleDocs.UI.citationEditorDiv);
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
				if (!Zotero.GoogleDocs.hasZoteroLinks) return;
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
	
	initModeMonitor: async function() {
		await new Promise(function(resolve) {
			if (!!document.querySelector('#docs-toolbar-mode-switcher .docs-icon-mode-edit.docs-icon-img')) return resolve();
			var observer = new MutationObserver(function(mutations) {
				if (!!document.querySelector('#docs-toolbar-mode-switcher .docs-icon-mode-edit.docs-icon-img')) {
					observer.disconnect();
					return resolve();
				}
			});
			observer.observe(document.querySelector('#docs-toolbar-mode-switcher'), {attributes: true});
		});
	
		this.modeObserver = new MutationObserver(function(mutations) {
			let inWritingMode = !!document.querySelector('#docs-toolbar-mode-switcher .docs-icon-mode-edit.docs-icon-img');
			if (this.enabled != inWritingMode) {
				this.toggleEnabled(inWritingMode);
			}
		}.bind(this));
		this.modeObserver.observe(document.querySelector('#docs-toolbar-mode-switcher'), {attributes: true});
		this.toggleEnabled(!!document.querySelector('#docs-toolbar-mode-switcher .docs-icon-mode-edit.docs-icon-img'));
	},
	
	toggleEnabled: function(state) {
		if (!state) state = !this.enabled;
		this.enabled = state;
		
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

	addKeyboardShortcuts: function() {
		var modifiers = {ctrlKey: true, altKey: true};
		if (Zotero.isMac) {
			modifiers = {metaKey: true, ctrlKey: true};
		}
		var textEventTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
		Zotero.Inject.addKeyboardShortcut(Object.assign({key: 'c'}, modifiers), Zotero.GoogleDocs.editField, textEventTarget);
	},
	
	activate: async function(force) {
		await Zotero.Connector_Browser.bringToFront(true);
		if (force && ! document.hasFocus()) {
			await this.displayAlert("Zotero needs the Google Docs tab to stay active for the current operation. " +
				"Please do not switch away from the window until the operation is complete.", 0, 0);
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
		var evt, pasteTarget;
		if (Zotero.isChrome) {
			var dt = new DataTransfer();
			dt.setData('text/plain', text);
			evt = new ClipboardEvent('paste', {clipboardData: dt});
			pasteTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body;
		} else {
			evt = new ClipboardEvent('paste', {dataType: 'text/plain', data: text});
			pasteTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body.children[0];
		}
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
	
	sendKeyboardEvent: async function(eventDescription) {
		var textEventTarget = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
		textEventTarget.dispatchEvent(new KeyboardEvent('keydown', eventDescription));
		await Zotero.Promise.delay();
		textEventTarget.dispatchEvent(new KeyboardEvent('keyup', eventDescription));
		textEventTarget.dispatchEvent(new KeyboardEvent('keypress', eventDescription));
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
	selectText: async function(text, url=null, stopOn=null) {
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
		
		var selection = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body;
		// We're looping through the same selection now
		if (selection.innerHTML == stopOn) {
			return false;
		}
		// The text content matches
		if (selection.textContent == text) {
			if (url) {
				// But url is provided
				// So we make sure that the url matches too or continue the search
				if (selection.children.length && selection.children[0].href == url) {
					return true;
				}
			} else {
			// Otherwise we've selected the text
				return true;
			}
		}
		
		// If stopOn is null, it means this is the first attempt at selecting the text we're looking for.
		// If this is triggered, it means the text does not exist in the document and we will return false
		// on next iteration or there are multiple instances of the text and we are looking to match an url
		if (stopOn == null) {
			stopOn = selection.innerHTML;
		}
		return this.selectText(text, url, stopOn);
	},
	
	insertFootnote: async function() {
		var insertFootnoteKbEvent = {ctrlKey: true, altKey: true, key: 'f', keyCode: 70};
		if (Zotero.isMac) {
			insertFootnoteKbEvent = {metaKey: true, altKey: true, key: 'f', keyCode: 70};
		}
		await Zotero.GoogleDocs.UI.sendKeyboardEvent(insertFootnoteKbEvent);
		// Somehow the simulated footnote shortcut inserts an "F" at the start of the footnote.
		// Why though?
		await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Backspace", keyCode: 8});
	},
	
	insertLink: async function(text, url) {
		var selection = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body.textContent;
		if (selection.length) {
			await Zotero.GoogleDocs.UI.sendKeyboardEvent({key: "Backspace", keyCode: 8});
		}
		await this.clickElement(document.getElementById('insertLinkButton'));
		document.getElementsByClassName('docs-link-insertlinkbubble-text')[0].value = text;
		var urlInput = document.getElementsByClassName('docs-link-urlinput-url')[0];
		urlInput.value = url;
		urlInput.dispatchEvent(new InputEvent('input', {data: text, bubbles: true}));
		await Zotero.Promise.delay();
		await this.clickElement(document.getElementsByClassName('docs-link-insertlinkbubble-buttonbar')[0].children[0]);
	},
	
	isInLink: function() {
		var selection = document.querySelector('.docs-texteventtarget-iframe').contentDocument.body;
		return selection.querySelector('a') || this.inLink
	},
	
	getSelectedFieldID: function() {
		var linkbubble = document.querySelector('.docs-bubble.docs-linkbubble-bubble');
		if (!linkbubble) return null;
		var isZoteroLink = linkbubble.children[0].innerText.indexOf(Zotero.GoogleDocs.config.fieldURL) == 0;
		var isLinkbubbleVisible = linkbubble.style.display == 'none';
		if (isLinkbubbleVisible || !isZoteroLink) return null;
		return linkbubble.children[0].innerText.substr(Zotero.GoogleDocs.config.fieldURL.length);
	}
}

Zotero.GoogleDocs.UI.Menu = class extends React.Component {
	constructor(props) {
		super(props);
		this.state = { open: Zotero.GoogleDocs.UI.menubutton.classList.contains('goog-control-open') }
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
		
		var modifiers = 'Ctrl+Alt+';
		if (Zotero.isMac) {
			modifiers = 'Ctrl+⌘';
		}

		return (
			<div id="docs-zotero-menu" className="goog-menu goog-menu-vertical docs-menu-hide-mnemonics" role="menu"
				style={style}>
				<Zotero.GoogleDocs.UI.Menu.Item label="Add/edit citation" handleClick={this.props.execCommand.bind(this, 'addEditCitation', null)} accel={`${modifiers}C`} />
				<Zotero.GoogleDocs.UI.Menu.Item label="Add/edit bibliography" handleClick={this.props.execCommand.bind(this, 'addEditBibliography', null)} />
				<Zotero.GoogleDocs.UI.Menu.Item label="Document preferences" handleClick={this.props.execCommand.bind(this, 'setDocPrefs', null)} />
				<Zotero.GoogleDocs.UI.Menu.Item label="Refresh" handleClick={this.props.execCommand.bind(this, 'refresh', null)} />
				<Zotero.GoogleDocs.UI.Menu.Item label="Unlink citations" handleClick={this.props.execCommand.bind(this, 'removeCodes', null)} />
			</div>
		);
	}

	componentDidMount() {
		this.observer = new MutationObserver(function(mutations) {
			for (let mutation of mutations) {
				if (mutation.attributeName != 'class' || 
					mutation.target.classList.contains('goog-control-open') == this.state.open) continue;
				let open = mutation.target.classList.contains('goog-control-open');
				this.setState({open});
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
		let open = style.display != 'none';
		let url = this.linkbubble.children[0].innerText;
		// Check if on zotero field link
		if (url.includes(Zotero.GoogleDocs.config.fieldURL)) {
			this.setState({open});
		}
		
		this.observer = new MutationObserver(function(mutations) {
			for (let mutation of mutations) {
				if (mutation.attributeName != 'style') continue;

				let url = this.linkbubble.children[0].innerText;
				// Check if on zotero field link
				if (!url.includes(Zotero.GoogleDocs.config.fieldURL)) {
					return this.setState({open: false});
				}
				
				let style = this.linkbubble.style;
				let open = style.display != 'none';
				
				Zotero.GoogleDocs.UI.inLink = open;

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
			var linkbubble = document.getElementsByClassName('docs-linkbubble-bubble')[0];	
			if (linkbubble) return resolve(linkbubble);
			var observer = new MutationObserver(function(mutations) {
				for (let mutation of mutations) {
					for (let node of mutation.addedNodes) {
						if (node.classList.contains('docs-linkbubble-bubble')) {
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
		Zotero.GoogleDocs.hasZoteroLinks = true;
		
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
		var shortcut = 'Ctrl+Alt+C';
		if (Zotero.isMac) {
			shortcut = 'Ctrl+⌘C';
		}
		return (
			<div
				className="docs-bubble" role="dialog" style={style}>
				<a href="javascript:void(0);">Edit with Zotero</a>
				<span style={{color: '#777', textDecoration: 'none', marginLeft: '1em'}}>
					 ({shortcut})
				 </span>
			</div>
		);
	}
};

})();
