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

Zotero.GoogleDocs = Zotero.GoogleDocs || {};

Zotero.GoogleDocs.API = {
	authDeferred: null,
	authHeaders: null,
	lastAuthEmail: null,
	apiVersion: 5,
	
	resetAuth: function() {
		delete this.authHeaders;
		delete this.lastAuthEmail;
	},

	getAuthHeaders: async function() {
		if (Zotero.GoogleDocs.API.authHeaders) {
			return Zotero.GoogleDocs.API.authHeaders;
		}
		
		// For macOS, since popping up an auth window or calling Connector_Browser.bringToFront()
		// doesn't move the progress window to the back
		Zotero.Connector.callMethod('sendToBack');
		
		// Request OAuth2 access token
		let params = {
			client_id: ZOTERO_CONFIG.OAUTH.GOOGLE_DOCS.CLIENT_KEY,
			redirect_uri: ZOTERO_CONFIG.OAUTH.GOOGLE_DOCS.CALLBACK_URL,
			response_type: 'token',
			scope: 'https://www.googleapis.com/auth/documents email',
			state: 'google-docs-auth-callback'
		};
		if (Zotero.GoogleDocs.API.lastAuthEmail) {
			params.login_hint = Zotero.GoogleDocs.API.lastAuthEmail;
		}
		let url = ZOTERO_CONFIG.OAUTH.GOOGLE_DOCS.AUTHORIZE_URL + "?";
		for (let key in params) {
			url += `${key}=${encodeURIComponent(params[key])}&`;
		}
		Zotero.Connector_Browser.openWindow(url, {type: 'normal', onClose: Zotero.GoogleDocs.API.onAuthCancel});
		this.authDeferred = Zotero.Promise.defer();
		return this.authDeferred.promise;
	},
	
	onAuthComplete: async function(URL, tab) {
		// close auth window
		// ensure that tab close listeners don't have a promise they can reject
		let deferred = this.authDeferred;
		this.authDeferred = null;
		if (Zotero.isBrowserExt) {
			browser.tabs.remove(tab.id);
		} else if (Zotero.isSafari) {
			Zotero.Connector_Browser.closeTab(tab);
		}
		try {
			var url = require('url');
			var uri = url.parse(URL);
			var params = {};
			for (let keyvalue of uri.hash.split('&')) {
				let [key, value] = keyvalue.split('=');
				params[key] = decodeURIComponent(value);
			}
			if (params.error) {
				throw new Error(params.error);
			}
			
			uri = ZOTERO_CONFIG.OAUTH.GOOGLE_DOCS.ACCESS_URL
				+ `?access_token=${params.access_token}`;
			let xhr = await Zotero.HTTP.request('GET', uri);
			let response = JSON.parse(xhr.responseText);
			if (response.aud != ZOTERO_CONFIG.OAUTH.GOOGLE_DOCS.CLIENT_KEY) {
				throw new Error(`Google Docs Access Token invalid ${xhr.responseText}`);
			}
			
			this.lastAuthEmail = response.email;
			this.authHeaders = {'Authorization': `Bearer ${params.access_token}`};
			// Request a new token upon expiration
			setTimeout(() => this.authHeaders = null, (parseInt(params.expires_in)-60)*1000);
			response = await this.getAuthHeaders();
			deferred.resolve(response);
			return response;
		} catch (e) {
			return deferred.reject(e);
		}
	},
	
	onAuthCancel: function() {
		let error = new Error('Google Docs authentication was cancelled');
		error.type = "Alert";
		Zotero.GoogleDocs.API.authDeferred
			&& Zotero.GoogleDocs.API.authDeferred.reject(error);
	},
	
	run: async function(docID, method, args, email, tab) {
		// If not an array, discard or the docs script spews errors.
		if (! Array.isArray(args)) {
			args = [];
		}
		var headers = await this.getAuthHeaders(email);
		headers["Content-Type"] = "application/json";
		var body = {
			function: 'callMethod',
			parameters: [docID, method, args, Zotero.GoogleDocs.API.apiVersion],
			devMode: ZOTERO_CONFIG.GOOGLE_DOCS_DEV_MODE
		};
		try {
			var xhr = await Zotero.HTTP.request('POST', ZOTERO_CONFIG.GOOGLE_DOCS_API_URL,
				{headers, body, timeout: null});
		} catch (e) {
			if (e.status >= 400 && e.status < 404) {
				this.resetAuth();
				this.displayWrongAccountPrompt();
				throw new Error('Handled Error');
			} else {
				throw new Error(`${e.status}: Google Docs request failed.\n\n${e.responseText}`);
			}
		}
		var responseJSON = JSON.parse(xhr.responseText);
		
		if (responseJSON.error) {
			// For some reason, sometimes the still valid auth token starts being rejected
			if (responseJSON.error.details[0].errorMessage == "Authorization is required to perform that action.") {
				this.resetAuth();
				return this.run(docID, method, args);
			}
			var err = new Error(responseJSON.error.details[0].errorMessage);
			err.stack = responseJSON.error.details[0].scriptStackTraceElements;
			err.type = `Google Docs ${responseJSON.error.message}`;
			throw err;
		}
		
		let resp = await this.handleResponseErrors(responseJSON, arguments, tab);
		if (resp) {
			return resp;
		}
		var response = responseJSON.response.result && responseJSON.response.result.response;
		if (responseJSON.response.result.debug) {
			Zotero.debug(`Google Docs debug:\n\n${responseJSON.response.result.debug.join('\n\n')}`);
		}
		return response;
	},
	
	handleResponseErrors: async function(responseJSON, args, tab) {
		var lockError = responseJSON.response.result.lockError;
		if (lockError) {
			if (await this.displayLockErrorPrompt(lockError, tab)) {
				await this.run(args[0], "unlockTheDoc", [], args[3]);
				return this.run.apply(this, args);
			} else {
				throw new Error('Handled Error');
			}
		}
		var docAccessError = responseJSON.response.result.docAccessError;
		if (docAccessError) {
			this.resetAuth();
			this.displayWrongAccountPrompt();
			throw new Error('Handled Error');
		}
		var genericError = responseJSON.response.result.error;
		if (genericError) {
			Zotero.logError(new Error(`Non-fatal Google Docs Error: ${genericError}`));
		}
	},

	displayLockErrorPrompt: async function(error, tab) {
		var message = Zotero.getString('integration_googleDocs_documentLocked', ZOTERO_CONFIG.CLIENT_NAME);
		var result = await Zotero.Messaging.sendMessage('confirm', {
			title: ZOTERO_CONFIG.CLIENT_NAME,
			button2Text: "",
			button3Text: Zotero.getString('general_needHelp'),
			message
		}, tab);
		if (result.button != 3) return;

		message = Zotero.getString('integration_googleDocs_documentLocked_moreInfo', ZOTERO_CONFIG.CLIENT_NAME);
		
		var result = await Zotero.Messaging.sendMessage('confirm', {
			title: ZOTERO_CONFIG.CLIENT_NAME,
			button1Text: Zotero.getString('general_yes'),
			button2Text: Zotero.getString('general_no'),
			message
		}, tab);
		return result.button == 1;
	},
	
	displayWrongAccountPrompt: async function(error, tab) {
		var message = Zotero.getString('integration_googleDocs_documentPermissionError', ZOTERO_CONFIG.CLIENT_NAME);
		var result = await Zotero.Messaging.sendMessage('confirm', {
			title: ZOTERO_CONFIG.CLIENT_NAME,
			button2Text: "",
			button3Text: Zotero.getString('general_moreInfo'),
			message
		}, tab);
		if (result.button != 3) return;
		Zotero.Connector_Browser.openTab('https://www.zotero.org/support/google_docs#authentication');
	},

	getDocument: async function (docId) {
		var headers = await this.getAuthHeaders();
		try {
			var xhr = await Zotero.HTTP.request('GET', `https://docs.googleapis.com/v1/documents/${docId}`,
				{headers, timeout: 60000});
		} catch (e) {
			if (e.status == 403) {
					this.resetAuth();
					throw new Error(`${e.status}: Google Docs Authorization failed. Try again.\n${e.responseText}`);
				} else {
					throw new Error(`${e.status}: Google Docs request failed.\n\n${e.responseText}`);
				}
		}

		return JSON.parse(xhr.responseText);
	},

	batchUpdateDocument: async function (docId, body) {
		var headers = await this.getAuthHeaders();
		try {
			var xhr = await Zotero.HTTP.request('POST', `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
				{headers, body, timeout: 60000});
		} catch (e) {
			if (e.status == 403) {
				this.resetAuth();
				throw new Error(`${e.status}: Google Docs Authorization failed. Try again.\n${e.responseText}`);
			} else {
				throw new Error(`${e.status}: Google Docs request failed.\n\n${e.responseText}`);
			}
		}

		return JSON.parse(xhr.responseText);
	}
};

Zotero.GoogleDocs_API = Zotero.GoogleDocs.API;
