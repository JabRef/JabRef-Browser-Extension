'use strict';

let gulp = require('gulp');
const through = require('through2');
const plumber = require('gulp-plumber');
const path = require('path');
let rename = require("gulp-rename");
let beautify = require('gulp-jsbeautify');
const babel = require('babel-core');

function processJSX(file) {
	try {
		file.contents = Buffer.from(babel.transform(file.contents, {
			plugins: ['transform-react-jsx']
		}).code);
	} catch (e) {
		console.log(e.message);
	}
}


function processFile() {
	return through.obj(function(file, enc, cb) {
		//console.log(path.relative(file.cwd, file.path));
		var basename = path.basename(file.path);
		var ext = path.extname(file.path);

		if (ext === '.jsx') {
			processJSX(file);
		}

		this.push(file);
		cb();
	});
}

gulp.task('copy-external-scripts', function() {
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
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/translation/tlds.js',
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
		'./zotero-connectors/src/zotero/chrome/content/zotero/xpcom/rdf/rdfparser.js',

		'./zotero-scholar-citations/chrome/content/zsc.js'
	];

	return gulp.src(sources, {
			base: process.cwd()
		})
		.pipe(plumber())
		.pipe(rename(function(path) {
			// Rename common/utilities.js -> utilities-common.js
			if (path.basename === 'utilities' && path.dirname.endsWith('common')) {
				path.basename = 'utilities-common';
			}

			// Rename inject/http.js -> http_inject.js
			if (path.basename === 'http' && path.dirname.endsWith('inject')) {
				path.basename = 'http_inject';
			}

			// Flatten directory structure
			if (path.dirname.endsWith("rdf")) {
				path.dirname = "rdf";
			} else if (path.dirname.startsWith("zotero-scholar-citations")) {
				path.dirname = "zsc";
			} else {
				path.dirname = "";
			}
		}))
		.pipe(gulp.dest("./external-scripts"));
});

gulp.task('process-external-scripts', function() {
	let sources = [
		'./external-scripts/**/*'
	];

	return gulp.src(sources)
		.pipe(plumber())
		.pipe(processFile())
		.pipe(beautify({
			indent_with_tabs: true,
			brace_style: "collapse"
		}))
		.pipe(rename(function(path) {
			// Rename jsx to js
			if (path.extname === ".jsx") {
				path.extname = ".js";
			}
		}))
		.pipe(gulp.dest((data) => data.base));
});

gulp.task('update-external-scripts', gulp.series('copy-external-scripts', 'process-external-scripts'));
