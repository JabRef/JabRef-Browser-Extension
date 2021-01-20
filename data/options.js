var ExportMode = Object.freeze({
	BibLaTeX: 1,
	BibTeX: 2
});

function checkConnections() {
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
		})
		.catch(error => {
			status.setAttribute('class', 'alert-error');
			status.textContent = error.message;
		});

	let wsClientStatus = document.getElementById('wsClientStatus');
	browser.runtime.sendMessage({
		"getWsClientState": true
	}).then(response => {
		if (response.clientStarted) {
			switch (response.connectionState) {
				case WebSocket.CONNECTING:
					wsClientStatus.setAttribute('class', 'alert-positive');
					wsClientStatus.textContent = 'connecting';
					break;
				case WebSocket.OPEN:
					wsClientStatus.setAttribute('class', 'alert-positive');
					wsClientStatus.textContent = 'connected';
					break;
				case WebSocket.CLOSING:
					wsClientStatus.setAttribute('class', 'alert-error');
					wsClientStatus.textContent = 'closing';
					break;
				case WebSocket.CLOSED:
					wsClientStatus.setAttribute('class', 'alert-error');
					wsClientStatus.textContent = 'closed';
					break;
				default:
					wsClientStatus.setAttribute('class', 'alert-error');
					wsClientStatus.textContent = 'n/a';
			}
		} else {
			wsClientStatus.setAttribute('class', 'alert-error');
			wsClientStatus.textContent = 'Websocket client not started';
		}
	});
}

function restoreOptions() {
	browser.storage.sync.get(['exportMode', 'takeSnapshots', 'retrieveCitationCounts'])
		.then(res => {
			console.log(res.exportMode);
			console.log(res.takeSnapshots);
			console.log(res.retrieveCitationCounts);
			let exportBiblatex = res.exportMode !== undefined ? res.exportMode === ExportMode.BibLaTeX : false;
			let takeSnapshots = res.takeSnapshots || false;
			let retrieveCitationCountsOn = res.retrieveCitationCounts || false;
			if (exportBiblatex) {
				document.getElementById("exportBiblatex").checked = true;
			} else {
				document.getElementById("exportBibtex").checked = true;
			}
			if (takeSnapshots) {
				document.getElementById("snapshotsOn").checked = true;
			} else {
				document.getElementById("snapshotsOff").checked = true;
			}
			if (retrieveCitationCountsOn) {
				document.getElementById("retrieveCitationCountsOn").checked = true;
			} else {
				document.getElementById("retrieveCitationCountsOff").checked = true;
			}
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
	var retrieveCitationCounts = document.getElementById("retrieveCitationCountsOn").checked;
	browser.storage.sync.set({
		exportMode: exportMode,
		takeSnapshots: takeSnapshots,
		retrieveCitationCounts: retrieveCitationCounts
	});
}

function init() {
	restoreOptions();
	checkConnections();

	document.getElementById("exportBiblatex").addEventListener('change', () => saveOptions());
	document.getElementById("exportBibtex").addEventListener('change', () => saveOptions());

	document.getElementById("snapshotsOn").addEventListener('change', () => saveOptions());
	document.getElementById("snapshotsOff").addEventListener('change', () => saveOptions());

	document.getElementById("retrieveCitationCountsOn").addEventListener('change', () => saveOptions());
	document.getElementById("retrieveCitationCountsOff").addEventListener('change', () => saveOptions());
}

document.addEventListener('DOMContentLoaded', init);
