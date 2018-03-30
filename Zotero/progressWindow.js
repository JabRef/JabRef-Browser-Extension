/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
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

Zotero.ProgressWindow = new function() {

	/**
	 * Creates a new object representing a line in the progressWindow.
	 */
	this.ItemProgress = function(iconSrc, title, parentItemProgress) {

	};

	/**
	 * Sets the current save progress for this item.
	 * @param {Integer} percent A percentage from 0 to 100.
	 */
	this.ItemProgress.prototype.setProgress = function(percent) {

	};

	/**
	 * Sets the icon for this item.
	 */
	this.ItemProgress.prototype.setIcon = function(iconSrc) {

	};

	/**
	 * Indicates that an error occurred saving this item.
	 */
	this.ItemProgress.prototype.setError = function() {

	};

	this.ErrorMessage = function(err) {

	};

	/**
	 * Initializes and shows the progress div
	 */
	this.show = function() {

	}

	/**
	 * Changes the headline of the save window
	 */
	this.changeHeadline = function(text, icon, postText) {

	}

	/**
	 * Starts the timer to close the progress div
	 */
	this.startCloseTimer = function(delay) {

	}

	/**
	 * Closes the progress div
	 */
	this.close = function() {

	}
}
