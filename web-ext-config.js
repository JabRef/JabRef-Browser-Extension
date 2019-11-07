module.exports = {
	ignoreFiles: [
		'zotero-connectors',
		'circle.yml',
		'gulpfile.js',
		'JabFox.sublime-project',
		'JabFox.sublime-workspace',
		'package-lock.json'
	],
	run: {
		startUrl: [
			'about:debugging',
			'https://arxiv.org/a/diez_t_1.html',
		],
		browserConsole: true,
	},
	build: {
		overwriteDest: true
	}
};
