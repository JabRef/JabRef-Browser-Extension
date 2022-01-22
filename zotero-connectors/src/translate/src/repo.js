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

Zotero.Repo = new function() {
	var _nextCheck;
	var _timeoutID;
	this.infoRe = /^\s*{[\S\s]*?}\s*?[\r\n]/;
	
	/**
	 * Get translator code from repository
	 * 
	 * @param {String} translatorID ID of the translator to retrieve code for
	 * @returns {Promise<String>} full translator code
	 */
	this.getTranslatorCode = async function (translatorID) {
		let code;
		try {
			let url = `${ZOTERO_CONFIG.REPOSITORY_URL}code/${translatorID}?version=${Zotero.version}`;
			let xmlhttp = await Zotero.HTTP.request("GET", url);
			code = xmlhttp.responseText;
		}
		catch (e) {
			throw new Error("Repo: Code could not be retrieved for " + translatorID + "\n" + e.message);
		}
		
		var m = this.infoRe.exec(code);
		if (!m) {
			throw new Error("Repo: Invalid or missing translator metadata JSON object for " + translatorID);
		}
		try {
			JSON.parse(m[0]);
		} catch(e) {
			throw new Error("Repo: Invalid or missing translator metadata JSON object for " + translatorID);
		}

		return code;
	};

	/**
	 * Retrieves all translator metadata. The parameter is a timestamp since the
	 * last retrieval, in which case only metadata for changed translators is
	 * returned.
	 * 
	 * @param since {Number} timestamp in seconds
	 * @returns {Promise<Object>}
	 */
	this.getAllTranslatorMetadata = async (since=0) => {
		var url = ZOTERO_CONFIG.REPOSITORY_URL + "metadata?version=" + Zotero.version + "&last="+ since;

		try {
			let xmlhttp = await Zotero.HTTP.request('GET', url);
			return JSON.parse(xmlhttp.responseText);
		}
		catch (e) {
			throw new Error("Repo: Failed to retrieve all translator metadata\n" + e.message);
		}
	};
}