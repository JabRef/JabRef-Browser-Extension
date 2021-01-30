module.exports = {
	ignoreFiles: [
		'zotero-connectors',
		'circle.yml',
		'gulpfile.js',
		'JabFox.sublime-project',
		'JabFox.sublime-workspace',
		'package-lock.json',
		'install_linux.sh',
		'zotero-scholar-citations',
		'.idea'
	],
	run: {
		startUrl: [
			'about:debugging',
			'https://ieeexplore.ieee.org/abstract/document/893874',
			'https://arxiv.org/a/diez_t_1.html',
		],
		browserConsole: true,
	},
	build: {
		overwriteDest: true
	}
};
