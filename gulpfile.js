'use strict';

let gulp = require('gulp');
const through = require('through2');
const plumber = require('gulp-plumber');
const path = require('path');
let rename = require("gulp-rename");
let beautify = require('gulp-jsbeautify');
const babel = require('babel-core');
const { deleteSync} = require('del');

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

gulp.task('clean-external-scripts', async function() {
	deleteSync('./utilities/resource/**', {force: true});
	return deleteSync('./external-scripts/**', {force: true});
})

gulp.task('copy-external-scripts', async function() {
	// Zotero expects this to be in this particular location
	gulp.src('./zotero-connectors/src/utilities/resource/dateFormats.json')
		.pipe(gulp.dest('utilities/resource/'));
	
	let sources = [
		// These are mostly coming from injectInclude in zotero-connectors/gulpfile.js if not otherwise noted
		// './zotero-connectors/src/common/node_modules.js', // not needed
		'./zotero-connectors/src/common/zotero_config.js',
		'./zotero-connectors/src/common/zotero.js',
		'./zotero-connectors/src/common/http.js',
		'./zotero-connectors/src/common/proxy.js',
		// './zotero-connectors/src/common/connector.js', // backgroundInclude, we override this in our own connector.js file
		'./zotero-connectors/src/common/repo.js', // backgroundInclude
		'./zotero-connectors/src/common/utilities.js',
		'./zotero-connectors/src/translate/src/promise.js',
		'./zotero-connectors/src/translate/src/translation/translate_item.js',
		'./zotero-connectors/src/common/translators.js', // backgroundInclude
		'./zotero-connectors/src/common/inject/http.js',
		'./zotero-connectors/src/common/inject/inject.jsx', // injectIncludeLast
		// './zotero-connectors/src/common/inject/translate_inject.js', no longer available
		'./zotero-connectors/src/common/cachedTypes.js',
		'./zotero-connectors/src/common/errors_webkit.js', // backgroundInclude
		'./zotero-connectors/src/common/schema.js', // not needed?
		'./zotero-connectors/src/common/messages.js',
		'./zotero-connectors/src/common/messaging.js',		
		'./zotero-connectors/src/browserExt/background.js', // process-custom-scripts
		'./zotero-connectors/src/browserExt/messaging_inject.js',
		'./zotero-connectors/src/browserExt/prefs.js',
		// './zotero-connectors/src/zotero/resource/schema/connectorTypeSchemaData.js', no longer existing
		'./zotero-connectors/src/utilities/openurl.js',
		'./zotero-connectors/src/utilities/date.js',
		'./zotero-connectors/src/utilities/xregexp-all.js',
		'./zotero-connectors/src/utilities/xregexp-unicode-zotero.js',
		'./zotero-connectors/src/utilities/resource/zoteroTypeSchemaData.js',
		'./zotero-connectors/src/utilities/utilities.js',
		'./zotero-connectors/src/utilities/utilities_item.js',
		'./zotero-connectors/src/utilities/schema.js',

		'./zotero-connectors/src/translate/src/promise.js',
		'./zotero-connectors/src/translate/src/debug.js',
		'./zotero-connectors/src/translate/src/rdf/init.js',
		'./zotero-connectors/src/translate/src/rdf/uri.js',
		'./zotero-connectors/src/translate/src/rdf/term.js',
		'./zotero-connectors/src/translate/src/rdf/identity.js',
		'./zotero-connectors/src/translate/src/rdf/rdfparser.js',
		'./zotero-connectors/src/translate/src/translation/translate.js',
		'./zotero-connectors/src/translate/src/translator.js',
		'./zotero-connectors/src/translate/src/utilities_translate.js',
		'./zotero-connectors/src/translate/src/tlds.js',

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

			// Rename utilities/schema.js -> utilities-schema.js
			if (path.basename === 'schema' && path.dirname.endsWith('utilities')) {
				path.basename = 'utilities-schema';
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

gulp.task('process-external-scripts', async function() {
	let sources = [
		'./external-scripts/**/*'
	];

	return gulp.src(sources, {
			base: process.cwd()
		})
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

gulp.task('update-external-scripts', gulp.series('clean-external-scripts', 'copy-external-scripts', 'process-external-scripts'));
