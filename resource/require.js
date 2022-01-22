'use strict';

var require = (function() {
	var win, cons, Zotero;
	Components.utils.import('resource://zotero/loader.jsm');
	var requirer = Module('/', '/');
	var _runningTimers = {};
	if (typeof window != 'undefined') {
		win = window;
	} else {
		win = {};

		win.setTimeout = function (func, ms) {
			var id = Math.floor(Math.random() * (1000000000000 - 1)) + 1
			var useMethodjit = Components.utils.methodjit;
			var timer = Components.classes["@mozilla.org/timer;1"]
				.createInstance(Components.interfaces.nsITimer);
			timer.initWithCallback({"notify":function() {
				// Remove timer from object so it can be garbage collected
				delete _runningTimers[id];
				
				// Execute callback function
				try {
					func();
				} catch(err) {
					// Rethrow errors that occur so that they appear in the error
					// console with the appropriate name and line numbers. While the
					// the errors appear without this, the line numbers get eaten.
					var scriptError = Components.classes["@mozilla.org/scripterror;1"]
						.createInstance(Components.interfaces.nsIScriptError);
					scriptError.init(
						err.message || err.toString(),
						err.fileName || err.filename || null,
						null,
						err.lineNumber || null,
						null,
						scriptError.errorFlag,
						'component javascript'
					);
					Components.classes["@mozilla.org/consoleservice;1"]
						.getService(Components.interfaces.nsIConsoleService)
						.logMessage(scriptError);
					typeof Zotero !== 'undefined' && Zotero.debug(err.stack, 1);
				}
			}}, ms, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
			_runningTimers[id] = timer;
			return id;
		};
		
		win.clearTimeout = function (id) {
			var timer = _runningTimers[id];
			if (timer) {
				timer.cancel();
			}
			delete _runningTimers[id];
		};

		win.debug = function (msg) {
			dump(msg + "\n\n");
		};
	}
	
	function getZotero() {
		if (win.Zotero) Zotero = win.Zotero;
		
		if (typeof Zotero === 'undefined') {
			try {
				Zotero = Components.classes["@zotero.org/Zotero;1"]
					.getService(Components.interfaces.nsISupports).wrappedJSObject;
			} catch (e) {}
		}
		return Zotero || {};
	}

	if (typeof win.console !== 'undefined') {
		cons = console;
	}
	if (!cons) {
		cons = {};
		for (let key of ['log', 'warn', 'error']) {
			cons[key] = text => {getZotero(); typeof Zotero !== 'undefined' && false && Zotero.debug(`console.${key}: ${text}`)};
		}
	}
	if (!win.console) {
		win.console = cons;
	}
	let globals = {
		window: win,
		document: typeof win.document !== 'undefined' && win.document || {},
		console: cons,
		navigator: typeof win.navigator !== 'undefined' && win.navigator || {},
		setTimeout: win.setTimeout,
		clearTimeout: win.clearTimeout,
		requestAnimationFrame: win.setTimeout,
		cancelAnimationFrame: win.clearTimeout,
		TextEncoder: TextEncoder,
		TextDecoder: TextDecoder,
	};
	Object.defineProperty(globals, 'Zotero', { get: getZotero });
	var loader = Loader({
		id: 'zotero/require',
		paths: {
			'': 'resource://zotero/',
			'containers/': 'chrome://zotero/content/containers/',
			'components/': 'chrome://zotero/content/components/',
			'zotero/': 'chrome://zotero/content/',
			// TEMP until plugins updated
			// TODO: Possible to show a deprecation warning?
			'zotero/filePicker': 'chrome://zotero/content/modules/filePicker',
		},
		globals
	});
	let require = Require(loader, requirer);
	return require;
})();
