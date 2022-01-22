/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
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

import FilePicker from 'zotero/modules/filePicker';

/*
 * This object contains the various functions for the interface
 */
var ZoteroPane = new function()
{
	var _unserialized = false;
	this.collectionsView = false;
	this.itemsView = false;
	this.progressWindow = false;
	this._listeners = {};
	this.__defineGetter__('loaded', function () { return _loaded; });
	var _lastSelectedItems = [];
	
	//Privileged methods
	this.destroy = destroy;
	this.isFullScreen = isFullScreen;
	this.handleKeyDown = handleKeyDown;
	this.handleKeyUp = handleKeyUp;
	this.setHighlightedRowsCallback = setHighlightedRowsCallback;
	this.handleKeyPress = handleKeyPress;
	this.getSelectedCollection = getSelectedCollection;
	this.getSelectedSavedSearch = getSelectedSavedSearch;
	this.getSelectedItems = getSelectedItems;
	this.getSortedItems = getSortedItems;
	this.getSortField = getSortField;
	this.getSortDirection = getSortDirection;
	this.setItemsPaneMessage = setItemsPaneMessage;
	this.clearItemsPaneMessage = clearItemsPaneMessage;
	this.viewSelectedAttachment = viewSelectedAttachment;
	this.reportErrors = reportErrors;
	
	this.document = document;
	
	var self = this,
		_loaded = false, _madeVisible = false,
		titlebarcolorState, titleState, observerService,
		_reloadFunctions = [], _beforeReloadFunctions = [];
	
	/**
	 * Called when the window containing Zotero pane is open
	 */
	this.init = function () {
		Zotero.debug("Initializing Zotero pane");
		
		if (!Zotero.isPDFBuild) {
			let win = document.getElementById('main-window')
			win.setAttribute('legacytoolbar', 'true');
			document.getElementById('titlebar').hidden = true;
			document.getElementById('tab-bar-container').hidden = true;
		}
		
		// Set key down handler
		document.addEventListener('keydown', ZoteroPane_Local.handleKeyDown, true);
		document.addEventListener('blur', ZoteroPane.handleBlur);
		
		// Init toolbar buttons for all progress queues
		let progressQueueButtons = document.getElementById('zotero-pq-buttons');
		let progressQueues = Zotero.ProgressQueues.getAll();
		for (let progressQueue of progressQueues) {
			let button = document.createElement('toolbarbutton');
			button.id = 'zotero-tb-pq-' + progressQueue.getID();
			button.hidden = progressQueue.getTotal() < 1;
			button.addEventListener('command', function () {
				Zotero.ProgressQueues.get(progressQueue.getID()).getDialog().open();
			}, false);
			
			progressQueue.addListener('empty', function () {
				button.hidden = true;
			});
			
			progressQueue.addListener('nonempty', function () {
				button.hidden = false;
			});
			
			progressQueueButtons.appendChild(button);
		}
		
		_loaded = true;
		
		var zp = document.getElementById('zotero-pane');
		Zotero.setFontSize(zp);
		ZoteroPane_Local.updateLayout();
		ZoteroPane_Local.updateToolbarPosition();
		this.updateWindow();
		window.addEventListener("resize", () => {
			this.updateWindow();
			this.updateToolbarPosition();
			this.updateTagsBoxSize();
		});
		window.setTimeout(this.updateToolbarPosition.bind(this), 0);
		
		Zotero.updateQuickSearchBox(document);
		
		if (Zotero.isMac) {
			document.getElementById('zotero-pane-stack').setAttribute('platform', 'mac');
		} else if(Zotero.isWin) {
			document.getElementById('zotero-pane-stack').setAttribute('platform', 'win');
		}
		
		// Set the sync tooltip label
		Components.utils.import("resource://zotero/config.js");
		document.getElementById('zotero-tb-sync-label').value = Zotero.getString(
			'sync.syncWith', ZOTERO_CONFIG.DOMAIN_NAME
		);
		
		// register an observer for Zotero reload
		observerService = Components.classes["@mozilla.org/observer-service;1"]
					  .getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(_reloadObserver, "zotero-reloaded", false);
		observerService.addObserver(_reloadObserver, "zotero-before-reload", false);
		this.addReloadListener(_loadPane);
		
		// continue loading pane
		_loadPane();
	};
	
	/**
	 * Called on window load or when pane has been reloaded after switching into or out of connector
	 * mode
	 */
	async function _loadPane() {
		if (!Zotero || !Zotero.initialized) return;
		
		// Set flags for hi-res displays
		Zotero.hiDPI = window.devicePixelRatio > 1;
		Zotero.hiDPISuffix = Zotero.hiDPI ? "@2x" : "";
		
		Zotero_Tabs.init();
		ZoteroContextPane.init();
		await ZoteroPane.initCollectionsTree();
		await ZoteroPane.initItemsTree();
		
		// Add a default progress window
		ZoteroPane.progressWindow = new Zotero.ProgressWindow({ window });
		
		ZoteroPane.setItemsPaneMessage(Zotero.getString('pane.items.loading'));
		
		Zotero.Keys.windowInit(document);
		
		if (Zotero.restoreFromServer) {
			Zotero.restoreFromServer = false;
			
			setTimeout(function () {
				var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
										.getService(Components.interfaces.nsIPromptService);
				var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
									+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
				var index = ps.confirmEx(
					null,
					"Zotero Restore",
					"The local Zotero database has been cleared."
						+ " "
						+ "Would you like to restore from the Zotero server now?",
					buttonFlags,
					"Sync Now",
					null, null, null, {}
				);
				
				if (index == 0) {
					Zotero.Sync.Server.sync({
						onSuccess: function () {
							Zotero.Sync.Runner.updateIcons();
							
							ps.alert(
								null,
								"Restore Completed",
								"The local Zotero database has been successfully restored."
							);
						},
						
						onError: function (msg) {
							ps.alert(
								null,
								"Restore Failed",
								"An error occurred while restoring from the server:\n\n"
									+ msg
							);
							
							Zotero.Sync.Runner.error(msg);
						}
					});
				}
			}, 1000);
		}
		// If the database was initialized or there are no sync credentials and
		// Zotero hasn't been run before in this profile, display the start page
		// -- this way the page won't be displayed when they sync their DB to
		// another profile or if the DB is initialized erroneously (e.g. while
		// switching data directory locations)
		else if (Zotero.Prefs.get('firstRun2')) {
			if (Zotero.Schema.dbInitialized || !Zotero.Sync.Server.enabled) {
				setTimeout(function () {
					ZoteroPane_Local.loadURI(ZOTERO_CONFIG.START_URL);
				}, 400);
			}
			Zotero.Prefs.set('firstRun2', false);
			try {
				Zotero.Prefs.clear('firstRun');
			}
			catch (e) {}
		}
		
		if (Zotero.openPane) {
			Zotero.openPane = false;
			setTimeout(function () {
				ZoteroPane_Local.show();
			}, 0);
		}
		
		setTimeout(function () {
			ZoteroPane.showRetractionBanner();
		});
		
		// TEMP: Clean up extra files from Mendeley imports <5.0.51
		setTimeout(async function () {
			var needsCleanup = await Zotero.DB.valueQueryAsync(
				"SELECT COUNT(*) FROM settings WHERE setting='mImport' AND key='cleanup'"
			)
			if (!needsCleanup) return;
			
			Components.utils.import("chrome://zotero/content/import/mendeley/mendeleyImport.js");
			var importer = new Zotero_Import_Mendeley();
			importer.deleteNonPrimaryFiles();
		}, 10000)
		
		// Restore pane state
		try {
			let state = Zotero.Session.state.windows.find(x => x.type == 'pane');
			if (state) {
				Zotero_Tabs.restoreState(state.tabs);
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
	}
	
	
	this.initContainers = function () {
		this.initTagSelector();
	};
	
	
	this.uninitContainers = function () {
		if (this.tagSelector) this.tagSelector.uninit();
	};
	
	
	/*
	 * Create the New Item (+) submenu with each item type
	 */
	this.buildItemTypeSubMenu = function () {
		var moreMenu = document.getElementById('zotero-tb-add-more');
		
		while (moreMenu.hasChildNodes()) {
			moreMenu.removeChild(moreMenu.firstChild);
		}
		
		// Sort by localized name
		var t = Zotero.ItemTypes.getSecondaryTypes();
		var itemTypes = [];
		for (var i=0; i<t.length; i++) {
			itemTypes.push({
				id: t[i].id,
				name: t[i].name,
				localized: Zotero.ItemTypes.getLocalizedString(t[i].id)
			});
		}
		var collation = Zotero.getLocaleCollation();
		itemTypes.sort(function(a, b) {
			return collation.compareString(1, a.localized, b.localized);
		});
		
		for (var i = 0; i<itemTypes.length; i++) {
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", itemTypes[i].localized);
			menuitem.setAttribute("tooltiptext", "");
			let type = itemTypes[i].id;
			menuitem.addEventListener("command", function() { ZoteroPane_Local.newItem(type, {}, null, true).done(); }, false);
			moreMenu.appendChild(menuitem);
		}
	}
	
	
	this.updateNewItemTypes = function () {
		var addMenu = document.getElementById('zotero-tb-add').firstChild;
		
		// Remove all nodes so we can regenerate
		var options = addMenu.getElementsByAttribute("class", "zotero-tb-add");
		while (options.length) {
			var p = options[0].parentNode;
			p.removeChild(options[0]);
		}
		
		var separator = addMenu.firstChild;
		
		// Sort by localized name
		var t = Zotero.ItemTypes.getPrimaryTypes();
		var itemTypes = [];
		for (var i=0; i<t.length; i++) {
			itemTypes.push({
				id: t[i].id,
				name: t[i].name,
				localized: Zotero.ItemTypes.getLocalizedString(t[i].id)
			});
		}
		var collation = Zotero.getLocaleCollation();
		itemTypes.sort(function(a, b) {
			return collation.compareString(1, a.localized, b.localized);
		});
		
		for (var i = 0; i<itemTypes.length; i++) {
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", itemTypes[i].localized);
			menuitem.setAttribute("tooltiptext", "");
			let type = itemTypes[i].id;
			menuitem.addEventListener("command", function() { ZoteroPane_Local.newItem(type, {}, null, true).done(); }, false);
			menuitem.className = "zotero-tb-add";
			addMenu.insertBefore(menuitem, separator);
		}
	}
	
	
	
	/*
	 * Called when the window closes
	 */
	function destroy()
	{
		if (!Zotero || !Zotero.initialized || !_loaded) {
			return;
		}
		
		this.serializePersist();

		if(this.collectionsView) this.collectionsView.unregister();
		if(this.itemsView) this.itemsView.unregister();
		
		this.uninitContainers();
		
		observerService.removeObserver(_reloadObserver, "zotero-reloaded");
		
		ZoteroContextPane.destroy();

		if (!Zotero.getZoteroPanes().length) {
			Zotero.Session.setLastClosedZoteroPaneState(this.getState());
		}

		Zotero_Tabs.closeAll();
	}
	
	/**
	 * Called before Zotero pane is to be made visible
	 * @return {Boolean} True if Zotero pane should be loaded, false otherwise (if an error
	 * 		occurred)
	 */
	this.makeVisible = Zotero.Promise.coroutine(function* () {
		if (Zotero.locked) {
			Zotero.showZoteroPaneProgressMeter();
		}
		
		yield Zotero.unlockPromise;
		
		// The items pane is hidden initially to avoid showing column lines
		Zotero.hideZoteroPaneOverlays();
		
		// If pane not loaded, load it or display an error message
		if (!ZoteroPane_Local.loaded) {
			ZoteroPane_Local.init();
		}
		
		// If Zotero could not be initialized, display an error message and return
		if (!Zotero || Zotero.skipLoading || Zotero.crashed) {
			this.displayStartupError();
			return false;
		}
		
		if(!_madeVisible) {
			this.buildItemTypeSubMenu();
		}
		_madeVisible = true;

		this.unserializePersist();
		this.updateLayout();
		this.updateToolbarPosition();
		this.initContainers();
		
		// Focus the quicksearch on pane open
		var searchBar = document.getElementById('zotero-tb-search');
		setTimeout(function () {
			searchBar.inputField.select();
		}, 1);
		
		//
		// TEMP: Remove after people are no longer upgrading from Zotero for Firefox
		//
		var showFxProfileWarning = false;
		var pref = 'firstRun.skipFirefoxProfileAccessCheck';
		if (Zotero.fxProfileAccessError != undefined && Zotero.fxProfileAccessError) {
			showFxProfileWarning = true;
		}
		else if (!Zotero.Prefs.get(pref)) {
			showFxProfileWarning = !(yield Zotero.Profile.checkFirefoxProfileAccess());
		}
		if (showFxProfileWarning) {
			Zotero.uiReadyPromise.delay(2000).then(function () {
				var ps = Services.prompt;
				var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
					+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING;
				var text = "Zotero was unable to access your Firefox profile to check for "
					+ "existing Zotero data.\n\n"
					+ "If you’ve upgraded from Zotero 4.0 for Firefox and don’t see the data "
					+ "you expect, it may be located elsewhere on your computer. "
					+ "Click “More Information” for help restoring your previous data.\n\n"
					+ "If you’re new to Zotero, you can ignore this message.";
				var url = 'https://www.zotero.org/support/kb/data_missing_after_zotero_5_upgrade';
				var dontShowAgain = {};
				let index = ps.confirmEx(null,
					Zotero.getString('general.warning'),
					text,
					buttonFlags,
					Zotero.getString('general.moreInformation'),
					"Ignore",
					null,
					Zotero.getString('general.dontShowAgain'),
					dontShowAgain
				);
				if (dontShowAgain.value) {
					Zotero.Prefs.set(pref, true)
				}
				if (index == 0) {
					this.loadURI(url);
				}
			}.bind(this));
		}
		// Once we successfully find it once, don't bother checking again
		else {
			Zotero.Prefs.set(pref, true);
		}
		
		if (Zotero.proxyFailure) {
			try {
				Zotero.Sync.Runner.updateIcons(Zotero.proxyFailure);
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		
		// Auto-sync on pane open or if new account
		if (Zotero.Prefs.get('sync.autoSync') || Zotero.initAutoSync) {
			yield Zotero.proxyAuthComplete;
			yield Zotero.uiReadyPromise;
			
			if (!Zotero.Sync.Runner.enabled) {
				Zotero.debug('Sync not enabled -- skipping auto-sync', 4);
			}
			else if (Zotero.Sync.Runner.syncInProgress) {
				Zotero.debug('Sync already running -- skipping auto-sync', 4);
			}
			else if (Zotero.Sync.Server.manualSyncRequired) {
				Zotero.debug('Manual sync required -- skipping auto-sync', 4);
			}
			else if (showFxProfileWarning) {
				Zotero.debug('Firefox profile access error -- skipping initial auto-sync', 4);
			}
			else {
				Zotero.Sync.Runner.sync({
					background: true
				}).then(() => Zotero.initAutoSync = false);
			}
		}
		
		// Set sync icon to spinning if there's an existing sync
		//
		// We don't bother setting an existing error state at open
		if (Zotero.Sync.Runner.syncInProgress) {
			Zotero.Sync.Runner.updateIcons('animate');
		}
		
		return true;
	});
	
	
	function isFullScreen() {
		return document.getElementById('zotero-pane-stack').getAttribute('fullscreenmode') == 'true';
	}
	
	
	/*
	 * Trigger actions based on keyboard shortcuts
	 */
	function handleKeyDown(event, from) {
		const cmdOrCtrlOnly = Zotero.isMac
			? (event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey)
			: (event.ctrlKey && !event.shiftKey && !event.altKey);
		
		// Close current tab
		if (event.key == 'w') {
			if (cmdOrCtrlOnly) {
				if (Zotero_Tabs.selectedIndex > 0) {
					Zotero_Tabs.close();
					event.preventDefault();
					event.stopPropagation();
				}
				return;
			}
		}

		// Undo closed tabs
		if ((Zotero.isMac && event.metaKey || !Zotero.isMac && event.ctrlKey)
				&& event.shiftKey && !event.altKey && event.key.toLowerCase() == 't') {
			Zotero_Tabs.undoClose();
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		
		// Tab navigation: Ctrl-PageUp / PageDown
		// TODO: Select across tabs without selecting with Ctrl-Shift, as in Firefox?
		if (event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
			if (event.key == 'PageUp') {
				Zotero_Tabs.selectPrev();
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			else if (event.key == 'PageDown') {
				Zotero_Tabs.selectNext();
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}
		
		// Tab navigation: Cmd-Shift-[ / ]
		// Common shortcut on macOS, but typically only supported on that platform to match OS
		// conventions users expect from other macOS apps.
		if (Zotero.isMac) {
			if (event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey) {
				if (event.key == '[') {
					Zotero_Tabs.selectPrev();
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				else if (event.key == ']') {
					Zotero_Tabs.selectNext();
					event.preventDefault();
					event.stopPropagation();
					return;
				}
			}
		}
		
		// Tab navigation: Ctrl-Tab / Ctrl-Shift-Tab
		if (event.ctrlKey && !event.altKey && !event.metaKey && event.key == 'Tab') {
			if (event.shiftKey) {
				Zotero_Tabs.selectPrev();
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			else {
				Zotero_Tabs.selectNext();
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}
		
		// Tab navigation: CmdOrCtrl-1 through 9
		// Jump to tab N (or to the last tab if there are less than N tabs)
		// CmdOrCtrl-9 is specially defined to jump to the last tab no matter how many there are.
		if (cmdOrCtrlOnly) {
			switch (event.key) {
				case '1':
				case '2':
				case '3':
				case '4':
				case '5':
				case '6':
				case '7':
				case '8':
					Zotero_Tabs.jump(parseInt(event.key) - 1);
					event.preventDefault();
					event.stopPropagation();
					return;
				case '9':
					Zotero_Tabs.selectLast();
					event.preventDefault();
					event.stopPropagation();
					return;
			}
		}
		
		try {
			// Ignore keystrokes outside of Zotero pane
			if (!(event.originalTarget.ownerDocument instanceof XULDocument)) {
				return;
			}
		}
		catch (e) {
			Zotero.debug(e);
		}
		
		if (Zotero.locked) {
			event.preventDefault();
			return;
		}

		if (from == 'zotero-pane') {			
			// Highlight collections containing selected items
			//
			// We use Control (17) on Windows because Alt triggers the menubar;
			// 	otherwise we use Alt/Option (18)
			if ((Zotero.isWin && event.keyCode == 17 && !event.altKey) ||
					(!Zotero.isWin && event.keyCode == 18 && !event.ctrlKey)
					&& !event.shiftKey && !event.metaKey) {
				
				this.highlightTimer = Components.classes["@mozilla.org/timer;1"].
					createInstance(Components.interfaces.nsITimer);
				// {} implements nsITimerCallback
				this.highlightTimer.initWithCallback({
					notify: ZoteroPane_Local.setHighlightedRowsCallback
				}, 225, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
			}
			// Unhighlight on key up
			else if ((Zotero.isWin && event.ctrlKey) ||
					(!Zotero.isWin && event.altKey)) {
				if (this.highlightTimer) {
					this.highlightTimer.cancel();
					this.highlightTimer = null;
				}
				ZoteroPane_Local.collectionsView.setHighlightedRows();
			}
		}
	}
	
	this.handleBlur = (event) => {
		if (this.highlightTimer) {
			this.highlightTimer.cancel();
			this.highlightTimer = null;
		}
		ZoteroPane_Local.collectionsView.setHighlightedRows();
	}
	
	function handleKeyUp(event) {
		var from = event.originalTarget.id;
		if (ZoteroPane.itemsView && from == ZoteroPane.itemsView.id) {
			if ((Zotero.isWin && event.keyCode == 17) ||
					(!Zotero.isWin && event.keyCode == 18)) {
				if (this.highlightTimer) {
					this.highlightTimer.cancel();
					this.highlightTimer = null;
				}
				ZoteroPane_Local.collectionsView.setHighlightedRows();
				return;
			}
		}
	}
	
	
	/*
	 * Highlights collections containing selected items on Ctrl (Win) or
	 * Option/Alt (Mac/Linux) press
	 */
	function setHighlightedRowsCallback() {
		var itemIDs = ZoteroPane_Local.getSelectedItems(true);
		// If no items or an unreasonable number, don't try
		if (!itemIDs || !itemIDs.length || itemIDs.length > 100) return;
		
		Zotero.Promise.coroutine(function* () {
			var collectionIDs = yield Zotero.Collections.getCollectionsContainingItems(itemIDs, true);
			var ids = collectionIDs.map(id => "C" + id);
			var userLibraryID = Zotero.Libraries.userLibraryID;
			var allInPublications = Zotero.Items.get(itemIDs).every((item) => {
				return item.libraryID == userLibraryID && item.inPublications;
			})
			if (allInPublications) {
				ids.push("P" + Zotero.Libraries.userLibraryID);
			}
			if (ids.length) {
				ZoteroPane_Local.collectionsView.setHighlightedRows(ids);
			}
		})();
	}
	
	
	function handleKeyPress(event) {
		var from = event.originalTarget.id;
		
		if (Zotero.locked) {
			event.preventDefault();
			return;
		}

		if (this.itemsView && from == this.itemsView.id) {
			// Focus TinyMCE explicitly on tab key, since the normal focusing doesn't work right
			if (!event.shiftKey && event.keyCode == event.DOM_VK_TAB) {
				var deck = document.getElementById('zotero-item-pane-content');
				if (deck.selectedPanel.id == 'zotero-view-note') {
					document.getElementById('zotero-note-editor').focus();
					event.preventDefault();
					return;
				}
			}
			else if ((event.keyCode == event.DOM_VK_BACK_SPACE && Zotero.isMac) ||
					event.keyCode == event.DOM_VK_DELETE) {
				// If Cmd/Shift delete, use forced mode, which does different
				// things depending on the context
				var force = event.metaKey || (!Zotero.isMac && event.shiftKey);
				ZoteroPane_Local.deleteSelectedItems(force);
				event.preventDefault();
				return;
			}
		}
		
		var command = Zotero.Keys.getCommand(event.key);
		if (!command) {
			return;
		}

		// Ignore modifiers other than Ctrl-Shift/Cmd-Shift
		if (!((Zotero.isMac ? event.metaKey : event.ctrlKey) && event.shiftKey)) {
			return;
		}
		
		Zotero.debug('Keyboard shortcut: ' + command);
		
		// Errors don't seem to make it out otherwise
		try {
			switch (command) {
				case 'library':
					document.getElementById(ZoteroPane.collectionsView.id).focus();
					break;
				case 'quicksearch':
					document.getElementById('zotero-tb-search').select();
					break;
				case 'newItem':
					(async function () {
						// Default to most recent item type from here or the New Type menu,
						// or fall back to 'book'
						var mru = Zotero.Prefs.get('newItemTypeMRU');
						var type = mru ? mru.split(',')[0] : 'book';
						await ZoteroPane.newItem(Zotero.ItemTypes.getID(type));
						let itemBox = document.getElementById('zotero-editpane-item-box');
						var menu = itemBox.itemTypeMenu;
						// If the new item's type is changed immediately, update the MRU
						var handleTypeChange = function () {
							this.addItemTypeToNewItemTypeMRU(Zotero.ItemTypes.getName(menu.value));
							itemBox.removeHandler('itemtypechange', handleTypeChange);
						}.bind(this);
						// Don't update the MRU on subsequent opens of the item type menu
						var removeTypeChangeHandler = function () {
							itemBox.removeHandler('itemtypechange', handleTypeChange);
							itemBox.itemTypeMenu.firstChild.removeEventListener('popuphiding', removeTypeChangeHandler);
							// Focus the title field after menu closes
							itemBox.focusFirstField();
						};
						itemBox.addHandler('itemtypechange', handleTypeChange);
						itemBox.itemTypeMenu.firstChild.addEventListener('popuphiding', removeTypeChangeHandler);
						
						menu.focus();
						document.getElementById('zotero-editpane-item-box').itemTypeMenu.menupopup.openPopup(menu, "before_start", 0, 0);
					}.bind(this)());
					break;
				case 'newNote':
					// If a regular item is selected, use that as the parent.
					// If a child item is selected, use its parent as the parent.
					// Otherwise create a standalone note.
					var parentKey = false;
					var items = ZoteroPane_Local.getSelectedItems();
					if (items.length == 1) {
						if (items[0].isRegularItem()) {
							parentKey = items[0].key;
						}
						else {
							parentKey = items[0].parentItemKey;
						}
					}
					// Use key that's not the modifier as the popup toggle
					ZoteroPane_Local.newNote(event.altKey, parentKey);
					break;
				case 'sync':
					Zotero.Sync.Runner.sync();
					break;
				case 'saveToZotero':
					var collectionTreeRow = this.getCollectionTreeRow();
					if (collectionTreeRow.isFeed()) {
						ZoteroItemPane.translateSelectedItems();
					} else {
						Zotero.debug(command + ' does not do anything in non-feed views')
					}
					break;
				case 'toggleAllRead':
					var collectionTreeRow = this.getCollectionTreeRow();
					if (collectionTreeRow.isFeed()) {
						this.markFeedRead();
					}
					break;
				case 'toggleRead':
					// Toggle read/unread
					let row = this.getCollectionTreeRow();
					if (!row || !row.isFeed()) return;
					this.toggleSelectedItemsRead();
					if (itemReadPromise) {
						itemReadPromise.cancel();
						itemReadPromise = null;
					}
					break;
				
				// Handled by <key>s in standalone.js, pointing to <command>s in zoteroPane.xul,
				// which are enabled or disabled by this.updateQuickCopyCommands(), called by
				// this.itemSelected()
				case 'copySelectedItemCitationsToClipboard':
				case 'copySelectedItemsToClipboard':
					return;
				
				default:
					throw new Error('Command "' + command + '" not found in ZoteroPane_Local.handleKeyPress()');
			}
		}
		catch (e) {
			Zotero.debug(e, 1);
			Components.utils.reportError(e);
		}
		
		event.preventDefault();
	}
	
	
	/*
	 * Create a new item
	 *
	 * _data_ is an optional object with field:value for itemData
	 */
	this.newItem = Zotero.Promise.coroutine(function* (typeID, data, row, manual)
	{
		if ((row === undefined || row === null) && this.getCollectionTreeRow()) {
			row = this.collectionsView.selection.focused;
			
			// Make sure currently selected view is editable
			if (!this.canEdit(row)) {
				this.displayCannotEditLibraryMessage();
				return;
			}
		}
		
		yield ZoteroItemPane.blurOpenField();
		
		if (row !== undefined && row !== null) {
			var collectionTreeRow = this.collectionsView.getRow(row);
			var libraryID = collectionTreeRow.ref.libraryID;
		}
		else {
			var libraryID = Zotero.Libraries.userLibraryID;
			var collectionTreeRow = null;
		}
		
		let itemID;
		yield Zotero.DB.executeTransaction(function* () {
			var item = new Zotero.Item(typeID);
			item.libraryID = libraryID;
			for (var i in data) {
				item.setField(i, data[i]);
			}
			itemID = yield item.save();
			
			if (collectionTreeRow && collectionTreeRow.isCollection()) {
				yield collectionTreeRow.ref.addItem(itemID);
			}
		});
		
		//set to Info tab
		document.getElementById('zotero-view-item').selectedIndex = 0;
		
		if (manual) {
			// Update most-recently-used list for New Item menu
			this.addItemTypeToNewItemTypeMRU(Zotero.ItemTypes.getName(typeID));
			
			// Focus the title field
			document.getElementById('zotero-editpane-item-box').focusFirstField();
		}
		
		return Zotero.Items.getAsync(itemID);
	});
	
	
	this.addItemTypeToNewItemTypeMRU = function (itemType) {
		var mru = Zotero.Prefs.get('newItemTypeMRU');
		if (mru) {
			var mru = mru.split(',');
			var pos = mru.indexOf(itemType);
			if (pos != -1) {
				mru.splice(pos, 1);
			}
			mru.unshift(itemType);
		}
		else {
			var mru = [itemType];
		}
		Zotero.Prefs.set('newItemTypeMRU', mru.slice(0, 5).join(','));
	}
	
	
	this.newCollection = Zotero.Promise.coroutine(function* (parentKey) {
		if (!this.canEditLibrary()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var libraryID = this.getSelectedLibraryID();
		
		// Get a unique "Untitled" name for this level in the collection hierarchy
		var collections;
		if (parentKey) {
			let parent = Zotero.Collections.getIDFromLibraryAndKey(libraryID, parentKey);
			collections = Zotero.Collections.getByParent(parent);
		}
		else {
			collections = Zotero.Collections.getByLibrary(libraryID);
		}
		var prefix = Zotero.getString('pane.collections.untitled');
		var name = Zotero.Utilities.Internal.getNextName(
			prefix,
			collections.map(c => c.name).filter(n => n.startsWith(prefix))
		);
		
		var newName = { value: name };
		var result = Services.prompt.prompt(window,
			Zotero.getString('pane.collections.newCollection'),
			Zotero.getString('pane.collections.name'), newName, "", {});
		
		if (!result)
		{
			return;
		}
		
		if (!newName.value)
		{
			newName.value = untitled;
		}
		
		var collection = new Zotero.Collection;
		collection.libraryID = libraryID;
		collection.name = newName.value;
		collection.parentKey = parentKey;
		return collection.saveTx();
	});
	
	this.importFeedsFromOPML = async function (event) {
		while (true) {
			let fp = new FilePicker();
			fp.init(window, Zotero.getString('fileInterface.importOPML'), fp.modeOpen);
			fp.appendFilter(Zotero.getString('fileInterface.OPMLFeedFilter'), '*.opml; *.xml');
			fp.appendFilters(fp.filterAll);
			if (await fp.show() == fp.returnOK) {
				var contents = await Zotero.File.getContentsAsync(fp.file);
				var success = await Zotero.Feeds.importFromOPML(contents);
				if (success) {
					return true;
				}
				// Try again
				Zotero.alert(window, Zotero.getString('general.error'), Zotero.getString('fileInterface.unsupportedFormat'));
			} else {
				return false;
			}
		}
	};
	
	
	this.newFeedFromURL = Zotero.Promise.coroutine(function* () {
		let data = {};
		window.openDialog('chrome://zotero/content/feedSettings.xul', 
			null, 'centerscreen, modal', data);
		if (!data.cancelled) {
			let feed = new Zotero.Feed();
			feed.url = data.url;
			feed.name = data.title;
			feed.refreshInterval = data.ttl;
			feed.cleanupReadAfter = data.cleanupReadAfter;
			feed.cleanupUnreadAfter = data.cleanupUnreadAfter;
			yield feed.saveTx();
			yield feed.updateFeed();
		}
	});
	
	this.newGroup = function () {
		this.loadURI(Zotero.Groups.addGroupURL);
	}
	
	
	this.newSearch = Zotero.Promise.coroutine(function* () {
		if (Zotero.DB.inTransaction()) {
			yield Zotero.DB.waitForTransaction();
		}
		
		var libraryID = this.getSelectedLibraryID();
		
		var s = new Zotero.Search();
		s.libraryID = libraryID;
		s.addCondition('title', 'contains', '');
		
		var searches = yield Zotero.Searches.getAll(libraryID)
		var prefix = Zotero.getString('pane.collections.untitled');
		var name = Zotero.Utilities.Internal.getNextName(
			prefix,
			searches.map(s => s.name).filter(n => n.startsWith(prefix))
		);
		
		var io = { dataIn: { search: s, name }, dataOut: null };
		window.openDialog('chrome://zotero/content/searchDialog.xul','','chrome,modal',io);
		if (!io.dataOut) {
			return false;
		}
		s.fromJSON(io.dataOut.json);
		yield s.saveTx();
		return s.id;
	});
	
	this.setVirtual = function(libraryID, type, show, select) {
		return this.collectionsView.toggleVirtualCollection(libraryID, type, show, select);
	};
	
	this.openAdvancedSearchWindow = function () {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator);
		var enumerator = wm.getEnumerator('zotero:search');
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
		}
		
		if (win) {
			win.focus();
			return;
		}
		
		var s = new Zotero.Search();
		s.libraryID = this.getSelectedLibraryID();
		s.addCondition('title', 'contains', '');
		
		var io = {dataIn: {search: s}, dataOut: null};
		window.openDialog('chrome://zotero/content/advancedSearch.xul', '', 'chrome,dialog=no,centerscreen', io);
	};

	this.initItemsTree = async function () {
		try {
			const ItemTree = require('zotero/itemTree');
			var itemsTree = document.getElementById('zotero-items-tree');
			ZoteroPane.itemsView = await ItemTree.init(itemsTree, {
				id: "main",
				dragAndDrop: true,
				persistColumns: true,
				columnPicker: true,
				onSelectionChange: selection => ZoteroPane.itemSelected(selection),
				onContextMenu: (...args) => ZoteroPane.onItemsContextMenuOpen(...args),
				onActivate: (event, items) => ZoteroPane.onItemTreeActivate(event, items),
				emptyMessage: Zotero.getString('pane.items.loading')
			});
			ZoteroPane.itemsView.onRefresh.addListener(() => ZoteroPane.setTagScope());
			ZoteroPane.itemsView.waitForLoad().then(() => Zotero.uiIsReady());
		}
		catch (e) {
			Zotero.logError(e);
			Zotero.debug(e, 1);
		}
	}

	this.initCollectionsTree = async function () {
		try {
			const CollectionTree = require('zotero/collectionTree');
			var collectionsTree = document.getElementById('zotero-collections-tree');
			ZoteroPane.collectionsView = await CollectionTree.init(collectionsTree, {
				onSelectionChange: prevSelection => ZoteroPane.onCollectionSelected(prevSelection),
				onContextMenu: (...args) => ZoteroPane.onCollectionsContextMenuOpen(...args),
				dragAndDrop: true
			});
		}
		catch (e) {
			Zotero.logError(e);
			Zotero.debug(e, 1);
		}
	};

	this.initTagSelector = function () {
		try {
			var container = document.getElementById('zotero-tag-selector-container');
			if (!container.hasAttribute('collapsed') || container.getAttribute('collapsed') == 'false') {
				this.tagSelector = Zotero.TagSelector.init(
					document.getElementById('zotero-tag-selector'),
					{
						container: 'zotero-tag-selector-container',
						onSelection: this.updateTagFilter.bind(this),
					}
				);
			}
		}
		catch (e) {
			Zotero.logError(e);
			Zotero.debug(e, 1);
		}
	};
	
	
	this.handleTagSelectorResize = Zotero.Utilities.debounce(function() {
		if (this.tagSelectorShown()) {
			// Initialize if dragging open after startup
			if (!this.tagSelector) {
				this.initTagSelector();
				this.setTagScope();
			}
			this.tagSelector.handleResize();
		}
		if (this.collectionsView) {
			this.collectionsView.updateHeight();
		}
	}, 100);
	
	
	/*
	 * Sets the tag filter on the items view
	 */
	this.updateTagFilter = Zotero.Promise.coroutine(function* () {
		if (this.itemsView) {
			yield this.itemsView.setFilter('tags', ZoteroPane_Local.tagSelector.getTagSelection());
		}
	});
	
	
	// Keep in sync with ZoteroStandalone.updateViewOption()
	this.toggleTagSelector = function () {
		var container = document.getElementById('zotero-tag-selector-container');
		var showing = container.getAttribute('collapsed') == 'true';
		container.setAttribute('collapsed', !showing);
		
		// If showing, set scope to items in current view
		// and focus filter textbox
		if (showing) {
			this.initTagSelector();
			ZoteroPane.tagSelector.focusTextbox();
			this.setTagScope();
		}
		// If hiding, clear selection
		else {
			ZoteroPane.tagSelector.uninit();
			ZoteroPane.tagSelector = null;
		}
	};
	
	
	this.tagSelectorShown = function () {
		var collectionTreeRow = this.getCollectionTreeRow();
		if (!collectionTreeRow) return;
		var tagSelector = document.getElementById('zotero-tag-selector-container');
		return !tagSelector.hasAttribute('collapsed')
			|| tagSelector.getAttribute('collapsed') == 'false';
	};
	
	
	/*
	 * Set the tags scope to the items in the current view
	 *
	 * Passed to the items tree to trigger on changes
	 */
	this.setTagScope = function () {
		var collectionTreeRow = self.getCollectionTreeRow();
		if (self.tagSelectorShown()) {
			if (collectionTreeRow.editable) {
				ZoteroPane_Local.tagSelector.setMode('edit');
			}
			else {
				ZoteroPane_Local.tagSelector.setMode('view');
			}
			ZoteroPane_Local.tagSelector.onItemViewChanged({
				libraryID: collectionTreeRow.ref.libraryID,
				collectionTreeRow
			});
		}
	};
	
	
	this.onCollectionSelected = Zotero.serial(async function () {
		try {
			var collectionTreeRow = this.getCollectionTreeRow();
			if (!collectionTreeRow) {
				Zotero.debug('ZoteroPane.onCollectionSelected: No selected collection found');
				return;
			}
			
			if (this.itemsView && this.itemsView.collectionTreeRow && this.itemsView.collectionTreeRow.id == collectionTreeRow.id) {
				Zotero.debug("ZoteroPane.onCollectionSelected: Collection selection hasn't changed");

				// Update toolbar, in case editability has changed
				this._updateToolbarIconsForRow(collectionTreeRow);
				return;
			}
			
			// Rename tab
			if (Zotero.isPDFBuild) {
				Zotero_Tabs.rename('zotero-pane', collectionTreeRow.getName());
			}
			
			let type = Zotero.Libraries.get(collectionTreeRow.ref.libraryID).libraryType;
			ZoteroItemPane.switchEditorEngine(type == 'group' && !Zotero.enablePDFBuildForGroups || !Zotero.isPDFBuild);
			
			// Clear quick search and tag selector when switching views
			document.getElementById('zotero-tb-search').value = "";
			if (ZoteroPane.tagSelector) {
				ZoteroPane.tagSelector.clearTagSelection();
			}
			
			collectionTreeRow.setSearch('');
			if (ZoteroPane.tagSelector) {
				collectionTreeRow.setTags(ZoteroPane.tagSelector.getTagSelection());
			}
			
			this._updateToolbarIconsForRow(collectionTreeRow);

			// If item data not yet loaded for library, load it now.
			// Other data types are loaded at startup
			var library = Zotero.Libraries.get(collectionTreeRow.ref.libraryID);
			if (!library.getDataLoaded('item')) {
				Zotero.debug("Waiting for items to load for library " + library.libraryID);
				ZoteroPane_Local.setItemsPaneMessage(Zotero.getString('pane.items.loading'));
				await library.waitForDataLoad('item');
			}
			
			this.itemsView.changeCollectionTreeRow(collectionTreeRow);
			
			Zotero.Prefs.set('lastViewedFolder', collectionTreeRow.id);
		} finally {
			this.collectionsView.runListeners('select');
		}
	});
	
	
	/**
	 * Enable or disable toolbar icons and menu options as necessary
	 */
	this._updateToolbarIconsForRow = function (collectionTreeRow) {
		const disableIfNoEdit = [
			"cmd_zotero_newCollection",
			"cmd_zotero_newSavedSearch",
			"zotero-tb-add",
			"zotero-tb-lookup",
			"cmd_zotero_newStandaloneNote",
			"zotero-tb-note-add",
			"zotero-tb-attachment-add"
		];
		for (let i = 0; i < disableIfNoEdit.length; i++) {
			let command = disableIfNoEdit[i];
			let el = document.getElementById(command);
			
			// If a trash is selected, new collection depends on the
			// editability of the library
			if (collectionTreeRow.isTrash() && command == 'cmd_zotero_newCollection') {
				var overrideEditable = Zotero.Libraries.get(collectionTreeRow.ref.libraryID).editable;
			}
			else {
				var overrideEditable = false;
			}
			
			// Don't allow normal buttons in My Publications, because things need to
			// be dragged and go through the wizard
			let forceDisable = collectionTreeRow.isPublications()
				&& command != 'cmd_zotero_newCollection'
				&& command != 'zotero-tb-note-add';
			
			if ((collectionTreeRow.editable || overrideEditable) && !forceDisable) {
				if(el.hasAttribute("disabled")) el.removeAttribute("disabled");
			} else {
				el.setAttribute("disabled", "true");
			}
		}
	};
	
	
	this.getCollectionTreeRow = function () {
		return this.collectionsView && this.collectionsView.selection.count
			&& this.collectionsView.getRow(this.collectionsView.selection.focused);
	}
	
	
	/**
	 * @return {Promise<Boolean>} - Promise that resolves to true if an item was selected,
	 *                              or false if not (used for tests, though there could possibly
	 *                              be a better test for whether the item pane changed)
	 */
	this.itemSelected = function () {
		return Zotero.Promise.coroutine(function* () {
			if (!this.itemsView || !this.itemsView.selection) {
				Zotero.debug("Items view not available in itemSelected", 2);
				return false;
			}
			
			var selectedItems = this.itemsView.getSelectedItems();
			
			// Display buttons at top of item pane depending on context. This needs to run even if the
			// selection hasn't changed, because the selected items might have been modified.
			this.updateItemPaneButtons(selectedItems);
			
			// Tab selection observer in standalone.js makes sure that
			// updateQuickCopyCommands is called
			if (Zotero_Tabs.selectedID == 'zotero-pane') {
				this.updateQuickCopyCommands(selectedItems);
			}
			
			// Check if selection has actually changed. The onselect event that calls this
			// can be called in various situations where the selection didn't actually change,
			// such as whenever selectEventsSuppressed is set to false.
			var ids = selectedItems.map(item => item.id);
			ids.sort();
			if (ids.length && Zotero.Utilities.arrayEquals(_lastSelectedItems, ids)) {
				return false;
			}
			_lastSelectedItems = ids;
			
			var tabs = document.getElementById('zotero-view-tabbox');
			
			// save note when switching from a note
			if(document.getElementById('zotero-item-pane-content').selectedIndex == 2) {
				// TODO: only try to save when selected item is different
				yield document.getElementById('zotero-note-editor').save();
			}
			
			var collectionTreeRow = this.getCollectionTreeRow();
			// I don't think this happens in normal usage, but it can happen during tests
			if (!collectionTreeRow) {
				return false;
			}
			
			// Single item selected
			if (selectedItems.length == 1) {
				var item = selectedItems[0];
				
				if (item.isNote()) {
					ZoteroItemPane.onNoteSelected(item, this.collectionsView.editable);
				}
				
				else if (item.isAttachment()) {
					var attachmentBox = document.getElementById('zotero-attachment-box');
					attachmentBox.mode = this.collectionsView.editable ? 'edit' : 'view';
					attachmentBox.item = item;
					
					document.getElementById('zotero-item-pane-content').selectedIndex = 3;
				}
				
				// Regular item
				else {
					var isCommons = collectionTreeRow.isBucket();
					
					document.getElementById('zotero-item-pane-content').selectedIndex = 1;
					var tabBox = document.getElementById('zotero-view-tabbox');
					
					// Reset tab when viewing a feed item, which only has the info tab
					if (item.isFeedItem) {
						tabBox.selectedIndex = 0;
					}
					
					var pane = tabBox.selectedIndex;
					tabBox.firstChild.hidden = isCommons;
					
					var button = document.getElementById('zotero-item-show-original');
					if (isCommons) {
						button.hidden = false;
						button.disabled = !this.getOriginalItem();
					}
					else {
						button.hidden = true;
					}
					
					if (this.collectionsView.editable) {
						yield ZoteroItemPane.viewItem(item, null, pane);
						tabs.selectedIndex = document.getElementById('zotero-view-item').selectedIndex;
					}
					else {
						yield ZoteroItemPane.viewItem(item, 'view', pane);
						tabs.selectedIndex = document.getElementById('zotero-view-item').selectedIndex;
					}
					
					if (item.isFeedItem) {
						// Too slow for now
						// if (!item.isTranslated) {
						// 	item.translate();
						// }
						this.updateReadLabel();
						this.startItemReadTimeout(item.id);
					}
				}
			}
			// Zero or multiple items selected
			else {
				if (collectionTreeRow.isFeed()) {
					this.updateReadLabel();
				}
				
				let count = selectedItems.length;
				
				// Display duplicates merge interface in item pane
				if (collectionTreeRow.isDuplicates()) {
					if (!collectionTreeRow.editable) {
						if (count) {
							var msg = Zotero.getString('pane.item.duplicates.writeAccessRequired');
						}
						else {
							var msg = Zotero.getString('pane.item.selected.zero');
						}
						this.setItemPaneMessage(msg);
					}
					else if (count) {
						document.getElementById('zotero-item-pane-content').selectedIndex = 4;
						
						// Load duplicates UI code
						if (typeof Zotero_Duplicates_Pane == 'undefined') {
							Zotero.debug("Loading duplicatesMerge.js");
							Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
								.getService(Components.interfaces.mozIJSSubScriptLoader)
								.loadSubScript("chrome://zotero/content/duplicatesMerge.js");
						}
						
						// On a Select All of more than a few items, display a row
						// count instead of the usual item type mismatch error
						var displayNumItemsOnTypeError = count > 5 && count == this.itemsView.rowCount;
						
						// Initialize the merge pane with the selected items
						Zotero_Duplicates_Pane.setItems(selectedItems, displayNumItemsOnTypeError);
					}
					else {
						var msg = Zotero.getString('pane.item.duplicates.selectToMerge');
						this.setItemPaneMessage(msg);
					}
				}
				// Display label in the middle of the item pane
				else {
					if (count) {
						var msg = Zotero.getString('pane.item.selected.multiple', count);
					}
					else {
						var rowCount = this.itemsView.rowCount;
						var str = 'pane.item.unselected.';
						switch (rowCount){
							case 0:
								str += 'zero';
								break;
							case 1:
								str += 'singular';
								break;
							default:
								str += 'plural';
								break;
						}
						var msg = Zotero.getString(str, [rowCount]);
					}
					
					this.setItemPaneMessage(msg);
					
					return false;
				}
			}
			
			return true;
		}.bind(this))()
		.catch(function (e) {
			Zotero.logError(e);
			Zotero.crash();
			throw e;
		}.bind(this))
		.finally(function () {
			return this.itemsView.runListeners('select');
		}.bind(this));
	}
	
	
	/**
	 * Display buttons at top of item pane depending on context
	 *
	 * @param {Zotero.Item[]}
	 */
	this.updateItemPaneButtons = function (selectedItems) {
		if (!selectedItems.length) {
			document.querySelectorAll('.zotero-item-pane-top-buttons').forEach(x => x.hidden = true);
			return;
		}
		
		// My Publications buttons
		var isPublications = this.getCollectionTreeRow().isPublications();
		// Show in My Publications view if selected items are all notes or non-linked-file attachments
		var showMyPublicationsButtons = isPublications
			&& selectedItems.every((item) => {
				return item.isNote()
					|| (item.isAttachment()
						&& item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_FILE);
			});
		var myPublicationsButtons = document.getElementById('zotero-item-pane-top-buttons-my-publications');
		myPublicationsButtons.hidden = !showMyPublicationsButtons;
		if (showMyPublicationsButtons) {
			let button = myPublicationsButtons.firstChild;
			let hiddenItemsSelected = selectedItems.some(item => !item.inPublications);
			let str, onclick;
			if (hiddenItemsSelected) {
				str = 'showInMyPublications';
				onclick = () => Zotero.Items.addToPublications(selectedItems);
			}
			else {
				str = 'hideFromMyPublications';
				onclick = () => Zotero.Items.removeFromPublications(selectedItems);
			}
			button.label = Zotero.getString('pane.item.' + str);
			button.onclick = onclick;
		}
		
		// Trash button
		let nonDeletedItemsSelected = selectedItems.some(item => !item.deleted);
		document.getElementById('zotero-item-pane-top-buttons-trash').hidden
			= !this.getCollectionTreeRow().isTrash() || nonDeletedItemsSelected;
		
		// Feed buttons
		document.getElementById('zotero-item-pane-top-buttons-feed').hidden
			= !this.getCollectionTreeRow().isFeed()
	};
	
	
	/**
	 * @return {Promise}
	 */
	this.updateNoteButtonMenu = function () {
		var items = ZoteroPane_Local.getSelectedItems();
		var cmd = document.getElementById('cmd_zotero_newChildNote');
		cmd.setAttribute("disabled", !this.canEdit() ||
			!(items.length == 1 && (items[0].isRegularItem() || !items[0].isTopLevelItem())));
	}
	
	
	this.updateAttachmentButtonMenu = function (popup) {
		var items = ZoteroPane_Local.getSelectedItems();
		
		var disabled = !this.canEdit() || !(items.length == 1 && items[0].isRegularItem());
		
		if (disabled) {
			for (let node of popup.childNodes) {
				node.disabled = true;
			}
			return;
		}
		
		var collectionTreeRow = this.getCollectionTreeRow();
		var canEditFiles = this.canEditFiles();
		
		var prefix = "menuitem-iconic zotero-menuitem-attachments-";
		
		for (var i=0; i<popup.childNodes.length; i++) {
			var node = popup.childNodes[i];
			var className = node.className;
			
			switch (className) {
				case prefix + 'link':
					node.disabled = collectionTreeRow.isWithinGroup();
					break;
				
				case prefix + 'file':
					node.disabled = !canEditFiles;
					break;
				
				case prefix + 'web-link':
					node.disabled = false;
					break;
				
				default:
					throw new Error(`Invalid class name '${className}'`);
			}
		}
	}
	
	
	/**
	 * Update the <command> elements that control the shortcut keys and the enabled state of the
	 * "Copy Citation"/"Copy Bibliography"/"Copy as"/"Copy Note" menu options. When disabled, the shortcuts are
	 * still caught in handleKeyPress so that we can show an alert about not having references selected.
	 */
	this.updateQuickCopyCommands = function (selectedItems) {
		let canCopy = false;
		// If all items are notes/attachments and at least one note is not empty
		if (selectedItems.every(item => item.isNote() || item.isAttachment())) {
			if (selectedItems.some(item => item.note)) {
				canCopy = true;
			}
		}
		else {
			let format = Zotero.QuickCopy.getFormatFromURL(Zotero.QuickCopy.lastActiveURL);
			format = Zotero.QuickCopy.unserializeSetting(format);
			if (format.mode == 'bibliography') {
				canCopy = selectedItems.some(item => item.isRegularItem());
			}
			else {
				canCopy = true;
			}
		}
		
		document.getElementById('cmd_zotero_copyCitation').setAttribute('disabled', !canCopy);
		document.getElementById('cmd_zotero_copyBibliography').setAttribute('disabled', !canCopy);
	};
	
	
	/**
	 * @return {Promise}
	 */
	this.reindexItem = Zotero.Promise.coroutine(function* () {
		var items = this.getSelectedItems();
		if (!items) {
			return;
		}
		
		var itemIDs = [];

		for (var i=0; i<items.length; i++) {
			itemIDs.push(items[i].id);
		}
		
		yield Zotero.FullText.indexItems(itemIDs, { complete: true });
		yield document.getElementById('zotero-attachment-box').updateItemIndexedState();
	});
	
	
	/**
	 * @return {Promise<Zotero.Item>} - The new Zotero.Item
	 */
	this.duplicateSelectedItem = Zotero.Promise.coroutine(function* () {
		var self = this;
		if (!self.canEdit()) {
			self.displayCannotEditLibraryMessage();
			return;
		}
		
		var item = self.getSelectedItems()[0];
		if (item.isNote()
			&& !(yield Zotero.Notes.ensureEmbeddedImagesAreAvailable(item))
			&& !Zotero.Notes.promptToIgnoreMissingImage()) {
			return;
		}
		
		var newItem;
		
		yield Zotero.DB.executeTransaction(function* () {
			newItem = item.clone();
			// If in a collection, add new item to it
			if (self.getCollectionTreeRow().isCollection() && newItem.isTopLevelItem()) {
				newItem.setCollections([self.getCollectionTreeRow().ref.id]);
			}
			yield newItem.save();
			if (item.isNote()) {
				yield Zotero.Notes.copyEmbeddedImages(item, newItem);
			}
			for (let relItemKey of item.relatedItems) {
				try {
					let relItem = yield Zotero.Items.getByLibraryAndKeyAsync(item.libraryID, relItemKey);
					if (relItem.addRelatedItem(newItem)) {
						yield relItem.save({
							skipDateModifiedUpdate: true
						});
					}
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
		});
		
		yield self.selectItem(newItem.id);
		
		return newItem;
	});
	
	
	this.deleteSelectedItem = function () {
		Zotero.debug("ZoteroPane_Local.deleteSelectedItem() is deprecated -- use ZoteroPane_Local.deleteSelectedItems()");
		this.deleteSelectedItems();
	}
	
	/*
	 * Remove, trash, or delete item(s), depending on context
	 *
	 * @param  {Boolean}  [force=false]     Trash or delete even if in a collection or search,
	 *                                      or trash without prompt in library
	 * @param  {Boolean}  [fromMenu=false]  If triggered from context menu, which always prompts for deletes
	 */
	this.deleteSelectedItems = function (force, fromMenu) {
		if (!this.itemsView || !this.itemsView.selection.count) {
			return;
		}
		var collectionTreeRow = this.getCollectionTreeRow();
		
		if (!collectionTreeRow.isTrash() && !collectionTreeRow.isBucket() && !this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var toTrash = {
			title: Zotero.getString('pane.items.trash.title'),
			text: Zotero.getString(
				'pane.items.trash' + (this.itemsView.selection.count > 1 ? '.multiple' : '')
			)
		};
		var toDelete = {
			title: Zotero.getString('pane.items.delete.title'),
			text: Zotero.getString(
				'pane.items.delete' + (this.itemsView.selection.count > 1 ? '.multiple' : '')
			)
		};
		var toRemove = {
			title: Zotero.getString('pane.items.remove.title'),
			text: Zotero.getString(
				'pane.items.remove' + (this.itemsView.selection.count > 1 ? '.multiple' : '')
			)
		};
		
		if (collectionTreeRow.isPublications()) {
			let toRemoveFromPublications = {
				title: Zotero.getString('pane.items.removeFromPublications.title'),
				text: Zotero.getString(
					'pane.items.removeFromPublications' + (this.itemsView.selection.count > 1 ? '.multiple' : '')
				)
			};
			var prompt = force ? toTrash : toRemoveFromPublications;
		}
		else if (collectionTreeRow.isLibrary(true)
				|| collectionTreeRow.isSearch()
				|| collectionTreeRow.isUnfiled()
				|| collectionTreeRow.isRetracted()
				|| collectionTreeRow.isDuplicates()) {
			// In library, don't prompt if meta key was pressed
			var prompt = (force && !fromMenu) ? false : toTrash;
		}
		else if (collectionTreeRow.isCollection()) {
			
			// Ignore unmodified action if only child items are selected
			if (!force && this.itemsView.getSelectedItems().every(item => !item.isTopLevelItem())) {
				return;
			}
			
			var prompt = force ? toTrash : toRemove;
		}
		// Do nothing in trash view if any non-deleted items are selected
		else if (collectionTreeRow.isTrash()) {
			for (const index of this.itemsView.selection.selected) {
				if (!this.itemsView.getRow(index).ref.deleted) {
					return;
				}
			}
			var prompt = toDelete;
		}
		else if (collectionTreeRow.isBucket()) {
			var prompt = toDelete;
		}
		// Do nothing in share views
		else if (collectionTreeRow.isShare()) {
			return;
		}
		
		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
										.getService(Components.interfaces.nsIPromptService);
		if (!prompt || promptService.confirm(window, prompt.title, prompt.text)) {
			this.itemsView.deleteSelection(force);
		}
	}
	
	
	this.mergeSelectedItems = function () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		document.getElementById('zotero-item-pane-content').selectedIndex = 4;
		
		if (typeof Zotero_Duplicates_Pane == 'undefined') {
			Zotero.debug("Loading duplicatesMerge.js");
			Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
				.getService(Components.interfaces.mozIJSSubScriptLoader)
				.loadSubScript("chrome://zotero/content/duplicatesMerge.js");
		}
		
		// Initialize the merge pane with the selected items
		Zotero_Duplicates_Pane.setItems(this.getSelectedItems());
	}
	
	
	this.deleteSelectedCollection = function (deleteItems) {
		var collectionTreeRow = this.getCollectionTreeRow();
		
		// Don't allow deleting libraries
		if (collectionTreeRow.isLibrary(true) && !collectionTreeRow.isFeed()) {
			return;
		}
		
		// Remove virtual duplicates collection
		if (collectionTreeRow.isDuplicates()) {
			this.setVirtual(collectionTreeRow.ref.libraryID, 'duplicates', false);
			return;
		}
		// Remove virtual unfiled collection
		else if (collectionTreeRow.isUnfiled()) {
			this.setVirtual(collectionTreeRow.ref.libraryID, 'unfiled', false);
			return;
		}
		// Remove virtual retracted collection
		else if (collectionTreeRow.isRetracted()) {
			this.setVirtual(collectionTreeRow.ref.libraryID, 'retracted', false);
			return;
		}
		
		if (!this.canEdit() && !collectionTreeRow.isFeed()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components.interfaces.nsIPromptService);
		buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
			+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
		if (this.getCollectionTreeRow()) {
			var title, message;
			// Work out the required title and message
			if (collectionTreeRow.isCollection()) {
				if (deleteItems) {
					title = Zotero.getString('pane.collections.deleteWithItems.title');
					message = Zotero.getString('pane.collections.deleteWithItems');
				}
				else {
					title = Zotero.getString('pane.collections.delete.title');
					message = Zotero.getString('pane.collections.delete')
							+ "\n\n"
							+ Zotero.getString('pane.collections.delete.keepItems');
				}
			}
			else if (collectionTreeRow.isFeed()) {
				title = Zotero.getString('pane.feed.deleteWithItems.title');
				message = Zotero.getString('pane.feed.deleteWithItems');
			}
			else if (collectionTreeRow.isSearch()) {
				title = Zotero.getString('pane.collections.deleteSearch.title');
				message = Zotero.getString('pane.collections.deleteSearch');
			}
			
			// Display prompt
			var index = ps.confirmEx(
				null,
				title,
				message,
				buttonFlags,
				title,
				"", "", "", {}
			);
			if (index == 0) {
				return this.collectionsView.deleteSelection(deleteItems);
			}
		}
	}
	
	
	// Currently used only for Commons to find original linked item
	this.getOriginalItem = function () {
		var item = this.getSelectedItems()[0];
		var collectionTreeRow = this.getCollectionTreeRow();
		// TEMP: Commons buckets only
		return collectionTreeRow.ref.getLocalItem(item);
	}
	
	
	this.showOriginalItem = function () {
		var item = this.getOriginalItem();
		if (!item) {
			Zotero.debug("Original item not found");
			return;
		}
		this.selectItem(item.id).done();
	}
	
	
	/**
	 * @return {Promise}
	 */
	this.restoreSelectedItems = Zotero.Promise.coroutine(function* () {
		var items = this.getSelectedItems();
		if (!items) {
			return;
		}
		
		yield Zotero.DB.executeTransaction(function* () {
			for (let i=0; i<items.length; i++) {
				items[i].deleted = false;
				yield items[i].save({
					skipDateModifiedUpdate: true
				});
			}
		}.bind(this));
	});
	
	
	/**
	 * @return {Promise}
	 */
	this.emptyTrash = Zotero.Promise.coroutine(function* () {
		var libraryID = this.getSelectedLibraryID();
		
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		
		var result = ps.confirm(
			null,
			"",
			Zotero.getString('pane.collections.emptyTrash') + "\n\n"
				+ Zotero.getString('general.actionCannotBeUndone')
		);
		if (result) {
			Zotero.showZoteroPaneProgressMeter(null, true);
			try {
				let deleted = yield Zotero.Items.emptyTrash(
					libraryID,
					{
						onProgress: (progress, progressMax) => {
							var percentage = Math.round((progress / progressMax) * 100);
							Zotero.updateZoteroPaneProgressMeter(percentage);
						}
					}
				);
			}
			finally {
				Zotero.hideZoteroPaneOverlays();
			}
			yield Zotero.purgeDataObjects();
		}
	});
	
	
	// Currently only works on searches
	this.duplicateSelectedCollection = async function () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}

		var row = this.getCollectionTreeRow();
		if (!row) {
			return;
		}
		
		let o = row.ref.clone();
		o.name = await row.ref.ObjectsClass.getNextName(row.ref.libraryID, o.name);
		await o.saveTx();
	};
	
	
	this.editSelectedCollection = Zotero.Promise.coroutine(function* () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}

		var row = this.getCollectionTreeRow();
		if (row) {
			if (row.isCollection()) {
				var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
										.getService(Components.interfaces.nsIPromptService);
				
				var newName = { value: row.getName() };
				var result = promptService.prompt(window, "",
					Zotero.getString('pane.collections.rename'), newName, "", {});
				
				if (result && newName.value) {
					row.ref.name = newName.value;
					row.ref.saveTx();
				}
			}
			else {
				let s = row.ref.clone();
				let groups = [];
				// Promises don't work in the modal dialog, so get the group name here, if
				// applicable, and pass it in. We only need the group that this search belongs
				// to, if any, since the library drop-down is disabled for saved searches.
				if (Zotero.Libraries.get(s.libraryID).libraryType == 'group') {
					groups.push(Zotero.Groups.getByLibraryID(s.libraryID));
				}
				var io = {
					dataIn: {
						search: s,
						name: row.getName(),
						groups: groups
					},
					dataOut: null
				};
				window.openDialog('chrome://zotero/content/searchDialog.xul','','chrome,modal',io);
				if (io.dataOut) {
					row.ref.fromJSON(io.dataOut.json);
					yield row.ref.saveTx();
				}
			}
		}
	});

	this.toggleSelectedItemsRead = Zotero.Promise.coroutine(function* () {
		yield Zotero.FeedItems.toggleReadByID(this.getSelectedItems(true));
	});

	this.markFeedRead = Zotero.Promise.coroutine(function* () {
		var row = this.getCollectionTreeRow();
		if (!row) return;

		let feed = row.ref;
		let feedItemIDs = yield Zotero.FeedItems.getAll(feed.libraryID, true, false, true);
		yield Zotero.FeedItems.toggleReadByID(feedItemIDs, true);
	});

	
	this.editSelectedFeed = Zotero.Promise.coroutine(function* () {
		var row = this.getCollectionTreeRow();
		if (!row) return;
		
		let feed = row.ref;
		let data = {
			url: feed.url,
			title: feed.name,
			ttl: feed.refreshInterval,
			cleanupReadAfter: feed.cleanupReadAfter,
			cleanupUnreadAfter: feed.cleanupUnreadAfter
		};
		
		window.openDialog('chrome://zotero/content/feedSettings.xul', 
			null, 'centerscreen, modal', data);
		if (data.cancelled) return;
		
		feed.name = data.title;
		feed.refreshInterval = data.ttl;
		feed.cleanupReadAfter = data.cleanupReadAfter;
		feed.cleanupUnreadAfter = data.cleanupUnreadAfter;
		yield feed.saveTx();
	});
	
	this.refreshFeed = function() {
		var row = this.getCollectionTreeRow();
		if (!row) return;
		
		let feed = row.ref;
		
		return feed.updateFeed();
	}
	
	
	this.copySelectedItemsToClipboard = function (asCitations) {
		var items = [];
		if (Zotero_Tabs.selectedID == 'zotero-pane') {
			let itemIDs = this.getSelectedItems(true);
			// Get selected item IDs in the item tree order
			itemIDs = this.getSortedItems(true).filter(id => itemIDs.includes(id));
			items = Zotero.Items.get(itemIDs);
		}
		else {
			var reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
			if (reader) {
				let item = Zotero.Items.get(reader.itemID);
				if (item.parentItem) {
					items = [item.parentItem];
				}
			}
		}
		
		if (!items.length) {
			return;
		}
		
		var format = Zotero.QuickCopy.getFormatFromURL(Zotero.QuickCopy.lastActiveURL);
		if (items.every(item => item.isNote() || item.isAttachment())) {
			format = Zotero.QuickCopy.getNoteFormat();
		}
		format = Zotero.QuickCopy.unserializeSetting(format);
		
		// In bibliography mode, remove notes and attachments
		if (format.mode == 'bibliography') {
			items = items.filter(item => item.isRegularItem());
		}
		
		// DEBUG: We could copy notes via keyboard shortcut if we altered
		// Z_F_I.copyItemsToClipboard() to use Z.QuickCopy.getContentFromItems(),
		// but 1) we'd need to override that function's drag limit and 2) when I
		// tried it the OS X clipboard seemed to be getting text vs. HTML wrong,
		// automatically converting text/html to plaintext rather than using
		// text/unicode. (That may be fixable, however.)
		//
		// This isn't currently shown, because the commands are disabled when not relevant, so this
		// function isn't called
		if (!items.length) {
			let ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
			ps.alert(null, "", Zotero.getString("fileInterface.noReferencesError"));
			return;
		}
		
		// determine locale preference
		var locale = format.locale ? format.locale : Zotero.Prefs.get('export.quickCopy.locale');
		
		if (format.mode == 'bibliography') {
			Zotero_File_Interface.copyItemsToClipboard(
				items, format.id, locale, format.contentType == 'html', asCitations
			);
		}
		else if (format.mode == 'export') {
			// Copy citations doesn't work in export mode
			if (asCitations) {
				return;
			}
			else {
				Zotero_File_Interface.exportItemsToClipboard(items, format.id);
			}
		}
	}
	
	
	this.clearQuicksearch = Zotero.Promise.coroutine(function* () {
		var search = document.getElementById('zotero-tb-search');
		if (search.value !== '') {
			search.value = '';
			yield this.search();
			return true;
		}
		return false;
	});
	
	
	/**
	 * Some keys trigger an immediate search
	 */
	this.handleSearchKeypress = function (textbox, event) {
		if (event.keyCode == event.DOM_VK_ESCAPE) {
			textbox.value = '';
			this.search();
		}
		else if (event.keyCode == event.DOM_VK_RETURN) {
			this.search(true);
		}
	}
	
	
	this.handleSearchInput = function (textbox, event) {
		if (textbox.value.indexOf('"') != -1) {
			this.setItemsPaneMessage(Zotero.getString('advancedSearchMode'));
		}
	}
	
	
	/**
	 * @return {Promise}
	 */
	this.search = Zotero.Promise.coroutine(function* (runAdvanced) {
		if (!this.itemsView) {
			return;
		}
		var search = document.getElementById('zotero-tb-search');
		if (!runAdvanced && search.value.indexOf('"') != -1) {
			return;
		}
		var spinner = document.getElementById('zotero-tb-search-spinner');
		spinner.style.display = 'inline';
		var searchVal = search.value;
		yield this.itemsView.setFilter('search', searchVal);
		spinner.style.display = 'none';
		if (runAdvanced) {
			this.clearItemsPaneMessage();
		}
	});
	
	
	this.selectItem = async function (itemID, inLibraryRoot) {
		if (!itemID) {
			return false;
		}
		return this.selectItems([itemID], inLibraryRoot);
	};
	
	
	this.selectItems = async function (itemIDs, inLibraryRoot) {
		if (!itemIDs.length) {
			return false;
		}
		
		var items = await Zotero.Items.getAsync(itemIDs);
		if (!items.length) {
			return false;
		}
		
		// Restore window if it's in the dock
		if (window.windowState == Components.interfaces.nsIDOMChromeWindow.STATE_MINIMIZED) {
			window.restore();
		}
		
		if (!this.collectionsView) {
			throw new Error("Collections view not loaded");
		}
		
		var found = await this.collectionsView.selectItems(itemIDs, inLibraryRoot);
		
		// Focus the items pane
		if (found) {
			document.getElementById(ZoteroPane.itemsView.id).focus();
		}
		
		Zotero_Tabs.select('zotero-pane');
	};
	
	
	this.getSelectedLibraryID = function () {
		return this.collectionsView.getSelectedLibraryID();
	}
	
	
	function getSelectedCollection(asID) {
		return this.collectionsView.getSelectedCollection(asID);
	}
	
	
	function getSelectedSavedSearch(asID) {
		return this.collectionsView.getSelectedSearch(asID);
	}
	
	
	this.getSelectedGroup = function (asID) {
		return this.collectionsView.getSelectedGroup(asID);
	}
	
		
	/*
	 * Return an array of Item objects for selected items
	 *
	 * If asIDs is true, return an array of itemIDs instead
	 */
	function getSelectedItems(asIDs)
	{
		if (!this.itemsView) {
			return [];
		}
		
		return this.itemsView.getSelectedItems(asIDs);
	}
	

	/*
	 * Returns an array of Zotero.Item objects of visible items in current sort order
	 *
	 * If asIDs is true, return an array of itemIDs instead
	 */
	function getSortedItems(asIDs) {
		if (!this.itemsView) {
			return [];
		}
		
		return this.itemsView.getSortedItems(asIDs);
	}
	
	
	function getSortField() {
		if (!this.itemsView) {
			return false;
		}
		
		return this.itemsView.getSortField();
	}
	
	
	function getSortDirection() {
		if (!this.itemsView) {
			return false;
		}
		
		return this.itemsView.getSortDirection();
	}
	
	
	/**
	 * Show context menu once it's ready
	 */
	this.onCollectionsContextMenuOpen = async function (event, x, y) {
		await ZoteroPane.buildCollectionContextMenu();
		x = x || event.clientX;
		y = y || event.clientY;
		document.getElementById('zotero-collectionmenu').openPopup(
			null, null, x + 1, y + 1);
	};
	
	
	/**
	 * Show context menu once it's ready
	 */
	this.onItemsContextMenuOpen = async function (event, x, y) {
		await ZoteroPane.buildItemContextMenu();
		x = x || event.clientX;
		y = y || event.clientY;
		document.getElementById('zotero-itemmenu').openPopup(
			null, null, x + 1, y + 1);
	};
	
	
	this.onCollectionContextMenuSelect = function (event) {
		event.stopPropagation();
		var o = _collectionContextMenuOptions.find(o => o.id == event.target.id)
		if (o.oncommand) {
			o.oncommand();
		}
	};
	
	
	// menuitem configuration
	//
	// This has to be kept in sync with zotero-collectionmenu in zoteroPane.xul. We could do this
	// entirely in JS, but various localized strings are only in zotero.dtd, and they're used in
	// standalone.xul as well, so for now they have to remain as XML entities.
	var _collectionContextMenuOptions = [
		{
			id: "sync",
			label: Zotero.getString('sync.sync'),
			oncommand: () => {
				Zotero.Sync.Runner.sync({
					libraries: [this.getSelectedLibraryID()],
				});
			}
		},
		{
			id: "sep1",
		},
		{
			id: "newCollection",
			command: "cmd_zotero_newCollection"
		},
		{
			id: "newSavedSearch",
			command: "cmd_zotero_newSavedSearch"
		},
		{
			id: "newSubcollection",
			oncommand: () => {
				this.newCollection(this.getSelectedCollection().key);
			}
		},
		{
			id: "refreshFeed",
			oncommand: () => this.refreshFeed()
		},
		{
			id: "sep2",
		},
		{
			id: "showDuplicates",
			oncommand: () => {
				this.setVirtual(this.getSelectedLibraryID(), 'duplicates', true, true);
			}
		},
		{
			id: "showUnfiled",
			oncommand: () => {
				this.setVirtual(this.getSelectedLibraryID(), 'unfiled', true, true);
			}
		},
		{
			id: "showRetracted",
			oncommand: () => {
				this.setVirtual(this.getSelectedLibraryID(), 'retracted', true, true);
			}
		},
		{
			id: "editSelectedCollection",
			oncommand: () => this.editSelectedCollection()
		},
		{
			id: "duplicate",
			oncommand: () => this.duplicateSelectedCollection()
		},
		{
			id: "markReadFeed",
			oncommand: () => this.markFeedRead()
		},
		{
			id: "editSelectedFeed",
			oncommand: () => this.editSelectedFeed()
		},
		{
			id: "deleteCollection",
			oncommand: () => this.deleteSelectedCollection()
		},
		{
			id: "deleteCollectionAndItems",
			oncommand: () => this.deleteSelectedCollection(true)
		},
		{
			id: "sep3",
		},
		{
			id: "exportCollection",
			oncommand: () => Zotero_File_Interface.exportCollection()
		},
		{
			id: "createBibCollection",
			oncommand: () => Zotero_File_Interface.bibliographyFromCollection()
		},
		{
			id: "exportFile",
			oncommand: () => Zotero_File_Interface.exportFile()
		},
		{
			id: "loadReport",
			oncommand: () => Zotero_Report_Interface.loadCollectionReport()
		},
		{
			id: "emptyTrash",
			oncommand: () => this.emptyTrash()
		},
		{
			id: "removeLibrary",
			label: Zotero.getString('pane.collections.menu.remove.library'),
			oncommand: () => {
				let library = Zotero.Libraries.get(this.getSelectedLibraryID());
				let ps = Services.prompt;
				let buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
					+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
				let index = ps.confirmEx(
					null,
					Zotero.getString('pane.collections.removeLibrary'),
					Zotero.getString('pane.collections.removeLibrary.text', library.name),
					buttonFlags,
					Zotero.getString('general.remove'),
					null,
					null, null, {}
				);
				if (index == 0) {
					library.eraseTx();
				}
			}
		},
	];
	
	this.buildCollectionContextMenu = async function () {
		var libraryID = this.getSelectedLibraryID();
		var options = _collectionContextMenuOptions;
		
		var collectionTreeRow = this.getCollectionTreeRow();
		// This can happen if selection is changing during delayed second call below
		if (!collectionTreeRow) {
			return;
		}
		
		// If the items view isn't initialized, this was a right-click on a different collection
		// and the new collection's items are still loading, so continue menu after loading is
		// done. This causes some menu items (e.g., export/createBib/loadReport) to appear gray
		// in the menu at first and then turn black once there are items
		if (!collectionTreeRow.isHeader() && !this.itemsView.initialized) {
			await this.itemsView.waitForLoad();
		}
		
		// Set attributes on the menu from the configuration object
		var menu = document.getElementById('zotero-collectionmenu');
		var m = {};
		for (let i = 0; i < options.length; i++) {
			let option = options[i];
			let menuitem = menu.childNodes[i];
			m[option.id] = menuitem;
			
			menuitem.id = option.id;
			if (!menuitem.classList.contains('menuitem-iconic')) {
				menuitem.classList.add('menuitem-iconic');
			}
			if (option.label) {
				menuitem.setAttribute('label', option.label);
			}
			if (option.command) {
				menuitem.setAttribute('command', option.command);
			}
		}
		
		// By default things are hidden and visible, so we only need to record
		// when things are visible and when they're visible but disabled
		var show = [], disable = [];
		
		if (collectionTreeRow.isCollection()) {
			show = [
				'newSubcollection',
				'sep2',
				'editSelectedCollection',
				'deleteCollection',
				'deleteCollectionAndItems',
				'sep3',
				'exportCollection',
				'createBibCollection',
				'loadReport'
			];
			
			if (!this.itemsView.rowCount) {
				disable = ['createBibCollection', 'loadReport'];
				
				// If no items in subcollections either, disable export
				if (!(await collectionTreeRow.ref.getDescendents(false, 'item', false).length)) {
					disable.push('exportCollection');
				}
			}
			
			// Adjust labels
			m.editSelectedCollection.setAttribute('label', Zotero.getString('pane.collections.menu.rename.collection'));
			m.deleteCollection.setAttribute('label', Zotero.getString('pane.collections.menu.delete.collection'));
			m.deleteCollectionAndItems.setAttribute('label', Zotero.getString('pane.collections.menu.delete.collectionAndItems'));
			m.exportCollection.setAttribute('label', Zotero.getString('pane.collections.menu.export.collection'));
			m.createBibCollection.setAttribute('label', Zotero.getString('pane.collections.menu.createBib.collection'));
			m.loadReport.setAttribute('label', Zotero.getString('pane.collections.menu.generateReport.collection'));
		}
		else if (collectionTreeRow.isFeed()) {
			show = [
				'refreshFeed',
				'sep2',
				'markReadFeed',
				'editSelectedFeed',
				'deleteCollectionAndItems'
			];
			
			if (collectionTreeRow.ref.unreadCount == 0) {
				disable = ['markReadFeed'];
			}
			
			// Adjust labels
			m.deleteCollectionAndItems.setAttribute('label', Zotero.getString('pane.collections.menu.delete.feedAndItems'));
		}
		else if (collectionTreeRow.isSearch()) {
			show = [
				'editSelectedCollection',
				'duplicate',
				'deleteCollection',
				'sep3',
				'exportCollection',
				'createBibCollection',
				'loadReport'
			];
			
			
			if (!this.itemsView.rowCount) {
				disable.push('exportCollection', 'createBibCollection', 'loadReport');
			}
			
			// Adjust labels
			m.editSelectedCollection.setAttribute('label', Zotero.getString('pane.collections.menu.edit.savedSearch'));
			m.duplicate.setAttribute('label', Zotero.getString('pane.collections.menu.duplicate.savedSearch'));
			m.deleteCollection.setAttribute('label', Zotero.getString('pane.collections.menu.delete.savedSearch'));
			m.exportCollection.setAttribute('label', Zotero.getString('pane.collections.menu.export.savedSearch'));
			m.createBibCollection.setAttribute('label', Zotero.getString('pane.collections.menu.createBib.savedSearch'));
			m.loadReport.setAttribute('label', Zotero.getString('pane.collections.menu.generateReport.savedSearch'));
		}
		else if (collectionTreeRow.isTrash()) {
			show = ['emptyTrash'];
		}
		else if (collectionTreeRow.isDuplicates() || collectionTreeRow.isUnfiled() || collectionTreeRow.isRetracted()) {
			show = ['deleteCollection'];
			
			m.deleteCollection.setAttribute('label', Zotero.getString('general.hide'));
		}
		else if (collectionTreeRow.isHeader()) {
		}
		else if (collectionTreeRow.isPublications()) {
			show = [
				'exportFile'
			];
		}
		// Library
		else {
			let library = Zotero.Libraries.get(libraryID);
			show = [];
			if (!library.archived) {
				show.push(
					'sync',
					'sep1',
					'newCollection',
					'newSavedSearch'
				);
			}
				// Only show "Show Duplicates", "Show Unfiled Items", and "Show Retracted" if rows are hidden
			let duplicates = Zotero.Prefs.getVirtualCollectionStateForLibrary(
				libraryID, 'duplicates'
			);
			let unfiled = Zotero.Prefs.getVirtualCollectionStateForLibrary(
				libraryID, 'unfiled'
			);
			let retracted = Zotero.Prefs.getVirtualCollectionStateForLibrary(
				libraryID, 'retracted'
			);
			if (!duplicates || !unfiled || !retracted) {
				if (!library.archived) {
					show.push('sep2');
				}
				if (!duplicates) {
					show.push('showDuplicates');
				}
				if (!unfiled) {
					show.push('showUnfiled');
				}
				if (!retracted) {
					show.push('showRetracted');
				}
			}
			if (!library.archived) {
				show.push('sep3');
			}
			show.push(
				'exportFile'
			);
			if (library.archived) {
				show.push('removeLibrary');
			}
		}
		
		// Disable some actions if user doesn't have write access
		//
		// Some actions are disabled via their commands in onCollectionSelected()
		if (collectionTreeRow.isWithinGroup()
				&& !collectionTreeRow.editable
				&& !collectionTreeRow.isDuplicates()
				&& !collectionTreeRow.isUnfiled()
				&& !collectionTreeRow.isRetracted()) {
			disable.push(
				'newSubcollection',
				'editSelectedCollection',
				'duplicate',
				'deleteCollection',
				'deleteCollectionAndItems'
			);
		}
		
		// If within non-editable group or trash it empty, disable Empty Trash
		if (collectionTreeRow.isTrash()) {
			if ((collectionTreeRow.isWithinGroup() && !collectionTreeRow.isWithinEditableGroup()) || !this.itemsView.rowCount) {
				disable.push('emptyTrash');
			}
		}
		
		// Hide and enable all actions by default (so if they're shown they're enabled)
		for (let i in m) {
			m[i].setAttribute('hidden', true);
			m[i].setAttribute('disabled', false);
		}
		
		for (let id of show) {
			m[id].setAttribute('hidden', false);
		}
		
		for (let id of disable) {
			m[id].setAttribute('disabled', true);
		}
	};
	
	
	this.buildItemContextMenu = Zotero.Promise.coroutine(function* () {
		var options = [
			'showInLibrary',
			'sep1',
			'addNote',
			'createNoteFromAnnotations',
			'createNoteFromAnnotationsMenu',
			'addAttachments',
			'sep2',
			'findPDF',
			'sep3',
			'toggleRead',
			'duplicateItem',
			'removeItems',
			'restoreToLibrary',
			'moveToTrash',
			'deleteFromLibrary',
			'mergeItems',
			'sep4',
			'exportItems',
			'createBib',
			'loadReport',
			'sep5',
			'recognizePDF',
			'unrecognize',
			'createParent',
			'renameAttachments',
			'reindexItem',
		];
		
		var m = {};
		for (let i = 0; i < options.length; i++) {
			m[options[i]] = i;
		}
		
		var menu = document.getElementById('zotero-itemmenu');
		
		// remove old locate menu items
		while(menu.firstChild && menu.firstChild.getAttribute("zotero-locate")) {
			menu.removeChild(menu.firstChild);
		}
		
		var disable = new Set(), show = new Set(), multiple = '';
		
		if (!this.itemsView) {
			return;
		}
		
		var collectionTreeRow = this.getCollectionTreeRow();
		var isTrash = collectionTreeRow.isTrash();
		
		if (isTrash) {
			show.add(m.deleteFromLibrary);
			show.add(m.restoreToLibrary);
		}
		else if (!collectionTreeRow.isFeed()) {
			show.add(m.moveToTrash);
		}

		if(!collectionTreeRow.isFeed()) {
			show.add(m.sep4);
			show.add(m.exportItems);
			show.add(m.createBib);
			show.add(m.loadReport);
		}
		
		var items = this.getSelectedItems();
		
		if (items.length > 0) {
			// Multiple items selected
			if (items.length > 1) {
				var multiple =  '.multiple';
				
				var canMerge = true,
					canIndex = true,
					canRecognize = true,
					canUnrecognize = true,
					canRename = true;
				var canMarkRead = collectionTreeRow.isFeed();
				var markUnread = true;
				
				for (let i = 0; i < items.length; i++) {
					let item = items[i];
					if (canMerge && (!item.isRegularItem() || item.isFeedItem || collectionTreeRow.isDuplicates())) {
						canMerge = false;
					}
					
					if (canIndex && !(yield Zotero.Fulltext.canReindex(item))) {
						canIndex = false;
					}
					
					if (canRecognize && !Zotero.RecognizePDF.canRecognize(item)) {
						canRecognize = false;
					}
					
					if (canUnrecognize && !Zotero.RecognizePDF.canUnrecognize(item)) {
						canUnrecognize = false;
					}
					
					// Show rename option only if all items are child attachments
					if (canRename && (!item.isAttachment() || item.isTopLevelItem() || item.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL)) {
						canRename = false;
					}
					
					if(canMarkRead && markUnread && !item.isRead) {
						markUnread = false;
					}
				}
				
				if (canMerge) {
					show.add(m.mergeItems);
				}
				
				if (canIndex) {
					show.add(m.reindexItem);
				}
				
				if (canRecognize) {
					show.add(m.recognizePDF);
				}
				
				if (canUnrecognize) {
					show.add(m.unrecognize);
				}
				
				if (canMarkRead) {
					show.add(m.toggleRead);
					if (markUnread) {
						menu.childNodes[m.toggleRead].setAttribute('label', Zotero.getString('pane.item.markAsUnread'));
					} else {
						menu.childNodes[m.toggleRead].setAttribute('label', Zotero.getString('pane.item.markAsRead'));
					}
				}
				
				// "Add Notes from Annotation" and "Find Available PDFs"
				if (collectionTreeRow.filesEditable
						&& !collectionTreeRow.isDuplicates()
						&& !collectionTreeRow.isFeed()) {
					if (items.some(item => attachmentsWithExtractableAnnotations(item).length)) {
						show.add(m.createNoteFromAnnotations);
						show.add(m.sep3);
					}
					
					if (items.some(item => item.isRegularItem())) {
						show.add(m.findPDF);
						show.add(m.sep3);
					}
				}

				let canCreateParent = true;
				for (let i = 0; i < items.length; i++) {
					let item = items[i];
					if (!item.isTopLevelItem() || !item.isAttachment() || item.isFeedItem) {
						canCreateParent = false;
						break;
					}
				}
				if (canCreateParent) {
					show.add(m.createParent);
				}
				
				if (canRename) {
					show.add(m.renameAttachments);
				}
				
				// Add in attachment separator
				if (canCreateParent || canRecognize || canUnrecognize || canRename || canIndex) {
					show.add(m.sep5);
				}
				
				// Block certain actions on files if no access and at least one item is a file
				// attachment
				if (!collectionTreeRow.filesEditable) {
					for (let item of items) {
						if (item.isFileAttachment()) {
							disable.add(m.moveToTrash);
							disable.add(m.createParent);
							disable.add(m.renameAttachments);
							break;
						}
					}
				}
				
			}
			
			// Single item selected
			else
			{
				let item = items[0];
				menu.setAttribute('itemID', item.id);
				menu.setAttribute('itemKey', item.key);
				
				if (!isTrash) {
					// Show in Library
					if (!collectionTreeRow.isLibrary(true)) {
						show.add(m.showInLibrary);
						show.add(m.sep1);
					}
					
					if (item.isRegularItem() && !item.isFeedItem) {
						show.add(m.addNote);
						show.add(m.addAttachments);
						show.add(m.sep2);
						
						// Create Note from Annotations
						let popup = document.getElementById('create-note-from-annotations-popup');
						popup.textContent = '';
						let eligibleAttachments = Zotero.Items.get(item.getAttachments())
							.filter(item => item.isPDFAttachment());
						let attachmentsWithAnnotations = eligibleAttachments
							.filter(item => isAttachmentWithExtractableAnnotations(item));
						if (attachmentsWithAnnotations.length) {
							// Display submenu if there's more than one PDF attachment, even if
							// there's only attachment with annotations, so it's clear which one
							// the annotations are coming from
							if (eligibleAttachments.length > 1) {
								show.add(m.createNoteFromAnnotationsMenu);
								for (let attachment of attachmentsWithAnnotations) {
									let menuitem = document.createElement('menuitem');
									menuitem.setAttribute('label', attachment.getDisplayTitle());
									menuitem.onclick = () => {
										ZoteroPane.createNoteFromAnnotationsForAttachment(attachment);
									};
									popup.appendChild(menuitem);
								}
							}
							// Single attachment with annotations
							else {
								show.add(m.createNoteFromAnnotations);
							}
						}
					}
					
					if (Zotero.Attachments.canFindPDFForItem(item)) {
						show.add(m.findPDF);
						show.add(m.sep3);
					}
					
					if (Zotero.RecognizePDF.canUnrecognize(item)) {
						show.add(m.sep5);
						show.add(m.unrecognize);
					}
					
					if (item.isAttachment()) {
						var showSep5 = false;
						
						if (Zotero.RecognizePDF.canRecognize(item)) {
							show.add(m.recognizePDF);
							showSep5 = true;
						}
						
						// Allow parent item creation for standalone attachments
						if (item.isTopLevelItem()) {
							show.add(m.createParent);
							showSep5 = true;
						}
						
						// Attachment rename option
						if (!item.isTopLevelItem() && item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) {
							show.add(m.renameAttachments);
							showSep5 = true;
						}
						
						// If not linked URL, show reindex line
						if (yield Zotero.Fulltext.canReindex(item)) {
							show.add(m.reindexItem);
							showSep5 = true;
						}
						
						if (showSep5) {
							show.add(m.sep5);
						}
					}
					else if (item.isFeedItem) {
						show.add(m.toggleRead);
						if (item.isRead) {
							menu.childNodes[m.toggleRead].setAttribute('label', Zotero.getString('pane.item.markAsUnread'));
						} else {
							menu.childNodes[m.toggleRead].setAttribute('label', Zotero.getString('pane.item.markAsRead'));
						}
					}
					else if (!collectionTreeRow.isPublications()) {
						show.add(m.duplicateItem);
					}
				}
				
				// Update attachment submenu
				var popup = document.getElementById('zotero-add-attachment-popup')
				this.updateAttachmentButtonMenu(popup);
				
				// Block certain actions on files if no access
				if (item.isFileAttachment() && !collectionTreeRow.filesEditable) {
					[m.moveToTrash, m.createParent, m.renameAttachments]
						.forEach(function (x) {
							disable.add(x);
						});
				}
			}
		}
		// No items selected
		else
		{
			// Show in Library
			if (!collectionTreeRow.isLibrary()) {
				show.add(m.showInLibrary);
				show.add(m.sep1);
			}
			
			[
				m.showInLibrary,
				m.duplicateItem,
				m.removeItems,
				m.moveToTrash,
				m.deleteFromLibrary,
				m.exportItems,
				m.createBib,
				m.loadReport
			].forEach(x => disable.add(x));
			
		}
		// Show "Export Note…" if all notes or attachments
		var noteExport = items.every(item => item.isNote() || item.isAttachment());
		// Disable export if all notes are empty
		if (noteExport) {
			// If no non-empty notes, hide if all attachments and disable if all notes or a mixture
			// of notes and attachments
			if (!items.some(item => item.note)) {
				if (items.every(item => item.isAttachment())) {
					show.delete(m.exportItems);
				}
				else {
					disable.add(m.exportItems);
				}
			}
		}
		
		// Disable Create Bibliography if no regular items
		if (show.has(m.createBib) && !items.some(item => item.isRegularItem())) {
			show.delete(m.createBib);
		}
		
		if ((!collectionTreeRow.editable || collectionTreeRow.isPublications()) && !collectionTreeRow.isFeed()) {
			for (let i in m) {
				// Still allow some options for non-editable views
				switch (i) {
					case 'showInLibrary':
					case 'exportItems':
					case 'createBib':
					case 'loadReport':
					case 'toggleRead':
						continue;
				}
				if (isTrash) {
					switch (i) {
					case 'restoreToLibrary':
					case 'deleteFromLibrary':
						continue;
					}
				}
				else if (collectionTreeRow.isPublications()) {
					switch (i) {
					case 'addNote':
					case 'removeItems':
					case 'moveToTrash':
						continue;
					}
				}
				disable.add(m[i]);
			}
		}
		
		// Remove from collection
		if (collectionTreeRow.isCollection() && items.every(item => item.isTopLevelItem())) {
			menu.childNodes[m.removeItems].setAttribute('label', Zotero.getString('pane.items.menu.remove' + multiple));
			show.add(m.removeItems);
		}
		else if (collectionTreeRow.isPublications()) {
			menu.childNodes[m.removeItems].setAttribute('label', Zotero.getString('pane.items.menu.removeFromPublications' + multiple));
			show.add(m.removeItems);
		}
		
		// Set labels, plural if necessary
		menu.childNodes[m.createNoteFromAnnotations].setAttribute('label', Zotero.getString('pane.items.menu.addNoteFromAnnotations' + multiple));
		menu.childNodes[m.createNoteFromAnnotationsMenu].setAttribute('label', Zotero.getString('pane.items.menu.addNoteFromAnnotations' + multiple));
		menu.childNodes[m.findPDF].setAttribute('label', Zotero.getString('pane.items.menu.findAvailablePDF' + multiple));
		menu.childNodes[m.moveToTrash].setAttribute('label', Zotero.getString('pane.items.menu.moveToTrash' + multiple));
		menu.childNodes[m.deleteFromLibrary].setAttribute('label', Zotero.getString('pane.items.menu.delete' + multiple));
		menu.childNodes[m.exportItems].setAttribute('label', Zotero.getString(`pane.items.menu.export${noteExport ? 'Note' : ''}` + multiple));
		menu.childNodes[m.createBib].setAttribute('label', Zotero.getString('pane.items.menu.createBib' + multiple));
		menu.childNodes[m.loadReport].setAttribute('label', Zotero.getString('pane.items.menu.generateReport' + multiple));
		menu.childNodes[m.createParent].setAttribute('label', Zotero.getString('pane.items.menu.createParent' + multiple));
		menu.childNodes[m.recognizePDF].setAttribute('label', Zotero.getString('pane.items.menu.recognizePDF' + multiple));
		menu.childNodes[m.renameAttachments].setAttribute('label', Zotero.getString('pane.items.menu.renameAttachments' + multiple));
		menu.childNodes[m.reindexItem].setAttribute('label', Zotero.getString('pane.items.menu.reindexItem' + multiple));
		
		// Hide and enable all actions by default (so if they're shown they're enabled)
		for (let i in m) {
			let pos = m[i];
			menu.childNodes[pos].setAttribute('hidden', true);
			menu.childNodes[pos].setAttribute('disabled', false);
		}
		
		for (let x of disable) {
			menu.childNodes[x].setAttribute('disabled', true);
		}
		
		for (let x of show) {
			menu.childNodes[x].setAttribute('hidden', false);
		}
		
		// add locate menu options
		yield Zotero_LocateMenu.buildContextMenu(menu, true);
	});
	
	this.onItemTreeActivate = function(event, items) {
		var viewOnDoubleClick = Zotero.Prefs.get('viewOnDoubleClick');
		// Mouse event
		if (event.button && items.length == 1 && viewOnDoubleClick) {
			ZoteroPane.viewItems([items[0]], event);
		}
		// Keyboard event
		else if (items.length < 20) {
			ZoteroPane_Local.viewItems(items, event);
		}
	};
	
	
	function attachmentsWithExtractableAnnotations(item) {
		if (!item.isRegularItem()) return [];
		return Zotero.Items.get(item.getAttachments())
			.filter(item => isAttachmentWithExtractableAnnotations(item));
	}
	
	
	function isAttachmentWithExtractableAnnotations(item) {
		// For now, consider all PDF attachments eligible, since we want to extract external
		// annotations in unprocessed files if present
		//return item.isPDFAttachment() && item.getAnnotations().some(x => x.annotationType != 'ink');
		return item.isPDFAttachment();
	}
	
	
	this.openPreferences = function (paneID, action) {
		Zotero.warn("ZoteroPane.openPreferences() is deprecated"
			+ " -- use Zotero.Utilities.Internal.openPreferences() instead");
		Zotero.Utilities.Internal.openPreferences(paneID, { action });
	}
	
	
	/*
	 * Loads a URL following the standard modifier key behavior
	 *  (e.g. meta-click == new background tab, meta-shift-click == new front tab,
	 *  shift-click == new window, no modifier == frontmost tab
	 */
	this.loadURI = function (uris, event) {
		if(typeof uris === "string") {
			uris = [uris];
		}
		
		for (let i = 0; i < uris.length; i++) {
			let uri = uris[i];
			// Ignore javascript: and data: URIs
			if (uri.match(/^(javascript|data):/)) {
				return;
			}
			
			if (uri.match(/^(chrome|resource):/)) {
				Zotero.openInViewer(uri);
				continue;
			}
			
			// Handle no-content zotero: URLs (e.g., zotero://select) without opening viewer
			if (uri.startsWith('zotero:')) {
				let nsIURI = Services.io.newURI(uri, null, null);
				let handler = Components.classes["@mozilla.org/network/protocol;1?name=zotero"]
					.getService();
				let extension = handler.wrappedJSObject.getExtension(nsIURI);
				if (extension.noContent) {
					extension.doAction(nsIURI);
					return;
				}
			}
			
			try {
				Zotero.launchURL(uri);
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
	}
	
	// TODO upon electron:
	// Technically just forwards to the react itemsView
	// but it is not as robust as XUL. Unfortunately we cannot use the original XUL
	// version since it causes terrible layout issues when mixing XUL and HTML
	// Keeping this function here since setting this message is technically
	// the responsibility of the ZoteroPane and should be independent upon itemsView,
	// which hopefully we will fix once electronero arrives
	function setItemsPaneMessage(content, lock) {
		if (this._itemsPaneMessageLocked) {
			return;
		}

		// Make message permanent
		if (lock) {
			this._itemsPaneMessageLocked = true;
		}

		if (this.itemsView) {
			this.itemsView.setItemsPaneMessage(content, lock);
		}
	}
	
	function clearItemsPaneMessage() {
		// If message box is locked, don't clear
		if (this._itemsPaneMessageLocked) {
			return;
		}
		
		if (this.itemsView) {
			this.itemsView.clearItemsPaneMessage();
		}
	}
	
	
	this.setItemPaneMessage = function (content) {
		document.getElementById('zotero-item-pane-content').selectedIndex = 0;
		
		var elem = document.getElementById('zotero-item-pane-message-box');
		elem.textContent = '';
		if (typeof content == 'string') {
			let contentParts = content.split("\n\n");
			for (let part of contentParts) {
				let desc = document.createElement('description');
				desc.appendChild(document.createTextNode(part));
				elem.appendChild(desc);
			}
		}
		else {
			elem.appendChild(content);
		}
	}
	
	
	/**
	 * @return {Promise<Integer|null|false>} - The id of the new note in non-popup mode, null in
	 *     popup mode (where a note isn't created immediately), or false if library isn't editable
	 */
	this.newNote = Zotero.Promise.coroutine(function* (popup, parentKey, text, citeURI) {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return false;
		}
		
		if (popup) {
			// TODO: _text_
			var c = this.getSelectedCollection();
			if (c) {
				this.openNoteWindow(null, c.id, parentKey);
			}
			else {
				this.openNoteWindow(null, null, parentKey);
			}
			return null;
		}
		
		if (!text) {
			text = '';
		}
		text = text.trim();
		
		if (text) {
			text = '<blockquote'
					+ (citeURI ? ' cite="' + citeURI + '"' : '')
					+ '>' + Zotero.Utilities.text2html(text) + "</blockquote>";
		}
		
		var item = new Zotero.Item('note');
		item.libraryID = this.getSelectedLibraryID();
		item.setNote(text);
		if (parentKey) {
			item.parentKey = parentKey;
		}
		else if (this.getCollectionTreeRow().isCollection()) {
			item.addToCollection(this.getCollectionTreeRow().ref.id);
		}
		var itemID = yield item.saveTx({
			notifierData: {
				autoSyncDelay: Zotero.Notes.AUTO_SYNC_DELAY
			}
		});
		
		yield this.selectItem(itemID);
		
		document.getElementById('zotero-note-editor').focus();
		
		return itemID;
	});
	
	
	/**
	 * Creates a child note for the selected item or the selected item's parent
	 *
	 * @return {Promise}
	 */
	this.newChildNote = function (popup) {
		var selected = this.getSelectedItems()[0];
		var parentKey = selected.parentItemKey;
		parentKey = parentKey ? parentKey : selected.key;
		this.newNote(popup, parentKey);
	}
	
	
	// TODO: Move to server_connector
	this.addSelectedTextToCurrentNote = Zotero.Promise.coroutine(function* () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var text = event.currentTarget.ownerDocument.popupNode.ownerDocument.defaultView.getSelection().toString();
		var uri = event.currentTarget.ownerDocument.popupNode.ownerDocument.location.href;
		
		if (!text) {
			return false;
		}
		
		text = text.trim();
		
		if (!text.length) {
			return false;
		}
		
		text = '<blockquote' + (uri ? ' cite="' + uri + '"' : '') + '>'
			+ Zotero.Utilities.text2html(text) + "</blockquote>";
		
		var items = this.getSelectedItems();
		
		if (this.itemsView.selection.count == 1 && items[0] && items[0].isNote()) {
			var note = items[0].note;
			
			items[0].setNote(note + text);
			yield items[0].saveTx();
			
			var noteElem = document.getElementById('zotero-note-editor')
			noteElem.focus();
			return true;
		}
		
		return false;
	});
	
	
	this.openNoteWindow = function (itemID, col, parentKey) {
		var item = Zotero.Items.get(itemID);
		var type = Zotero.Libraries.get(item.libraryID).libraryType;
		if (!this.canEdit() && (type == 'group' && !Zotero.enablePDFBuildForGroups || !Zotero.isPDFBuild)) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var name = null;
		
		if (itemID) {
			let w = this.findNoteWindow(itemID);
			if (w) {
				w.focus();
				return;
			}
			
			// Create a name for this window so we can focus it later
			//
			// Collection is only used on new notes, so we don't need to
			// include it in the name
			name = 'zotero-note-' + itemID;
		}
		
		var io = { itemID: itemID, collectionID: col, parentItemKey: parentKey };
		window.openDialog('chrome://zotero/content/note.xul', name, 'chrome,resizable,centerscreen,dialog=false', io);
	}
	
	
	this.findNoteWindow = function (itemID) {
		var name = 'zotero-note-' + itemID;
		var wm = Services.wm;
		var e = wm.getEnumerator('zotero:note');
		while (e.hasMoreElements()) {
			var w = e.getNext();
			if (w.name == name) {
				return w;
			}
		}
	};


	this.onNoteWindowClosed = async function (itemID, noteText) {
		var item = Zotero.Items.get(itemID);
		item.setNote(noteText);
		await item.saveTx();

		// If note is still selected, show the editor again when the note window closes
		var selectedItems = this.getSelectedItems(true);
		if (selectedItems.length == 1 && itemID == selectedItems[0]) {
			ZoteroItemPane.onNoteSelected(item, this.collectionsView.editable);
		}
	};
	
	
	this.openBackupNoteWindow = function (itemID) {
		var item = Zotero.Items.get(itemID);
		var type = Zotero.Libraries.get(item.libraryID).libraryType;
		if (!this.canEdit() && (type == 'group' && !Zotero.enablePDFBuildForGroups || !Zotero.isPDFBuild)) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var name = null;
		
		if (itemID) {
			let w = this.findBackupNoteWindow(itemID);
			if (w) {
				w.focus();
				return;
			}
			
			// Create a name for this window so we can focus it later
			//
			// Collection is only used on new notes, so we don't need to
			// include it in the name
			name = 'zotero-backup-note-' + itemID;
		}
		
		var io = { itemID: itemID };
		window.openDialog('chrome://zotero/content/noteBackup.xul', name, 'chrome,resizable,centerscreen,dialog=false', io);
	}
	
	
	this.findBackupNoteWindow = function (itemID) {
		var name = 'zotero-backup-note-' + itemID;
		var wm = Services.wm;
		var e = wm.getEnumerator('zotero:note');
		while (e.hasMoreElements()) {
			var w = e.getNext();
			if (w.name == name) {
				return w;
			}
		}
	};
	
	
	this.addAttachmentFromURI = Zotero.Promise.method(function (link, itemID) {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var io = {};
		window.openDialog('chrome://zotero/content/attachLink.xul',
			'zotero-attach-uri-dialog', 'centerscreen, modal', io);
		if (!io.out) return;
		return Zotero.Attachments.linkFromURL({
			url: io.out.link,
			parentItemID: itemID,
			title: io.out.title
		});
	});
	
	
	this.addAttachmentFromDialog = async function (link, parentItemID) {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var collectionTreeRow = this.getCollectionTreeRow();
		if (link) {
			if (collectionTreeRow.isWithinGroup()) {
				Zotero.alert(null, "", "Linked files cannot be added to group libraries.");
				return;
			}
			else if (collectionTreeRow.isPublications()) {
				Zotero.alert(
					null,
					Zotero.getString('general.error'),
					Zotero.getString('publications.error.linkedFilesCannotBeAdded')
				);
				return;
			}
		}
		
		// TODO: disable in menu
		if (!this.canEditFiles()) {
			this.displayCannotEditLibraryFilesMessage();
			return;
		}
		
		var libraryID = collectionTreeRow.ref.libraryID;
		
		var fp = new FilePicker();
		fp.init(window, Zotero.getString('pane.item.attachments.select'), fp.modeOpenMultiple);
		fp.appendFilters(fp.filterAll);
		
		if (await fp.show() != fp.returnOK) {
			return;
		}
		
		var files = fp.files;
		var addedItems = [];
		var collection;
		var fileBaseName;
		if (parentItemID) {
			// If only one item is being added, automatic renaming is enabled, and the parent item
			// doesn't have any other non-HTML file attachments, rename the file.
			// This should be kept in sync with itemTreeView::drop().
			if (files.length == 1 && Zotero.Attachments.shouldAutoRenameFile(link)) {
				let parentItem = Zotero.Items.get(parentItemID);
				if (!parentItem.numNonHTMLFileAttachments()) {
					fileBaseName = await Zotero.Attachments.getRenamedFileBaseNameIfAllowedType(
						parentItem, files[0]
					);
				}
			}
		}
		// If not adding to an item, add to the current collection
		else {
			collection = this.getSelectedCollection(true);
		}
		
		for (let file of files) {
			let item;
			
			if (link) {
				// Rename linked file, with unique suffix if necessary
				try {
					if (fileBaseName) {
						let ext = Zotero.File.getExtension(file);
						let newName = await Zotero.File.rename(
							file,
							fileBaseName + (ext ? '.' + ext : ''),
							{
								unique: true
							}
						);
						// Update path in case the name was changed to be unique
						file = OS.Path.join(OS.Path.dirname(file), newName);
					}
				}
				catch (e) {
					Zotero.logError(e);
				}
				
				item = await Zotero.Attachments.linkFromFile({
					file,
					parentItemID,
					collections: collection ? [collection] : undefined
				});
			}
			else {
				if (file.endsWith(".lnk")) {
					let win = Services.wm.getMostRecentWindow("navigator:browser");
					win.ZoteroPane.displayCannotAddShortcutMessage(file);
					continue;
				}
				
				item = await Zotero.Attachments.importFromFile({
					file,
					libraryID,
					fileBaseName,
					parentItemID,
					collections: collection ? [collection] : undefined
				});
			}
			
			addedItems.push(item);
		}
		
		// Automatically retrieve metadata for top-level PDFs
		if (!parentItemID) {
			Zotero.RecognizePDF.autoRecognizeItems(addedItems);
		}
	};
	
	
	this.findPDFForSelectedItems = async function () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		await Zotero.Attachments.addAvailablePDFs(this.getSelectedItems());
	};
	
	
	/**
	 * Shows progress dialog for a webpage/snapshot save request
	 */
	function _showPageSaveStatus(title) {
		var progressWin = new Zotero.ProgressWindow();
		progressWin.changeHeadline(Zotero.getString('ingester.scraping'));
		var icon = 'chrome://zotero/skin/treeitem-webpage.png';
		progressWin.addLines(title, icon)
		progressWin.show();
		progressWin.startCloseTimer();
	}
	
	/**
	 * @param	{Document}			doc
	 * @param	{String|Integer}	[itemType='webpage']	Item type id or name
	 * @param	{Boolean}			[saveSnapshot]			Force saving or non-saving of a snapshot,
	 *														regardless of automaticSnapshots pref
	 * @return {Promise<Zotero.Item>|false}
	 */
	this.addItemFromDocument = Zotero.Promise.coroutine(function* (doc, itemType, saveSnapshot, row) {
		_showPageSaveStatus(doc.title);
		
		// Save snapshot if explicitly enabled or automatically pref is set and not explicitly disabled
		saveSnapshot = saveSnapshot || (saveSnapshot !== false && Zotero.Prefs.get('automaticSnapshots'));
		
		// TODO: this, needless to say, is a temporary hack
		if (itemType == 'temporaryPDFHack') {
			itemType = null;
			var isPDF = false;
			if (doc.title.indexOf('application/pdf') != -1 || Zotero.Attachments.isPDFJS(doc)
					|| doc.contentType == 'application/pdf') {
				isPDF = true;
			}
			else {
				var ios = Components.classes["@mozilla.org/network/io-service;1"].
							getService(Components.interfaces.nsIIOService);
				try {
					var uri = ios.newURI(doc.location, null, null);
					if (uri.fileName && uri.fileName.match(/pdf$/)) {
						isPDF = true;
					}
				}
				catch (e) {
					Zotero.debug(e);
					Components.utils.reportError(e);
				}
			}
			
			if (isPDF && saveSnapshot) {
				//
				// Duplicate newItem() checks here
				//
				if (Zotero.DB.inTransaction()) {
					yield Zotero.DB.waitForTransaction();
				}
				
				// Currently selected row
				if (row === undefined && this.collectionsView && this.getCollectionTreeRow()) {
					row = this.collectionsView.selection.focused;
				}
				
				if (row && !this.canEdit(row)) {
					this.displayCannotEditLibraryMessage();
					return false;
				}
				
				if (row !== undefined) {
					var collectionTreeRow = this.collectionsView.getRow(row);
					var libraryID = collectionTreeRow.ref.libraryID;
				}
				else {
					var libraryID = Zotero.Libraries.userLibraryID;
					var collectionTreeRow = null;
				}
				//
				//
				//
				
				if (row && !this.canEditFiles(row)) {
					this.displayCannotEditLibraryFilesMessage();
					return false;
				}
				
				if (collectionTreeRow && collectionTreeRow.isCollection()) {
					var collectionID = collectionTreeRow.ref.id;
				}
				else {
					var collectionID = false;
				}
				
				let item = yield Zotero.Attachments.importFromDocument({
					libraryID: libraryID,
					document: doc,
					collections: collectionID ? [collectionID] : []
				});
				
				yield this.selectItem(item.id);
				return false;
			}
		}
		
		// Save web page item by default
		if (!itemType) {
			itemType = 'webpage';
		}
		var data = {
			title: doc.title,
			url: doc.location.href,
			accessDate: "CURRENT_TIMESTAMP"
		}
		itemType = Zotero.ItemTypes.getID(itemType);
		var item = yield this.newItem(itemType, data, row);
		var filesEditable = Zotero.Libraries.get(item.libraryID).filesEditable;
		
		if (saveSnapshot) {
			var link = false;
			
			if (link) {
				yield Zotero.Attachments.linkFromDocument({
					document: doc,
					parentItemID: item.id
				});
			}
			else if (filesEditable) {
				yield Zotero.Attachments.importFromDocument({
					document: doc,
					parentItemID: item.id
				});
			}
		}
		
		return item;
	});
	
	
	/**
	 * @return {Zotero.Item|false} - The saved item, or false if item can't be saved
	 */
	this.addItemFromURL = Zotero.Promise.coroutine(function* (url, itemType, saveSnapshot, row) {
		url = Zotero.Utilities.Internal.resolveIntermediateURL(url);
		
		let [mimeType, hasNativeHandler] = yield Zotero.MIME.getMIMETypeFromURL(url);
		
		// If native type, save using a hidden browser
		if (hasNativeHandler) {
			var deferred = Zotero.Promise.defer();
			
			var processor = function (doc) {
				return ZoteroPane_Local.addItemFromDocument(doc, itemType, saveSnapshot, row)
				.then(function (item) {
					deferred.resolve(item)
				});
			};
			try {
				yield Zotero.HTTP.processDocuments([url], processor);
			} catch (e) {
				Zotero.debug(e, 1);
				deferred.reject(e);
			}
			
			return deferred.promise;
		}
		// Otherwise create placeholder item, attach attachment, and update from that
		else {
			// TODO: this, needless to say, is a temporary hack
			if (itemType == 'temporaryPDFHack') {
				itemType = null;
				
				if (mimeType == 'application/pdf') {
					//
					// Duplicate newItem() checks here
					//
					if (Zotero.DB.inTransaction()) {
						yield Zotero.DB.waitForTransaction();
					}
					
					// Currently selected row
					if (row === undefined) {
						row = ZoteroPane_Local.collectionsView.selection.focused;
					}
					
					if (!ZoteroPane_Local.canEdit(row)) {
						ZoteroPane_Local.displayCannotEditLibraryMessage();
						return false;
					}
					
					if (row !== undefined) {
						var collectionTreeRow = ZoteroPane_Local.collectionsView.getRow(row);
						var libraryID = collectionTreeRow.ref.libraryID;
					}
					else {
						var libraryID = Zotero.Libraries.userLibraryID;
						var collectionTreeRow = null;
					}
					//
					//
					//
					
					if (!ZoteroPane_Local.canEditFiles(row)) {
						ZoteroPane_Local.displayCannotEditLibraryFilesMessage();
						return false;
					}
					
					if (collectionTreeRow && collectionTreeRow.isCollection()) {
						var collectionID = collectionTreeRow.ref.id;
					}
					else {
						var collectionID = false;
					}
					
					let attachmentItem = yield Zotero.Attachments.importFromURL({
						libraryID,
						url,
						collections: collectionID ? [collectionID] : undefined,
						contentType: mimeType
					});
					this.selectItem(attachmentItem.id)
					return attachmentItem;
				}
			}
			
			if (!itemType) {
				itemType = 'webpage';
			}
			
			var item = yield ZoteroPane_Local.newItem(itemType, {}, row)
			var filesEditable = Zotero.Libraries.get(item.libraryID).filesEditable;
			
			// Save snapshot if explicitly enabled or automatically pref is set and not explicitly disabled
			if (saveSnapshot || (saveSnapshot !== false && Zotero.Prefs.get('automaticSnapshots'))) {
				var link = false;
				
				if (link) {
					//Zotero.Attachments.linkFromURL(doc, item.id);
				}
				else if (filesEditable) {
					var attachmentItem = yield Zotero.Attachments.importFromURL({
						url,
						parentItemID: item.id,
						contentType: mimeType
					});
					if (attachmentItem) {
						item.setField('title', attachmentItem.getField('title'));
						item.setField('url', attachmentItem.getField('url'));
						item.setField('accessDate', attachmentItem.getField('accessDate'));
						yield item.saveTx();
					}
				}
			}
			
			return item;
		}
	});
	
	
	this.viewItems = Zotero.Promise.coroutine(function* (items, event) {
		for (let i = 0; i < items.length; i++) {
			let item = items[i];
			if (item.isRegularItem()) {
				// Prefer local file attachments
				var uri = Components.classes["@mozilla.org/network/standard-url;1"]
							.createInstance(Components.interfaces.nsIURI);
				let attachment = yield item.getBestAttachment();
				if (attachment) {
					yield this.viewAttachment(attachment.id, event);
					continue;
				}
				
				// Fall back to URI field, then DOI
				var uri = item.getField('url');
				if (!uri) {
					var doi = item.getField('DOI');
					if (doi) {
						// Pull out DOI, in case there's a prefix
						doi = Zotero.Utilities.cleanDOI(doi);
						if (doi) {
							uri = "http://dx.doi.org/" + encodeURIComponent(doi);
						}
					}
				}
				
				// Fall back to first attachment link
				if (!uri) {
					let attachmentID = item.getAttachments()[0];
					if (attachmentID) {
						let attachment = yield Zotero.Items.getAsync(attachmentID);
						if (attachment) uri = attachment.getField('url');
					}
				}
				
				if (uri) {
					this.loadURI(uri, event);
				}
			}
			else if (item.isNote()) {
				var type = Zotero.Libraries.get(item.libraryID).libraryType;
				if (!this.collectionsView.editable && (type == 'group' && !Zotero.enablePDFBuildForGroups || !Zotero.isPDFBuild)) {
					continue;
				}
				document.getElementById('zotero-view-note-button').doCommand();
			}
			else if (item.isAttachment()) {
				yield this.viewAttachment(item.id, event);
			}
		}
	});
	
	
	this.viewAttachment = Zotero.serial(async function (itemIDs, event, noLocateOnMissing, extraData) {
		// If view isn't editable, don't show Locate button, since the updated
		// path couldn't be sent back up
		if (!this.collectionsView.editable) {
			noLocateOnMissing = true;
		}
		
		if(typeof itemIDs != "object") itemIDs = [itemIDs];
		
		var launchFile = async (path, contentType, itemID) => {
			// Fix blank PDF attachment MIME type
			if (!contentType) {
				let item = await Zotero.Items.getAsync(itemID);
				let path = await item.getFilePathAsync();
				let type = 'application/pdf';
				if (Zotero.MIME.sniffForMIMEType(await Zotero.File.getSample(path)) == type) {
					contentType = type;
					item.attachmentContentType = type;
					await item.saveTx();
				}
			}
			// Custom PDF handler
			if (contentType === 'application/pdf') {
				let item = await Zotero.Items.getAsync(itemID);
				let library = Zotero.Libraries.get(item.libraryID);
				// TEMP
				if (Zotero.isPDFBuild && (library.libraryType == 'user' || Zotero.enablePDFBuildForGroups)) {
					await Zotero.Reader.open(
						itemID,
						extraData && extraData.location,
						{ openInWindow: event && event.shiftKey }
					);
					return;
				}
				let pdfHandler  = Zotero.Prefs.get("fileHandler.pdf");
				if (pdfHandler) {
					if (await OS.File.exists(pdfHandler)) {
						Zotero.launchFileWithApplication(path, pdfHandler);
						return;
					}
					else {
						Zotero.logError(`${pdfHandler} not found -- launching file normally`);
					}
				}
			}
			Zotero.launchFile(path);
		};
		
		for (let i = 0; i < itemIDs.length; i++) {
			let itemID = itemIDs[i];
			let item = await Zotero.Items.getAsync(itemID);
			if (!item.isAttachment()) {
				throw new Error("Item " + itemID + " is not an attachment");
			}
			
			Zotero.debug("Viewing attachment " + item.libraryKey);
			
			if (item.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
				this.loadURI(item.getField('url'), event);
				continue;
			}
			
			let isLinkedFile = !item.isStoredFileAttachment();
			let path = item.getFilePath();
			if (!path) {
				ZoteroPane_Local.showAttachmentNotFoundDialog(
					item.id,
					path,
					{
						noLocate: true,
						notOnServer: true,
						linkedFile: isLinkedFile
					}
				);
				return;
			}
			let fileExists = await OS.File.exists(path);
			
			// If the file is an evicted iCloud Drive file, launch that to trigger a download.
			// As of 10.13.6, launching an .icloud file triggers the download and opens the
			// associated program (e.g., Preview) but won't actually open the file, so we wait a bit
			// for the original file to exist and then continue with regular file opening below.
			//
			// To trigger eviction for testing, use Cirrus from https://eclecticlight.co/downloads/
			if (!fileExists && Zotero.isMac && isLinkedFile) {
				// Get the path to the .icloud file
				let iCloudPath = Zotero.File.getEvictedICloudPath(path);
				if (await OS.File.exists(iCloudPath)) {
					Zotero.debug("Triggering download of iCloud file");
					await launchFile(iCloudPath, item.attachmentContentType, itemID);
					let time = new Date();
					let maxTime = 5000;
					let revealed = false;
					while (true) {
						// If too much time has elapsed, just reveal the file in Finder instead
						if (new Date() - time > maxTime) {
							Zotero.debug(`File not available after ${maxTime} -- revealing instead`);
							try {
								Zotero.File.reveal(iCloudPath);
								revealed = true;
							}
							catch (e) {
								Zotero.logError(e);
								// In case the main file became available
								try {
									Zotero.File.reveal(path);
									revealed = true;
								}
								catch (e) {
									Zotero.logError(e);
								}
							}
							break;
						}
						
						// Wait a bit for the download and check again
						await Zotero.Promise.delay(250);
						Zotero.debug("Checking for downloaded file");
						if (await OS.File.exists(path)) {
							Zotero.debug("File is ready");
							fileExists = true;
							break;
						}
					}
					
					if (revealed) {
						continue;
					}
				}
			}
			
			let fileSyncingEnabled = Zotero.Sync.Storage.Local.getEnabledForLibrary(item.libraryID);
			let redownload = false;
			
			// TEMP: If file is queued for download, download first. Starting in 5.0.85, files
			// modified remotely get marked as SYNC_STATE_FORCE_DOWNLOAD, causing them to get
			// downloaded at sync time even in download-as-needed mode, but this causes files
			// modified previously to be downloaded on open.
			if (fileExists
					&& !isLinkedFile
					&& fileSyncingEnabled
					&& (item.attachmentSyncState == Zotero.Sync.Storage.Local.SYNC_STATE_TO_DOWNLOAD)) {
				Zotero.debug("File exists but is queued for download -- re-downloading");
				redownload = true;
			}
			
			if (fileExists && !redownload) {
				Zotero.debug("Opening " + path);
				Zotero.Notifier.trigger('open', 'file', item.id);
				await launchFile(path, item.attachmentContentType, item.id);
				continue;
			}
			
			if (isLinkedFile || !fileSyncingEnabled) {
				this.showAttachmentNotFoundDialog(
					itemID,
					path,
					{
						noLocate: noLocateOnMissing,
						notOnServer: false,
						linkedFile: isLinkedFile
					}
				);
				return;
			}
			
			try {
				let results = await Zotero.Sync.Runner.downloadFile(item);
				if (!results || !results.localChanges) {
					Zotero.debug("Download failed -- opening existing file");
				}
			}
			catch (e) {
				// TODO: show error somewhere else
				Zotero.debug(e, 1);
				ZoteroPane_Local.syncAlert(e);
				return;
			}
			
			if (!await item.getFilePathAsync()) {
				ZoteroPane_Local.showAttachmentNotFoundDialog(
					item.id,
					path,
					{
						noLocate: noLocateOnMissing,
						notOnServer: true
					}
				);
				return;
			}
			
			Zotero.Notifier.trigger('redraw', 'item', []);
			
			Zotero.debug("Opening " + path);
			Zotero.Notifier.trigger('open', 'file', item.id);
			await launchFile(path, item.attachmentContentType, item.id);
		}
	});
	
	this.viewPDF = async function (itemID, location) {
		await this.viewAttachment(itemID, null, false, { location });
	};
	
	
	/**
	 * @deprecated
	 */
	this.launchFile = function (file) {
		Zotero.debug("ZoteroPane.launchFile() is deprecated -- use Zotero.launchFile()", 2);
		Zotero.launchFile(file);
	}
	
	
	/**
	 * @deprecated
	 */
	this.launchURL = function (url) {
		Zotero.debug("ZoteroPane.launchURL() is deprecated -- use Zotero.launchURL()", 2);
		return Zotero.launchURL(url);
	}
	
	
	function viewSelectedAttachment(event, noLocateOnMissing)
	{
		if (this.itemsView && this.itemsView.selection.count == 1) {
			this.viewAttachment(this.getSelectedItems(true)[0], event, noLocateOnMissing);
		}
	}
	
	
	this.showAttachmentInFilesystem = async function (itemID, noLocateOnMissing) {
		var attachment = await Zotero.Items.getAsync(itemID)
		if (attachment.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) return;
		
		var path = attachment.getFilePath();
		var fileExists = await OS.File.exists(path);
		
		// If file doesn't exist but an evicted iCloud Drive file does, reveal that instead
		if (!fileExists && Zotero.isMac && !attachment.isStoredFileAttachment()) {
			let iCloudPath = Zotero.File.getEvictedICloudPath(path);
			if (await OS.File.exists(iCloudPath)) {
				path = iCloudPath;
				fileExists = true;
			}
		}
		
		if (!fileExists) {
			this.showAttachmentNotFoundDialog(
				attachment.id,
				path,
				{
					noLocate: noLocateOnMissing,
					notOnServer: false,
					linkedFile: attachment.isLinkedFileAttachment()
				}
			);
			return;
		}
		
		let file = Zotero.File.pathToFile(path);
		try {
			Zotero.debug("Revealing " + file.path);
			file.reveal();
		}
		catch (e) {
			// On platforms that don't support nsIFile.reveal() (e.g. Linux),
			// launch the parent directory
			Zotero.launchFile(file.parent);
		}
		Zotero.Notifier.trigger('open', 'file', attachment.id);
	};
	
	
	this.showPublicationsWizard = function (items) {
		var io = {
			hasFiles: false,
			hasNotes: false,
			hasRights: null // 'all', 'some', or 'none'
		};
		var allItemsHaveRights = true;
		var noItemsHaveRights = true;
		// Determine whether any/all items have files, notes, or Rights values
		for (let i = 0; i < items.length; i++) {
			let item = items[i];
			
			// Files
			if (!io.hasFiles && item.numAttachments()) {
				let attachmentIDs = item.getAttachments();
				io.hasFiles = Zotero.Items.get(attachmentIDs).some(
					attachment => attachment.isFileAttachment()
				);
			}
			// Notes
			if (!io.hasNotes && item.numNotes()) {
				io.hasNotes = true;
			}
			// Rights
			if (item.getField('rights')) {
				noItemsHaveRights = false;
			}
			else {
				allItemsHaveRights = false;
			}
		}
		io.hasRights = allItemsHaveRights ? 'all' : (noItemsHaveRights ? 'none' : 'some');
		window.openDialog('chrome://zotero/content/publicationsDialog.xul','','chrome,modal', io);
		return io.license ? io : false;
	};
	
	
	/**
	 * Test if the user can edit the currently selected view
	 *
	 * @param	{Integer}	[row]
	 *
	 * @return	{Boolean}		TRUE if user can edit, FALSE if not
	 */
	this.canEdit = function (row) {
		// Currently selected row
		if (row === undefined) {
			row = this.collectionsView.selection.focused;
		}
		
		var collectionTreeRow = this.collectionsView.getRow(row);
		return collectionTreeRow.editable;
	}
	
	
	/**
	 * Test if the user can edit the parent library of the selected view
	 *
	 * @param	{Integer}	[row]
	 * @return	{Boolean}		TRUE if user can edit, FALSE if not
	 */
	this.canEditLibrary = function (row) {
		// Currently selected row
		if (row === undefined) {
			row = this.collectionsView.selection.focused;
		}
		
		var collectionTreeRow = this.collectionsView.getRow(row);
		return Zotero.Libraries.get(collectionTreeRow.ref.libraryID).editable;
	}
	
	
	/**
	 * Test if the user can edit the currently selected library/collection
	 *
	 * @param	{Integer}	[row]
	 *
	 * @return	{Boolean}		TRUE if user can edit, FALSE if not
	 */
	this.canEditFiles = function (row) {
		// Currently selected row
		if (row === undefined) {
			row = this.collectionsView.selection.focused;
		}
		
		var collectionTreeRow = this.collectionsView.getRow(row);
		return collectionTreeRow.filesEditable;
	}
	
	
	this.displayCannotEditLibraryMessage = function () {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		ps.alert(null, "", Zotero.getString('save.error.cannotMakeChangesToCollection'));
	}
	
	
	this.displayCannotEditLibraryFilesMessage = function () {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		ps.alert(null, "", Zotero.getString('save.error.cannotAddFilesToCollection'));
	}
	
	
	this.displayCannotAddToMyPublicationsMessage = function () {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		ps.alert(null, "", Zotero.getString('save.error.cannotAddToMyPublications'));
	}
	
	
	// TODO: Figure out a functioning way to get the original path and just copy the real file
	this.displayCannotAddShortcutMessage = function (path) {
		Zotero.alert(
			null,
			Zotero.getString("general.error"),
			Zotero.getString("file.error.cannotAddShortcut") + (path ? "\n\n" + path : "")
		);
	}
	
	
	this.showAttachmentNotFoundDialog = function (itemID, path, options = {}) {
		var { noLocate, notOnServer, linkedFile } = options;
		
		var title = Zotero.getString('pane.item.attachments.fileNotFound.title');
		var text = Zotero.getString(
				'pane.item.attachments.fileNotFound.text1' + (path ? '.path' : '')
			)
			+ (path ? "\n\n" + path : '')
			+ "\n\n"
			+ Zotero.getString(
				'pane.item.attachments.fileNotFound.text2.'
					+ (options.linkedFile
						? 'linked'
						: 'stored' + (notOnServer ? '.notOnServer' : '')
					),
				[ZOTERO_CONFIG.CLIENT_NAME, ZOTERO_CONFIG.DOMAIN_NAME]
			);
		var supportURL = options.linkedFile
			? 'https://www.zotero.org/support/kb/missing_linked_file'
			: 'https://www.zotero.org/support/kb/files_not_syncing';
		
		var ps = Services.prompt;
		
		// Don't show Locate button
		if (noLocate) {
			let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_OK
				+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING;
			let index = ps.confirmEx(null,
				title,
				text,
				buttonFlags,
				null,
				Zotero.getString('general.moreInformation'),
				null, null, {}
			);
			if (index == 1) {
				this.loadURI(supportURL, { metaKey: true, shiftKey: true });
			}
			return;
		}
		
		var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
			+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL
			+ ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING;
		var index = ps.confirmEx(null,
			title,
			text,
			buttonFlags,
			Zotero.getString('general.locate'),
			null,
			Zotero.getString('general.moreInformation')
			, null, {}
		);
		
		if (index == 0) {
			this.relinkAttachment(itemID);
		}
		else if (index == 2) {
			this.loadURI(supportURL, { metaKey: true, shiftKey: true });
		}
	}
	
	
	this.syncAlert = function (e) {
		e = Zotero.Sync.Runner.parseError(e);
		var ps = Services.prompt;
		var buttonText = e.dialogButtonText;
		var buttonCallback = e.dialogButtonCallback;
		
		if (e.errorType == 'warning' || e.errorType == 'error') {
			let title = Zotero.getString('general.' + e.errorType);
			// TODO: Display header in bold
			let msg = (e.dialogHeader ? e.dialogHeader + '\n\n' : '') + e.message;
			
			if (e.errorType == 'warning' || buttonText === null) {
				ps.alert(null, title, e.message);
				return;
			}
			
			if (!buttonText) {
				buttonText = Zotero.getString('errorReport.reportError');
				buttonCallback = function () {
					ZoteroPane.reportErrors();
				};
			}
			
			let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_OK
				+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING;
			let index = ps.confirmEx(
				null,
				title,
				msg,
				buttonFlags,
				"",
				buttonText,
				"", null, {}
			);
			
			if (index == 1) {
				setTimeout(buttonCallback, 1);
			}
		}
		// Upgrade message
		else if (e.errorType == 'upgrade') {
			ps.alert(null, "", e.message);
			return;
		}
	};
	
	
	this.recognizeSelected = function() {
		Zotero.RecognizePDF.recognizeItems(ZoteroPane.getSelectedItems());
		Zotero.ProgressQueues.get('recognize').getDialog().open();
	};
	
	
	this.unrecognizeSelected = async function () {
		var items = ZoteroPane.getSelectedItems();
		for (let item of items) {
			await Zotero.RecognizePDF.unrecognize(item);
		}
	};
	
	
	this.createParentItemsFromSelected = async function () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		let items = this.getSelectedItems();

		if (items.length > 1) {
			for (let i = 0; i < items.length; i++) {
				let item = items[i];
				if (!item.isTopLevelItem() || item.isRegularItem()) {
					throw new Error('Item ' + item.id + ' is not a top-level attachment');
				}

				await this.createEmptyParent(item);
			}
		}
		else {
			// Ask for an identifier if there is only one item
			let item = items[0];
			if (!item.isAttachment() || !item.isTopLevelItem()) {
				throw new Error('Item ' + item.id + ' is not a top-level attachment');
			}

			let io = { dataIn: { item }, dataOut: null };
			window.openDialog('chrome://zotero/content/createParentDialog.xul', '', 'chrome,modal,centerscreen', io);
			if (!io.dataOut) {
				return false;
			}

			// If we made a parent, attach the child
			if (io.dataOut.parent) {
				await Zotero.DB.executeTransaction(async function () {
					item.parentID = io.dataOut.parent.id;
					await item.save();
				});
			}
			// If they clicked manual entry then make a dummy parent
			else {
				this.createEmptyParent(item);
			}
		}
	};
	
	
	this.createNoteFromAnnotationsForAttachment = async function (attachment, { skipSelect } = {}) {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		await Zotero.PDFWorker.import(attachment.id, true);
		var note = await Zotero.EditorInstance.createNoteFromAnnotations(
			attachment.getAnnotations().filter(x => x.annotationType != 'ink'), attachment.parentID
		);
		if (!skipSelect) {
			await this.selectItem(note.id);
		}
		return note;
	};
	
	
	this.createNoteFromAnnotationsFromSelected = async function () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		var items = this.getSelectedItems();
		var itemIDsToSelect = [];
		for (let item of items) {
			let attachments = [];
			if (item.isRegularItem()) {
				// Find all child attachments with extractable annotations
				attachments.push(
					...Zotero.Items.get(item.getAttachments())
						.filter(item => isAttachmentWithExtractableAnnotations(item))
				);
			}
			else if (item.isFileAttachment()) {
				attachments.push(item);
			}
			else if (items.length == 1) {
				throw new Error("Not a regular item or file attachment");
			}
			else {
				continue;
			}
			for (let attachment of attachments) {
				let note = await this.createNoteFromAnnotationsForAttachment(
					attachment,
					{ skipSelect: true }
				);
				itemIDsToSelect.push(note.id);
			}
		}
		await this.selectItems(itemIDsToSelect);
	};
	
	this.createEmptyParent = async function (item) {
		await Zotero.DB.executeTransaction(async function () {
			// TODO: remove once there are no top-level web attachments
			if (item.isWebAttachment()) {
				var parent = new Zotero.Item('webpage');
			}
			else {
				var parent = new Zotero.Item('document');
			}
			parent.libraryID = item.libraryID;
			parent.setField('title', item.getField('title'));
			if (item.isWebAttachment()) {
				parent.setField('accessDate', item.getField('accessDate'));
				parent.setField('url', item.getField('url'));
			}
			let itemID = await parent.save();
			item.parentID = itemID;
			await item.save();
		});
	};
	
	
	this.exportPDF = async function (itemID) {
		let item = await Zotero.Items.getAsync(itemID);
		if (!item || !item.isPDFAttachment()) {
			throw new Error('Item ' + itemID + ' is not a PDF attachment');
		}
		let filename = item.attachmentFilename;
		
		var fp = new FilePicker();
		// TODO: Localize
		fp.init(window, "Export File", fp.modeSave);
		fp.appendFilter("PDF", "*.pdf");
		fp.defaultString = filename;
		
		var rv = await fp.show();
		if (rv === fp.returnOK || rv === fp.returnReplace) {
			let outputFile = fp.file;
			await Zotero.PDFWorker.export(item.id, outputFile, true);
		}
	};
	
	
	// TEMP: Quick implementation
	this.exportSelectedFiles = async function () {
		var items = ZoteroPane.getSelectedItems()
			.reduce((arr, item) => {
				if (item.isPDFAttachment()) {
					return arr.concat([item]);
				}
				if (item.isRegularItem()) {
					return arr.concat(item.getAttachments()
						.map(x => Zotero.Items.get(x))
						.filter(x => x.isPDFAttachment()));
				}
				return arr;
			}, []);
		// Deduplicate, in case parent and child items are both selected
		items = [...new Set(items)];
		
		if (!items.length) return;
		if (items.length == 1) {
			await this.exportPDF(items[0].id);
			return;
		}
		
		var fp = new FilePicker();
		// TODO: Localize
		fp.init(window, "Export Files", fp.modeGetFolder);
		
		var rv = await fp.show();
		if (rv === fp.returnOK || rv === fp.returnReplace) {
			let folder = fp.file;
			for (let item of items) {
				let outputFile = OS.Path.join(folder, item.attachmentFilename);
				if (await OS.File.exists(outputFile)) {
					let newNSIFile = Zotero.File.pathToFile(outputFile);
					newNSIFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o644);
					outputFile = newNSIFile.path;
					newNSIFile.remove(null);
				}
				await Zotero.PDFWorker.export(item.id, outputFile, true);
			}
		}
	};
	
	
	this.renameSelectedAttachmentsFromParents = Zotero.Promise.coroutine(function* () {
		// TEMP: fix
		
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var items = this.getSelectedItems();
		
		for (var i=0; i<items.length; i++) {
			var item = items[i];
			
			if (!item.isAttachment() || item.isTopLevelItem() || item.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
				throw('Item ' + itemID + ' is not a child file attachment in ZoteroPane_Local.renameAttachmentFromParent()');
			}
			
			var file = item.getFile();
			if (!file) {
				continue;
			}
			
			let parentItemID = item.parentItemID;
			let parentItem = yield Zotero.Items.getAsync(parentItemID);
			var newName = Zotero.Attachments.getFileBaseNameFromItem(parentItem);
			
			var ext = file.leafName.match(/\.[^\.]+$/);
			if (ext) {
				newName = newName + ext;
			}
			
			var renamed = yield item.renameAttachmentFile(newName, false, true);
			if (renamed !== true) {
				Zotero.debug("Could not rename file (" + renamed + ")");
				continue;
			}
			
			item.setField('title', newName);
			yield item.saveTx();
		}
		
		return true;
	});
	
	
	this.convertLinkedFilesToStoredFiles = async function () {
		if (!this.canEdit() || !this.canEditFiles()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var items = this.getSelectedItems();
		var attachments = new Set();
		for (let item of items) {
			// Add all child link attachments of regular items
			if (item.isRegularItem()) {
				for (let id of item.getAttachments()) {
					let attachment = await Zotero.Items.getAsync(id);
					if (attachment.isLinkedFileAttachment()) {
						attachments.add(attachment);
					}
				}
			}
			// And all selected link attachments
			else if (item.isLinkedFileAttachment()) {
				attachments.add(item);
			}
		}
		var num = attachments.size;
		
		var ps = Services.prompt;
		var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
			+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
		var deleteOriginal = {};
		var index = ps.confirmEx(null,
			Zotero.getString('attachment.convertToStored.title', [num], num),
			Zotero.getString('attachment.convertToStored.text', [num], num),
			buttonFlags,
			Zotero.getString('general.continue'),
			null,
			null,
			Zotero.getString('attachment.convertToStored.deleteOriginal', [num], num),
			deleteOriginal
		);
		if (index != 0) {
			return;
		}
		for (let item of attachments) {
			try {
				let converted = await Zotero.Attachments.convertLinkedFileToStoredFile(
					item,
					{
						move: deleteOriginal.value
					}
				);
				if (!converted) {
					// Not found
					continue;
				}
			}
			catch (e) {
				Zotero.logError(e);
				continue;
			}
		}
	};
	
	
	this.relinkAttachment = async function (itemID) {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var item = Zotero.Items.get(itemID);
		if (!item) {
			throw new Error('Item ' + itemID + ' not found in ZoteroPane_Local.relinkAttachment()');
		}
		
		while (true) {
			let fp = new FilePicker();
			fp.init(window, Zotero.getString('pane.item.attachments.select'), fp.modeOpen);
			
			var file = item.getFilePath();
			if (!file) {
				Zotero.debug("Invalid path", 2);
				break;
			}
			
			var dir = await Zotero.File.getClosestDirectory(file);
			if (dir) {
				fp.displayDirectory = dir;
			}
			
			fp.appendFilters(fp.filterAll);
			
			if (await fp.show() == fp.returnOK) {
				let file = Zotero.File.pathToFile(fp.file);
				
				// Disallow hidden files
				// TODO: Display a message
				if (file.leafName.startsWith('.')) {
					continue;
				}
				
				// Disallow Windows shortcuts
				if (file.leafName.endsWith(".lnk")) {
					this.displayCannotAddShortcutMessage(file.path);
					continue;
				}
				
				await item.relinkAttachmentFile(file.path);
				break;
			}
			
			break;
		}
	};
	
	
	this.updateReadLabel = function () {
		var items = this.getSelectedItems();
		var isUnread = false;
		for (let item of items) {
			if (!item.isRead) {
				isUnread = true;
				break;
			}
		}
		ZoteroItemPane.setReadLabel(!isUnread);
	};
	
	
	var itemReadPromise;
	this.startItemReadTimeout = function (feedItemID) {
		if (itemReadPromise) {
			itemReadPromise.cancel();
		}
		
		const FEED_READ_TIMEOUT = 1000;
		
		itemReadPromise = Zotero.Promise.delay(FEED_READ_TIMEOUT)
		.then(async function () {
			itemReadPromise = null;
			
			// Check to make sure we're still on the same item
			var items = this.getSelectedItems();
			if (items.length != 1 || items[0].id != feedItemID) {
				return;
			}
			var feedItem = items[0];
			if (!(feedItem instanceof Zotero.FeedItem)) {
				throw new Zotero.Promise.CancellationError('Not a FeedItem');
			}
			if (feedItem.isRead) {
				return;
			}
			
			await feedItem.toggleRead(true);
			ZoteroItemPane.setReadLabel(true);
		}.bind(this))
		.catch(function (e) {
			if (e instanceof Zotero.Promise.CancellationError) {
				Zotero.debug(e.message);
				return;
			}
			Zotero.logError(e);
		});
	}
	
	
	function reportErrors() {
		var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
				   .getService(Components.interfaces.nsIWindowWatcher);
		var data = {
			msg: Zotero.getString('errorReport.followingReportWillBeSubmitted'),
			errorData: Zotero.getErrors(true),
			askForSteps: true
		};
		var io = { wrappedJSObject: { Zotero: Zotero, data:  data } };
		var win = ww.openWindow(null, "chrome://zotero/content/errorReport.xul",
					"zotero-error-report", "chrome,centerscreen,modal", io);
	}
	
	this.displayErrorMessage = function (popup) {
		Zotero.debug("ZoteroPane.displayErrorMessage() is deprecated -- use Zotero.crash() instead");
		Zotero.crash(popup);
	}
	
	this.displayStartupError = function(asPaneMessage) {
		if (Zotero) {
			var errMsg = Zotero.startupError;
			var errFunc = Zotero.startupErrorHandler;
		}
		
		var stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
			.getService(Components.interfaces.nsIStringBundleService);
		var src = 'chrome://zotero/locale/zotero.properties';
		var stringBundle = stringBundleService.createBundle(src);
		
		var title = stringBundle.GetStringFromName('general.error');
		if (!errMsg) {
			var errMsg = stringBundle.GetStringFromName('startupError');
		}
		
		if (errFunc) {
			errFunc();
		}
		else {
			// TODO: Add a better error page/window here with reporting
			// instructions
			// window.loadURI('chrome://zotero/content/error.xul');
			//if(asPaneMessage) {
			//	ZoteroPane_Local.setItemsPaneMessage(errMsg, true);
			//} else {
				Zotero.alert(null, title, errMsg);
			//}
		}
	}
	
	/**
	 * Show a retraction banner if there are retracted items that we haven't warned about
	 */
	this.showRetractionBanner = async function (items) {
		var items;
		try {
			items = JSON.parse(Zotero.Prefs.get('retractions.recentItems'));
		}
		catch (e) {
			Zotero.Prefs.clear('retractions.recentItems');
			Zotero.logError(e);
			return;
		}
		if (!items.length) {
			return;
		}
		items = await Zotero.Items.getAsync(items);
		if (!items.length) {
			return;
		}
		
		document.getElementById('retracted-items-container').removeAttribute('collapsed');
		
		var message = document.getElementById('retracted-items-message');
		var link = document.getElementById('retracted-items-link');
		var close = document.getElementById('retracted-items-close');
		
		var suffix = items.length > 1 ? 'multiple' : 'single';
		message.textContent = Zotero.getString('retraction.alert.' + suffix);
		link.textContent = Zotero.getString('retraction.alert.view.' + suffix);
		link.onclick = async function () {
			this.hideRetractionBanner();
			// Select newly detected item if only one
			if (items.length == 1) {
				await this.selectItem(items[0].id);
			}
			// Otherwise select Retracted Items collection
			else {
				let libraryID = this.getSelectedLibraryID();
				await this.collectionsView.selectByID("R" + libraryID);
			}
		}.bind(this);
		
		close.onclick = function () {
			this.hideRetractionBanner();
		}.bind(this);
	};
	
	
	this.hideRetractionBanner = function () {
		document.getElementById('retracted-items-container').setAttribute('collapsed', true);
		Zotero.Prefs.clear('retractions.recentItems');
	};
	
	
	this.promptToHideRetractionForReplacedItem = function (item) {
		var ps = Services.prompt;
		var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
			+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
		let index = ps.confirmEx(
			null,
			Zotero.getString('retraction.replacedItem.title'),
			Zotero.getString('retraction.replacedItem.text1')
				+ "\n\n"
				+ Zotero.getString('retraction.replacedItem.text2'),
			buttonFlags,
			Zotero.getString('retraction.replacedItem.button'),
			null,
			null,
			null,
			{}
		);
		if (index == 0) {
			Zotero.Retractions.hideRetraction(item);
			this.hideRetractionBanner();
		}
	};
	
	
	/**
	 * Sets the layout to either a three-vertical-pane layout and a layout where itemsPane is above itemPane
	 */
	this.updateLayout = function() {
		var layoutSwitcher = document.getElementById("zotero-layout-switcher");
		var itemsSplitter = document.getElementById("zotero-items-splitter");

		if(Zotero.Prefs.get("layout") === "stacked") { // itemsPane above itemPane
			layoutSwitcher.setAttribute("orient", "vertical");
			itemsSplitter.setAttribute("orient", "vertical");
		} else {  // three-vertical-pane
			layoutSwitcher.setAttribute("orient", "horizontal");
			itemsSplitter.setAttribute("orient", "horizontal");
		}

		this.updateToolbarPosition();
		this.updateTagsBoxSize();
		if (ZoteroPane.itemsView) {
			// Need to immediately rerender the items here without any debouncing
			// since tree height will have changed
			ZoteroPane.itemsView._updateHeight();
		}
		ZoteroContextPane.update();
	}
	
	
	this.getState = function () {
		return {
			type: 'pane',
			tabs: Zotero_Tabs.getState()
		};
	};
	
	/**
	 * Unserializes zotero-persist elements from preferences
	 */
	this.unserializePersist = function () {
		_unserialized = true;
		var serializedValues = Zotero.Prefs.get("pane.persist");
		if(!serializedValues) return;
		serializedValues = JSON.parse(serializedValues);
		
		for (var id in serializedValues) {
			var el = document.getElementById(id);
			if (!el) {
				Zotero.debug(`Trying to restore persist data for #${id} but elem not found`, 5);
				continue;
			}
			
			var elValues = serializedValues[id];
			for(var attr in elValues) {
				// Ignore persisted collapsed state for collection and item pane splitters, since
				// people close them by accident and don't know how to get them back
				// TODO: Add a hidden pref to allow them to stay closed if people really want that?
				if ((el.id == 'zotero-collections-splitter' || el.id == 'zotero-items-splitter')
						&& attr == 'state'
						&& Zotero.Prefs.get('reopenPanesOnRestart')) {
					continue;
				}
				el.setAttribute(attr, elValues[attr]);
			}
		}
		
		if (this.itemsView) {
			// may not yet be initialized
			try {
				this.itemsView.sort();
			} catch(e) {};
		}
	};

	/**
	 * Serializes zotero-persist elements to preferences
	 */
	this.serializePersist = function() {
		if (!_unserialized) return;
		try {
			var serializedValues = JSON.parse(Zotero.Prefs.get('pane.persist'));
		}
		catch (e) {
			serializedValues = {};
		}
		for (let el of document.getElementsByAttribute("zotero-persist", "*")) {
			if (!el.getAttribute) continue;
			var id = el.getAttribute("id");
			if (!id) continue;
			var elValues = {};
			for (let attr of el.getAttribute("zotero-persist").split(/[\s,]+/)) {
				if (el.hasAttribute(attr)) {
					elValues[attr] = el.getAttribute(attr);
				}
			}
			serializedValues[id] = elValues;
		}
		Zotero.Prefs.set("pane.persist", JSON.stringify(serializedValues));
	}
	
	
	this.updateWindow = function () {
		var zoteroPane = document.getElementById('zotero-pane');
		// Must match value in overlay.css
		var breakpoint = 1000;
		var className = `width-${breakpoint}`;
		if (window.innerWidth >= breakpoint) {
			zoteroPane.classList.add(className);
		}
		else {
			zoteroPane.classList.remove(className);
		}
	};
	
	
	/**
	 * Moves around the toolbar when the user moves around the pane
	 */
	this.updateToolbarPosition = function() {
		var paneStack = document.getElementById("zotero-pane-stack");
		if(paneStack.hidden) return;

		var stackedLayout = Zotero.Prefs.get("layout") === "stacked";

		var collectionsPane = document.getElementById("zotero-collections-pane");
		var collectionsToolbar = document.getElementById("zotero-collections-toolbar");
		var collectionsTree = document.querySelector('#zotero-collections-tree .tree');
		var itemsPane = document.getElementById("zotero-items-pane");
		var itemsToolbar = document.getElementById("zotero-items-toolbar");
		var itemPane = document.getElementById("zotero-item-pane");
		var itemToolbar = document.getElementById("zotero-item-toolbar");
		var tagSelector = document.getElementById("zotero-tag-selector");
		
		collectionsToolbar.style.width = collectionsPane.boxObject.width + 'px';
		tagSelector.style.maxWidth = collectionsPane.boxObject.width + 'px';
		if (collectionsTree) {
			let borderSize = Zotero.isMac ? 0 : 2;
			collectionsTree.style.maxWidth = (collectionsPane.boxObject.width - borderSize) + 'px';
		}
		if (ZoteroPane.itemsView) {
			ZoteroPane.itemsView.updateHeight();
		}
		
		if (stackedLayout || itemPane.collapsed) {
		// The itemsToolbar and itemToolbar share the same space, and it seems best to use some flex attribute from right (because there might be other icons appearing or vanishing).
			itemsToolbar.setAttribute("flex", "1");
			itemToolbar.setAttribute("flex", "0");
		} else {
			var itemsToolbarWidth = itemsPane.boxObject.width;

			if (collectionsPane.collapsed) {
				itemsToolbarWidth -= collectionsToolbar.boxObject.width;
			}
			// Not sure why this is necessary, but it keeps the search bar from overflowing into the
			// right-hand pane
			else {
				itemsToolbarWidth -= 8;
			}
			
			itemsToolbar.style.width = itemsToolbarWidth + "px";
			itemsToolbar.setAttribute("flex", "0");
			itemToolbar.setAttribute("flex", "1");
		}
		
		this.handleTagSelectorResize();
	}
	
	/**
	 * Set an explicit height on the tags list to show a scroll bar if necessary
	 *
	 * This really should be be possible via CSS alone, but I couldn't get it to work, either
	 * because I was doing something wrong or because the XUL layout engine was messing with me.
	 * Revisit when we're all HTML.
	 */
	this.updateTagsBoxSize = function () {
		// TODO: We can probably remove this function
		return;
		var pane = document.querySelector('#zotero-item-pane');
		var header = document.querySelector('#zotero-item-pane .tags-box-header');
		var list = document.querySelector('#zotero-item-pane .tags-box-list');
		if (pane && header && list) {
			let height = pane.getBoundingClientRect().height
				- header.getBoundingClientRect().height
				- 35; // a little padding
			list.style.height = height + 'px';
		}
	};
	
	/**
	 * Opens the about dialog
	 */
	this.openAboutDialog = function() {
		window.openDialog('chrome://zotero/content/about.xul', 'about', 'chrome,centerscreen');
	}
	
	/**
	 * Adds or removes a function to be called when Zotero is reloaded by switching into or out of
	 * the connector
	 */
	this.addReloadListener = function(/** @param {Function} **/func) {
		if(_reloadFunctions.indexOf(func) === -1) _reloadFunctions.push(func);
	}
	
	/**
	 * Adds or removes a function to be called just before Zotero is reloaded by switching into or
	 * out of the connector
	 */
	this.addBeforeReloadListener = function(/** @param {Function} **/func) {
		if(_beforeReloadFunctions.indexOf(func) === -1) _beforeReloadFunctions.push(func);
	}
	
	/**
	 * Implements nsIObserver for Zotero reload
	 */
	var _reloadObserver = {	
		/**
		 * Called when Zotero is reloaded (i.e., if it is switched into or out of connector mode)
		 */
		"observe":function(aSubject, aTopic, aData) {
			if(aTopic == "zotero-reloaded") {
				Zotero.debug("Reloading Zotero pane");
				for (let func of _reloadFunctions) func(aData);
			} else if(aTopic == "zotero-before-reload") {
				Zotero.debug("Zotero pane caught before-reload event");
				for (let func of _beforeReloadFunctions) func(aData);
			}
		}
	};
}

/**
 * Keep track of which ZoteroPane was local (since ZoteroPane object might get swapped out for a
 * tab's ZoteroPane)
 */
var ZoteroPane_Local = ZoteroPane;
