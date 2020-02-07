var ExportMode = Object.freeze({
	BibLaTeX: 1,
	BibTeX: 2
});

function checkConnection() {
	var status = document.getElementById('connectionStatus');
	browser.runtime.sendNativeMessage("org.jabref.jabref", {
			"status": "validate"
		})
		.then(response => {
			if (response.message === 'jarNotFound') {
				status.setAttribute('class', 'alert-error');
				status.textContent = 'Unable to locate JabRef at:<br>' + response.path;
			} else if (response.message === 'jarFound') {
				status.setAttribute('class', 'alert-positive');
				status.textContent = 'Communication to JabRef successful!';
			} else {
				status.setAttribute('class', 'alert-error');
				status.innerHTML = 'Unexpected response:<br>' + response.message;
			}
		}, error => {
			status.setAttribute('class', 'alert-error');
			status.textContent = error.message;
		});
}

function restoreOptions() {
	browser.storage.sync.get(['exportMode', 'takeSnapshots', 'retrieveCitationCounts'])
		.then(res => {
			console.log(res.exportMode);
			console.log(res.takeSnapshots);
			console.log(res.retrieveCitationCounts);
			var exportBiblatex = res.exportMode !== undefined ? res.exportMode == ExportMode.BibLaTeX : true;
			document.getElementById("exportBiblatex").checked = exportBiblatex;
			document.getElementById("snapshotsOn").checked = res.takeSnapshots || false;
			document.getElementById("retrieveCitationCounts").checked = res.retrieveCitationCounts || false;
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
	var retrieveCitationCounts = document.getElementById("retrieveCitationCounts").checked;
	browser.storage.sync.set({
		exportMode: exportMode,
		takeSnapshots: takeSnapshots,
		retrieveCitationCounts: retrieveCitationCounts
	});
}

function init() {
	restoreOptions();
	checkConnection();

	document.getElementById("exportBiblatex").addEventListener('change', () => saveOptions());
	document.getElementById("exportBibtex").addEventListener('change', () => saveOptions());

	document.getElementById("snapshotsOn").addEventListener('change', () => saveOptions());
	document.getElementById("snapshotsOff").addEventListener('change', () => saveOptions());

	document.getElementById("retrieveCitationCountsOn").addEventListener('change', () => saveOptions());
	document.getElementById("retrieveCitationCountsOff").addEventListener('change', () => saveOptions());
}

document.addEventListener('DOMContentLoaded', init);
