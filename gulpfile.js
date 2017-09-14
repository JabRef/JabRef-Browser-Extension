'use strict';

var gulp = require('gulp');
const through = require('through2');
const plumber = require('gulp-plumber');
const path = require('path');
var rename = require("gulp-rename");
var beautify = require('gulp-jsbeautify');

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
	'Zotero/xregexpOld/addons/unicode/unicode-zotero.js',
	// rdf
	'Zotero/translate.js',
	'Zotero/translator.js',
	// translate_item
	'Zotero/typeSchemaData.js',
	'Zotero/utilities.js',
	'Zotero/utilities_translate.js',
	'Zotero/utilities_common.js',
	// inject/http
	'progressWindow.js',
	// inject/translate_inject
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
				.replace("/*INJECT SCRIPTS*/",
					injectInclude.map((s) => `"${s}"`).join(',\n\t\t'))
				// Uncomment message listener, because we take care of them ourself
				.replace("Zotero.Messaging.addMessageListener(",
					'/*\n\tZotero.Messaging.addMessageListener(')
				.replace("}\r\n\r\nZotero.initGlobal();",
					'\t*/}\r\n\r\n//Zotero.initGlobal();')
			);
			break;
	}
}

function processFile() {
	return through.obj(function(file, enc, cb) {
		console.log(path.relative(file.cwd, file.path));
		var basename = path.basename(file.path);
		var ext = path.extname(file.path);

		if (ext == 'jsx') {
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
		'./zotero-connectors/src/common/translate_item.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/translation/translator.js',
		'./zotero-connectors/src/common/translators.js',
		'./zotero-connectors/src/zotero/resource/schema/connectorTypeSchemaData.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/xregexp/addons/unicode/unicode-zotero.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/utilities.js',
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/utilities_translate.js',
		'./zotero-connectors/src/common/utilities.js',
		'./zotero-connectors/src/common/zotero.js',
		'./zotero-connectors/src/common/zotero_config.js'
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

			// Flatten directory structure
			path.dirname = "";
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
		.pipe(gulp.dest((data) => data.base));
});

gulp.task('default', function() {
	// place code for your default task here
});
