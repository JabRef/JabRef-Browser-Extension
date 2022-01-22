'use strict';

const fs = require('fs-extra');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { getSignatures, writeSignatures, onSuccess, onError } = require('./utils');
const { buildsURL } = require('./config');

async function getPDFWorker(signatures) {
	const t1 = Date.now();

	const { stdout } = await exec('git rev-parse HEAD', { cwd: 'pdf-worker' });
	const hash = stdout.trim();

	if (!('pdf-worker' in signatures) || signatures['pdf-worker'].hash !== hash) {
		const targetDir = 'build/chrome/content/zotero/xpcom/pdfWorker/';
		try {
			const filename = hash + '.zip';
			const tmpDir = 'tmp/builds/pdf-worker';
			const url = buildsURL + 'client-pdf-worker/' + filename;
			await exec(
				`mkdir -p ${tmpDir}`
				+ `&& cd ${tmpDir}`
				+ `&& (test -f ${filename} || curl -f ${url} -o ${filename})`
				+ `&& mkdir -p ../../../${targetDir}`
				+ `&& unzip -o ${filename} -d ../../../${targetDir}`
			);
		}
		catch (e) {
			await exec('npm ci;npm run build', { cwd: 'pdf-worker' });
			await fs.copy('pdf-worker/build/worker.js', targetDir + 'worker.js');
		}
		signatures['pdf-worker'] = { hash };
	}

	const t2 = Date.now();

	return {
		action: 'pdf-worker',
		count: 1,
		totalCount: 1,
		processingTime: t2 - t1
	};
}

module.exports = getPDFWorker;

if (require.main === module) {
	(async () => {
		try {
			const signatures = await getSignatures();
			onSuccess(await getPDFWorker(signatures));
			await writeSignatures(signatures);
		}
		catch (err) {
			process.exitCode = 1;
			global.isError = true;
			onError(err);
		}
	})();
}
