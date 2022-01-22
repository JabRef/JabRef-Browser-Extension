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


/**
 * Singleton to handle loading and caching of translators
 * This is a virtual class for reference implementation purposes
 * A consumer of the translation code should implement these functions
 */
Zotero.Translators = new function() {
	// Should be populated on this.init()
	this._cache = {"import":[], "export":[], "web":[], "search":[]};
	// Should set to true after translators are loaded into memory
	this._initialized = false;
	
	/**
	 * Gets the translator that corresponds to a given ID with code set
	 * @param {String} id The ID of the translator
	 */
	this.get = function (id) {
		throw new Error(`Zotero.Translators.get(): not implemented`);
	};

	/**
	 * Gets the translator code that corresponds to a given ID
	 * This function is only necessary if translators are not loaded with
	 * code already during init(). If retrieving from repo you may want to
	 * cache updated translator info if metadata.lastUpdated > localTranslator.lastUpdated
	 * 
	 * NOTE: This function should use the Zotero.Promise.method wrapper which adds a
	 * isResolved property to the returned promise for noWait translation.
	 *
	 * @param {Zotero.Translator} translator
	 * @return {String} translator code
	 */
	this.getCodeForTranslator = Zotero.Promise.method(async function (translator) {
		throw new Error(`Zotero.Translators.getCodeForTranslator(): not implemented`);
	});

	/**
	 * Gets all translators for a specific type of translation
	 * @param {String} type The type of translators to get (import, export, web, or search)
	 */
	this.getAllForType = async function (type) {
		throw new Error(`Zotero.Translators.getAllForType(): not implemented`);
	};

	/**
	 * Gets web translators for a specific location
	 *
	 * @param {String} URI The URI where translation will run
	 * @param {String} rootURI The root URI of the page of translation if URI is a frame location
	 * @return {Promise<Array[]>} - A promise for a 2-item array containing an array of translators and
	 *     an array of functions for converting URLs from proper to proxied forms
	 */
	this.getWebTranslatorsForLocation = async function (URI, rootURI) {
		var isFrame = URI !== rootURI;
		if (!this._initialized) {
			if (this.init) {
				await this.init();
			}
			else {
				throw new Error('Zotero.Translators.getWebTranslatorsForLocation(): Zotero.Translators is not not initialized');
			}
		}
		var allTranslators = this._cache["web"];
		var potentialTranslators = [];
		var proxies = [];
		
		var rootSearchURIs = Zotero.Proxies.getPotentialProxies(rootURI);
		var frameSearchURIs = isFrame ? Zotero.Proxies.getPotentialProxies(URI) : rootSearchURIs;

		Zotero.debug("Translators: Looking for translators for "+Object.keys(frameSearchURIs).join(', '));

		for(var i=0; i<allTranslators.length; i++) {
			var translator = allTranslators[i];
			if (isFrame && !translator.webRegexp.all) {
				continue;
			}
			rootURIsLoop:
			for(var rootSearchURI in rootSearchURIs) {
				var isGeneric = !allTranslators[i].webRegexp.root;
				// don't attempt to use generic translators that can't be run in this browser
				// since that would require transmitting every page to Zotero host
				if(isGeneric && allTranslators[i].runMode !== Zotero.Translator.RUN_MODE_IN_BROWSER) {
					continue;
				}

				var rootURIMatches = isGeneric || rootSearchURI.length < 8192 && translator.webRegexp.root.test(rootSearchURI);
				if (translator.webRegexp.all && rootURIMatches) {
					for (var frameSearchURI in frameSearchURIs) {
						var frameURIMatches = frameSearchURI.length < 8192 && translator.webRegexp.all.test(frameSearchURI);
							
						if (frameURIMatches) {
							potentialTranslators.push(translator);
							proxies.push(frameSearchURIs[frameSearchURI]);
							// prevent adding the translator multiple times
							break rootURIsLoop;
						}
					}
				} else if(!isFrame && (isGeneric || rootURIMatches)) {
					potentialTranslators.push(translator);
					proxies.push(rootSearchURIs[rootSearchURI]);
					break;
				}
			}
		}

		let codeGetter = new Zotero.Translators.CodeGetter(potentialTranslators);
		await codeGetter.getAll();
		return [potentialTranslators, proxies];
	};
};


/**
 * A class to get the code for a set of translators at once
 *
 * @param {Zotero.Translator[]} translators Translators for which to retrieve code
 */
Zotero.Translators.CodeGetter = function(translators) {
	this._translators = translators;
	this._concurrency = 2;
};

Zotero.Translators.CodeGetter.prototype.getCodeFor = async function(i) {
	let translator = this._translators[i];
	try {
		translator.code = await Zotero.Translators.getCodeForTranslator(translator);
	} catch (e) {
		Zotero.debug(`Failed to retrieve code for ${translator.translatorID}`)
	}
	return translator.code;
};

Zotero.Translators.CodeGetter.prototype.getAll = async function () {
	let codes = [];
	// Chain promises with some level of concurrency. If unchained, fires 
	// off hundreds of xhttprequests on connectors and crashes the extension
	for (let i = 0; i < this._translators.length; i++) {
		if (i < this._concurrency) {
			codes.push(this.getCodeFor(i));
		} else {
			codes.push(codes[i-this._concurrency].then(() => this.getCodeFor(i)));
		}
	}
	return Promise.all(codes);
};

if (typeof process === 'object' && process + '' === '[object process]'){
	module.exports = Zotero.Translators;
}
