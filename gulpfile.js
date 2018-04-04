'use strict';

var gulp = require('gulp');
const through = require('through2');
const plumber = require('gulp-plumber');
const path = require('path');
var rename = require("gulp-rename");
var beautify = require('gulp-jsbeautify');
const babel = require('babel-core');

var injectInclude = [
	'Zotero/zotero_config.js',
	'Zotero/zotero.js',
	'Zotero/promise.js',
	'Zotero/http.js',
	'Zotero/proxy.js',
	'Zotero/cachedTypes.js',
	'Zotero/date.js',
	'Zotero/debug.js',
	'Zotero/openurl.js',
	'Zotero/xregexp-all.js',
	'Zotero/unicode-zotero.js',
	// rdf
	'Zotero/translate.js',
	'Zotero/translator.js',
	'Zotero/translate_item.js',
	'Zotero/connectorTypeSchemaData.js',
	'Zotero/utilities.js',
	'Zotero/utilities_translate.js',
	'Zotero/utilities-common.js',
	'Zotero/http_inject.js',
	'Zotero/progressWindow.js',
	'Zotero/translate_inject.js',
	'Zotero/messages.js',
	'Zotero/messaging_inject.js',
	'Zotero/inject.js'
];

function processJSX(file) {
	try {
		file.contents = new Buffer(babel.transform(file.contents, {
			plugins: ['transform-react-jsx']
		}).code);
	} catch (e) {
		console.log(e.message);
		return;
	}
}

function postProcessContents(basename, file) {
	switch (basename) {
		case 'background.js':
			file.contents = Buffer.from(file.contents.toString()
				// Specify correct injection scripts
				.replace("/*INJECT SCRIPTS*/",
					injectInclude.map((s) => `"${s}"`).join(',\n\t\t'))
				.replace("_updateExtensionUI(tab);", "//_updateExtensionUI(tab);")
				.replace("_enableForTab(tab.id);", "//_enableForTab(tab.id);")
				.replace("catch(() => undefined)", `catch((e) => console.log("Error while loading % s: % o ", script, e))`)
				// Uncomment message listener, because we take care of them ourself
				.replace("browser.browserAction.onClicked.addListener(logListenerErrors",
					'/*\n\tbrowser.browserAction.onClicked.addListener(logListenerErrors')
				.replace("}\r\n\r\nZotero.initGlobal();",
					'\t*/\n}\r\n\r\n//Zotero.initGlobal();')
			);
			break;
		case 'zotero.js':
			file.contents = Buffer.from(file.contents.toString()
				// Use correct zotero version
				.replace("browser.runtime.getManifest().version", `"5.0.0"`)
			);
			break;
		case 'proxy.js':
			file.contents = Buffer.from(file.contents.toString()
				// Remove require statement
				.replace("var url = require('url');", '')
			);
			break;
		case 'messaging.js':
			file.contents = Buffer.from(file.contents.toString()
				// Fix 'undefined' error
				.replace("if (messageConfig && messageConfig.background)", 'if (messageConfig && messageConfig.background && messageConfig.background.minArgs)')
				// Add log statement
				.replace('//Zotero.debug("Messaging: Received message: "+messageName);', 'console.log("Messaging: Received message: %s, %s", messageName, args);')
			);
			break;
		case 'translate.js':
			file.contents = Buffer.from(file.contents.toString()
				// Never report translation errors to Zotero
				.replace("var reportTranslationFailure = await promise;", 'var reportTranslationFailure = false;')
				// Make it possible to call exporter
				.replace("this._sandboxManager.eval(\r\n", 'if (this._entryFunctionSuffix == "Web") { \r\n this._sandboxManager.eval(\r\n')
				.replace('this._translatorInfo = this._sandboxManager.sandbox.ZOTERO_TRANSLATOR_INFO;',
					'} else {\
						this._sandboxManager.eval(\
						"var exports = {}, ZOTERO_TRANSLATOR_INFO = " + code, [\
							"do" + this._entryFunctionSuffix,\
							"exports",\
							"ZOTERO_TRANSLATOR_INFO"\
						],\
						(translator.file ? translator.file.path : translator.label)\
						);\
					}\
					this._translatorInfo = this._sandboxManager.sandbox.ZOTERO_TRANSLATOR_INFO;')
				// BibTeX exporter is no legacy exporter, so we don't need this check
				.replace("this._itemGetter.legacy = Services.vc.compare('4.0.27', this._translatorInfo.minVersion) > 0;", "this._itemGetter.legacy = false;")
				// Make parsing of translator wait for injected code
				.replace("var parse = function", "var parse = async function")
				.replace("this._sandboxManager.eval", "await this._sandboxManager.eval")
			);
			break;
		case 'translate_inject.js':
			file.contents = Buffer.from(file.contents.toString()
				// Use a global sandbox (because the translator code will be injected as a content script and thus 'this' does not work)
				.replace(
					'***** END LICENSE BLOCK *****\
					*/',
					'***** END LICENSE BLOCK *****\
					*/\
					\
					var GlobalSandbox;\
					')
				.replace(
					'delete this.sandbox[functions[i]];\
					}\
					',
					'delete this.sandbox[functions[i]];\
					}\
					\
					// Send global sandbox temporarily to this sandbox\
					GlobalSandbox = this.sandbox;\
					')
				.replace('this.sandbox.', 'GlobalSandbox.')
				// Eval script using tabs.contentScript instead of eval()
				.replace(
					'(function() {\
						eval(code);\
						}).call(this);',
					'var codeClosure = "(function() {" + code + "})();";\
					return browser.runtime.sendMessage({\
						"eval": codeClosure\
					});')
			);
			break;
		case 'errors_webkit.js':
			file.contents = Buffer.from(file.contents.toString()
				// Remove access to Zotero.Debug
				.replace("Zotero.Debug.bgInit = Zotero.Debug.init;", '')
			);
			break;
		case 'inject.js':
			file.contents = Buffer.from(file.contents.toString()
				// We don't want to show a select dialog -> always choose all items
				.replace('Zotero.Connector_Browser.onSelect(items).then(function(returnItems) {\
							// if no items selected, close save dialog immediately\
							if (!returnItems || Zotero.Utilities.isEmpty(returnItems)) {\
								Zotero.Messaging.sendMessage("progressWindow.close", null);\
							}\
							callback(returnItems);\
						});', 'callback(items);')
			);
			break;
	}
}

