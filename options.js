function saveOptions(e) {
	browser.storage.sync.set({
		exportMode: document.querySelector("#exportMode").value,
		takeAutomaticSnapshots: document.querySelector("#takeAutomaticSnapshots").checked
	});
	e.preventDefault();
}

function restoreOptions() {
	browser.storage.sync.get({
			exportMode: 0,
			takeAutomaticSnapshots: false
		})
		.then(settings => {
			document.querySelector("#exportMode").value = settings.exportMode;
			document.querySelector("#takeAutomaticSnapshots").checked = settings.takeAutomaticSnapshots;
		});
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
