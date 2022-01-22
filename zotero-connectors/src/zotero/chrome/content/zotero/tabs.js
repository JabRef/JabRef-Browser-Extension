/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2020 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://www.zotero.org
    
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

'use strict';

// Using 'import' breaks hooks
var React = require('react');
var ReactDOM = require('react-dom');
import TabBar from 'components/tabBar';

var Zotero_Tabs = new function () {
	Object.defineProperty(this, 'selectedID', {
		get: () => this._selectedID
	});

	Object.defineProperty(this, 'selectedIndex', {
		get: () => this._getTab(this._selectedID).tabIndex
	});

	Object.defineProperty(this, 'deck', {
		get: () => document.getElementById('tabs-deck')
	});

	this._tabBarRef = React.createRef();
	this._tabs = [{
		id: 'zotero-pane',
		type: 'library',
		title: ''
	}];
	this._selectedID = 'zotero-pane';
	this._prevSelectedID = null;
	this._history = [];

	this._getTab = function (id) {
		var tabIndex = this._tabs.findIndex(tab => tab.id == id);
		return { tab: this._tabs[tabIndex], tabIndex };
	};

	this._update = function () {
		this._tabBarRef.current.setTabs(this._tabs.map(tab => ({
			id: tab.id,
			type: tab.type,
			title: tab.title,
			selected: tab.id == this._selectedID
		})));
		var { tab } = this._getTab(this._selectedID);
		document.title = (tab.title.length ? tab.title + ' - ' : '') + 'Zotero';
		this._updateTabBar();
		// Hide any tab `title` tooltips that might be open
		window.Zotero_Tooltip.stop();
	};

	this.init = function () {
		ReactDOM.render(
			<TabBar
				ref={this._tabBarRef}
				onTabSelect={this.select.bind(this)}
				onTabMove={this.move.bind(this)}
				onTabClose={this.close.bind(this)}
				onContextMenu={this._openMenu.bind(this)}
			/>,
			document.getElementById('tab-bar-container'),
			() => {
				this._update();
			}
		);
	};

	this.getState = function () {
		return this._tabs.map((tab) => {
			var o = {
				type: tab.type,
				title: tab.title,
			};
			if (tab.data) {
				o.data = tab.data;
			}
			if (tab.id == this._selectedID) {
				o.selected = true;
			}
			return o;
		});
	};
	
	this.restoreState = function(tabs) {
		for (let tab of tabs) {
			if (tab.type === 'library') {
				this.rename('zotero-pane', tab.title);
			}
			else if (tab.type === 'reader') {
				if (Zotero.Items.exists(tab.data.itemID)) {
					Zotero.Reader.open(tab.data.itemID,
						null,
						{
							title: tab.title,
							openInBackground: !tab.selected
						}
					);
				}
			}
		}
	};
	
	/**
	 * Add a new tab
	 *
	 * @param {String} type
	 * @param {String} title
	 * @param {String} data - Extra data about the tab to pass to notifier and session
	 * @param {Integer} index
	 * @param {Boolean} select
	 * @param {Function} onClose
	 * @return {{ id: string, container: XULElement}} id - tab id, container - a new tab container created in the deck
	 */
	this.add = function ({ type, data, title, index, select, onClose }) {
		if (typeof type != 'string') {
			throw new Error(`'type' should be a string (was ${typeof type})`);
		}
		if (typeof title != 'string') {
			throw new Error(`'title' should be a string (was ${typeof title})`);
		}
		if (index !== undefined && (!Number.isInteger(index) || index < 1)) {
			throw new Error(`'index' should be an integer > 0 (was ${index} (${typeof index})`);
		}
		if (onClose !== undefined && typeof onClose != 'function') {
			throw new Error(`'onClose' should be a function (was ${typeof onClose})`);
		}
		var id = 'tab-' + Zotero.Utilities.randomString();
		var container = document.createElement('vbox');
		container.id = id;
		this.deck.appendChild(container);
		var tab = { id, type, title, data, onClose };
		index = index || this._tabs.length;
		this._tabs.splice(index, 0, tab);
		this._update();
		Zotero.Notifier.trigger('add', 'tab', [id], { [id]: data }, true);
		if (select) {
			let previousID = this._selectedID;
			this.select(id);
			this._prevSelectedID = previousID;
		}
		return { id, container };
	};

	/**
	 * Set a new tab title
	 *
	 * @param {String} id
	 * @param {String} title
	 */
	this.rename = function (id, title) {
		if (typeof title != 'string') {
			throw new Error(`'title' should be a string (was ${typeof title})`);
		}
		var { tab } = this._getTab(id);
		if (!tab) {
			return;
		}
		tab.title = title;
		this._update();
	};

	/**
	 * Close tabs
	 *
	 * @param {String|Array<String>|undefined} ids One or more ids, or empty for the current tab
	 */
	this.close = function (ids) {
		if (!ids) {
			ids = [this._selectedID];
		}
		else if (!Array.isArray(ids)) {
			ids = [ids];
		}
		if (ids.includes('zotero-pane')) {
			throw new Error('Library tab cannot be closed');
		}
		var historyEntry = [];
		var closedIDs = [];
		var tmpTabs = this._tabs.slice();
		for (var id of ids) {
			var { tab, tabIndex } = this._getTab(id);
			if (!tab) {
				continue;
			}
			if (tab.id == this._selectedID) {
				this.select(this._prevSelectedID || (this._tabs[tabIndex + 1] || this._tabs[tabIndex - 1]).id);
			}
			if (tab.id == this._prevSelectedID) {
				this._prevSelectedID = null;
			}
			this._tabs.splice(tabIndex, 1);
			document.getElementById(tab.id).remove();
			if (tab.onClose) {
				tab.onClose();
			}
			historyEntry.push({ index: tmpTabs.indexOf(tab), data: tab.data });
			closedIDs.push(id);
		}
		this._history.push(historyEntry);
		Zotero.Notifier.trigger('close', 'tab', [closedIDs]);
		this._update();
	};

	/**
	 * Close all tabs except the first one
	 */
	this.closeAll = function () {
		this.close(this._tabs.slice(1).map(x => x.id));
	};
	
	/**
	 * Undo tabs closing
	 */
	this.undoClose = function () {
		var historyEntry = this._history.pop();
		if (historyEntry) {
			let maxIndex = -1;
			for (let tab of historyEntry) {
				if (Zotero.Items.exists(tab.data.itemID)) {
					Zotero.Reader.open(tab.data.itemID,
						null,
						{
							tabIndex: tab.index,
							openInBackground: true
						}
					);
					if (tab.index > maxIndex) {
						maxIndex = tab.index;
					}
				}
			}
			// Select last reopened tab
			if (maxIndex > -1) {
				this.jump(maxIndex);
			}
		}
	};

	/**
	 * Move a tab to the specified index
	 *
	 * @param {String} id
	 * @param {Integer} newIndex
	 */
	this.move = function (id, newIndex) {
		if (!Number.isInteger(newIndex) || newIndex < 1) {
			throw new Error(`'newIndex' should be an interger > 0 (was ${newIndex} (${typeof newIndex})`);
		}
		var { tab, tabIndex } = this._getTab(id);
		if (tabIndex == 0) {
			throw new Error('Library tab cannot be moved');
		}
		if (!tab || tabIndex == newIndex) {
			return;
		}
		if (newIndex > tabIndex) {
			newIndex--;
		}
		this._tabs.splice(tabIndex, 1);
		this._tabs.splice(newIndex, 0, tab);
		this._update();
	};

	/**
	 * Select a tab
	 *
	 * @param {String} id
	 * @param {Boolean} reopening
	 */
	this.select = function (id, reopening) {
		var { tab } = this._getTab(id);
		if (!tab || tab.id === this._selectedID) {
			return;
		}
		if (this._selectedID === 'zotero-pane') {
			var { tab: selectedTab } = this._getTab(this._selectedID);
			selectedTab.lastFocusedElement = document.activeElement;
		}
		this._prevSelectedID = reopening ? this._selectedID : null;
		this._selectedID = id;
		this.deck.selectedIndex = Array.from(this.deck.children).findIndex(x => x.id == id);
		this._update();
		Zotero.Notifier.trigger('select', 'tab', [tab.id], { [tab.id]: { type: tab.type } }, true);
		if (tab.id === 'zotero-pane' && tab.lastFocusedElement) {
			tab.lastFocusedElement.focus();
			if (document.activeElement !== tab.lastFocusedElement) {
				ZoteroPane_Local.itemsView.focus();
			}
			tab.lastFocusedElement = null;
		}
	};

	/**
	 * Select the previous tab (closer to the library tab)
	 */
	this.selectPrev = function () {
		var { tabIndex } = this._getTab(this._selectedID);
		this.select((this._tabs[tabIndex - 1] || this._tabs[this._tabs.length - 1]).id);
	};

	/**
	 * Select the next tab (farther to the library tab)
	 */
	this.selectNext = function () {
		var { tabIndex } = this._getTab(this._selectedID);
		this.select((this._tabs[tabIndex + 1] || this._tabs[0]).id);
	};
	
	/**
	 * Select the last tab
	 */
	this.selectLast = function () {
		this.select(this._tabs[this._tabs.length - 1].id);
	};
	
	/**
	 * Jump to the tab at a particular index. If the index points beyond the array, jump to the last
	 * tab.
	 *
	 * @param {Integer} index
	 */
	this.jump = function (index) {
		this.select(this._tabs[Math.min(index, this._tabs.length - 1)].id);
	};

	this._openMenu = function (x, y, id) {
		var { tabIndex } = this._getTab(id);
		window.Zotero_Tooltip.stop();
		let menuitem;
		let popup = document.createElement('menupopup');
		document.querySelector('popupset').appendChild(popup);
		popup.addEventListener('popuphidden', function (event) {
			if (event.target === popup) {
				popup.remove();
			}
		});
		if (id !== 'zotero-pane') {
			// Show in library
			menuitem = document.createElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('general.showInLibrary'));
			menuitem.addEventListener('command', () => {
				var reader = Zotero.Reader.getByTabID(id);
				if (reader) {
					let itemID = reader.itemID;
					let item = Zotero.Items.get(itemID);
					if (item && item.parentItemID) {
						itemID = item.parentItemID;
					}
					ZoteroPane_Local.selectItem(itemID);
					this.select('zotero-pane');
				}
			});
			popup.appendChild(menuitem);
			// Move tab
			let menu = document.createElement('menu');
			menu.setAttribute('label', Zotero.getString('tabs.move'));
			let menupopup = document.createElement('menupopup');
			menu.append(menupopup);
			popup.appendChild(menu);
			// Move to start
			menuitem = document.createElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.moveToStart'));
			menuitem.setAttribute('disabled', tabIndex == 1);
			menuitem.addEventListener('command', () => {
				this.move(id, 1);
			});
			menupopup.appendChild(menuitem);
			// Move to end
			menuitem = document.createElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.moveToEnd'));
			menuitem.setAttribute('disabled', tabIndex == this._tabs.length - 1);
			menuitem.addEventListener('command', () => {
				this.move(id, this._tabs.length);
			});
			menupopup.appendChild(menuitem);
			// Move to new window
			menuitem = document.createElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.moveToWindow'));
			menuitem.setAttribute('disabled', false);
			menuitem.addEventListener('command', () => {
				var reader = Zotero.Reader.getByTabID(id);
				if (reader) {
					this.close(id);
					Zotero.Reader.open(reader.itemID, null, { openInWindow: true });
				}
			});
			menupopup.appendChild(menuitem);
			// Separator
			popup.appendChild(document.createElement('menuseparator'));
		}
		// Close
		if (id != 'zotero-pane') {
			menuitem = document.createElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('general.close'));
			menuitem.addEventListener('command', () => {
				this.close(id);
			});
			popup.appendChild(menuitem);
		}
		// Close other tabs
		if (!(this._tabs.length == 2 && id != 'zotero-pane')) {
			menuitem = document.createElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.closeOther'));
			menuitem.addEventListener('command', () => {
				this.close(this._tabs.slice(1).filter(x => x.id != id).map(x => x.id));
			});
			popup.appendChild(menuitem);
		}
		// Undo close
		menuitem = document.createElement('menuitem');
		menuitem.setAttribute(
			'label',
			Zotero.getString(
				'tabs.undoClose',
				[],
				// If not disabled, show proper plural for tabs to reopen
				this._history.length ? this._history[this._history.length - 1].length : 1
			)
		);
		menuitem.setAttribute('disabled', !this._history.length);
		menuitem.addEventListener('command', () => {
			this.undoClose();
		});
		popup.appendChild(menuitem);
		popup.openPopupAtScreen(x, y, true);
	};

	/**
	 * Update state of the tab bar.
	 * Only used on Windows and Linux. On macOS, the tab bar is always shown.
	 */
	this._updateTabBar = function () {
		if (Zotero.isMac) {
			return;
		}
		if (this._tabs.length == 1) {
			this._hideTabBar();
		}
		else {
			this._showTabBar();
		}
	};
	
	/**
	 * Show the tab bar.
	 * Only used on Windows and Linux. On macOS, the tab bar is always shown.
	 */
	this._showTabBar = function () {
		if (Zotero.isMac) {
			return;
		}
		document.getElementById('titlebar').hidden = false;
		document.getElementById('tab-bar-container').hidden = false;
		document.getElementById('main-window').removeAttribute('legacytoolbar');
	};
	
	/**
	 * Hide the tab bar.
	 * Only used on Windows and Linux. On macOS, the tab bar is always shown.
	 */
	this._hideTabBar = function () {
		if (Zotero.isMac) {
			return;
		}
		document.getElementById('titlebar').hidden = true;
		document.getElementById('tab-bar-container').hidden = true;
		document.getElementById('main-window').setAttribute('legacytoolbar', 'true');
	};
};