function processFile() {
	return through.obj(function(file, enc, cb) {
		console.log(path.relative(file.cwd, file.path));
		var basename = path.basename(file.path);
		var ext = path.extname(file.path);

		if (ext == '.jsx') {
			processJSX(file);
		}

		postProcessContents(basename, file);

		this.push(file);
		cb();
	});
}

gulp.task('update-zotero-scripts', function() {
	let sources = [
		'./zotero-connectors/src/browserExt/background.js',
		'./zotero-connectors/src/common/cachedTypes.js',
		//'./zotero-connectors/src/common/connector.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/date.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/debug.js',
		'./zotero-connectors/src/common/errors_webkit.js',
		'./zotero-connectors/src/common/http.js',
		'./zotero-connectors/src/common/inject/http.js',
		'./zotero-connectors/src/common/inject/inject.jsx',
		'./zotero-connectors/src/common/messages.js',
		'./zotero-connectors/src/common/messaging.js',
		'./zotero-connectors/src/browserExt/messaging_inject.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/openurl.js',
		'./zotero-connectors/src/browserExt/prefs.js',
		'./zotero-connectors/src/common/promise.js',
		'./zotero-connectors/src/common/proxy.js',
		'./zotero-connectors/src/common/repo.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/translation/translate.js',
		'./zotero-connectors/src/common/inject/translate_inject.js',
		'./zotero-connectors/src/common/translate_item.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/translation/translator.js',
		'./zotero-connectors/src/common/translators.js',
		'./zotero-connectors/src/zotero/resource/schema/connectorTypeSchemaData.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/xregexp/addons/unicode/unicode-zotero.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/utilities.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/utilities_translate.js',
		'./zotero-connectors/src/common/utilities.js',
		'./zotero-connectors/src/common/zotero.js',
		'./zotero-connectors/src/common/zotero_config.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/rdf/init.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/rdf/uri.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/rdf/term.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/rdf/identity.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/rdf/match.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/rdf/rdfparser.js'
	];

	gulp.src(sources, {
			base: process.cwd()
		})
		.pipe(plumber())
		.pipe(rename(function(path) {
			// Rename common/utilities.js -> utilities-common.js
			if (path.basename == 'utilities' && path.dirname.endsWith('common')) {
				path.basename = 'utilities-common';
			}

			// Rename inject/http.js -> http_inject.js
			if (path.basename == 'http' && path.dirname.endsWith('inject')) {
				path.basename = 'http_inject';
			}

			// Flatten directory structure
			if (path.dirname.endsWith("rdf")) {
				path.dirname = "rdf"
			} else {
				path.dirname = "";
			}
		}))
		.pipe(gulp.dest("./zotero"));
});


gulp.task('process-zotero-scripts', function() {
	let sources = [
		'./zotero/**/*'
	];

	gulp.src(sources)
		.pipe(plumber())
		.pipe(processFile())
		.pipe(beautify({
			indent_with_tabs: true,
			brace_style: "collapse"
		}))
		.pipe(rename(function(path) {
			// Rename jsx to js
			if (path.extname == ".jsx") {
				path.extname = ".js";
			}
		}))
		.pipe(gulp.dest((data) => data.base));
});

gulp.task('default', function() {
	// place code for your default task here
});
