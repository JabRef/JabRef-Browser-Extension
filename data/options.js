var ExportMode = Object.freeze({
	BibLaTeX: 1,
	BibTeX: 2
})

function checkConnection() {
	var status = document.getElementById('connectionStatus');
	browser.runtime.sendNativeMessage("org.jabref.jabref", {
			"status": "validate"
		})
		.then(response => {
			if (response.message == 'jarNotFound') {
				status.setAttribute('class', 'alert-error');
				status.innerHTML = 'Unable to locate JabRef at:<br>' + response.path;
			} else if (response.message == 'jarFound') {
				status.setAttribute('class', 'alert-positive')
				status.textContent = 'Communication to JabRef successful!';
			} else {
				status.setAttribute('class', 'alert-error');
				status.textContent = 'Unexpected response:<br>' + response.message;
			}
		}, error => {
			status.setAttribute('class', 'alert-error');
			status.textContent = error;
		});
}

function restoreOptions() {
	browser.storage.sync.get(['exportMode', 'takeSnapshots'])
		.then(res => {
			console.log(res.exportMode);
			console.log(res.takeSnapshots);
			var exportBiblatex = res.exportMode !== undefined ? res.exportMode == ExportMode.BibLaTeX : true;
			document.getElementById("exportBiblatex").checked = exportBiblatex;
			document.getElementById("snapshotsOn").checked = res.takeSnapshots || false;
		});
}

function saveOptions() {
	var exportMode;
	if (document.getElementById("exportBiblatex").checked) {
		exportMode = ExportMode.BibLaTeX;
	} else {
		exportMode = ExportMode.BibTeX;
	}
	var takeSnapshots = document.getElementById("snapshotsOn").checked;
	browser.storage.sync.set({
		exportMode: exportMode,
		takeSnapshots: takeSnapshots
	});
}

function init() {
	restoreOptions();
	checkConnection();

	document.getElementById("exportBiblatex").addEventListener('change', () => saveOptions());
	document.getElementById("exportBibtex").addEventListener('change', () => saveOptions());
	document.getElementById("snapshotsOn").addEventListener('change', () => saveOptions());
	document.getElementById("snapshotsOff").addEventListener('change', () => saveOptions());
}

document.addEventListener('DOMContentLoaded', init);
