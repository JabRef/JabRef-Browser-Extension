var ExportMode = Object.freeze({
  BibLaTeX: "biblatex",
  BibTeX: "bibtex",
});

const DEFAULT_PORT = 23119;

async function connectToJabRef(port) {
  base = `http://localhost:${port}/`;
  try {
    // Try a simple GET to the base URL to detect availability.
    const response = await fetch(base, { method: "GET", cache: "no-store" });
    if (response && (response.ok || response.status === 404)) {
      return { success: true };
    } else {
      return { success: false, status: response.status };
    }
  } catch (error) {
    return { success: false, error: error };
  }
}

function checkConnections({ httpPort }) {
  let status = document.getElementById("connectionStatusNative");
  browser.runtime
    .sendNativeMessage("org.jabref.jabref", {
      status: "validate",
    })
    .then((response) => {
      if (response.message === "jarNotFound") {
        status.setAttribute("class", "alert-error");
        status.textContent = "Unable to locate JabRef at:<br>" + response.path;
      } else if (response.message === "jarFound") {
        status.setAttribute("class", "alert-positive");
        status.textContent = "Communication to JabRef successful!";
      } else {
        status.setAttribute("class", "alert-error");
        status.innerHTML = "Unexpected response:<br>" + response.message;
      }
    })
    .catch((error) => {
      status.setAttribute("class", "alert-error");
      status.textContent = error.message;
    });

  let httpStatus = document.getElementById("connectionStatusHttp");
  httpStatus.textContent = `Testing connection on port ${httpPort}...`;
  connectToJabRef(httpPort).then((result) => {
    if (result.success) {
      httpStatus.setAttribute("class", "alert-positive");
      httpStatus.textContent = `JabRef reachable on port ${httpPort}`;
    } else {
      httpStatus.setAttribute("class", "alert-error");
      if (result.status) {
        httpStatus.textContent = `Errors with status code "${result.status}"`;
      } else if (result.error) {
        httpStatus.textContent = `Connection error: ${result.error.message}`;
        if (
          result.error instanceof TypeError &&
          (result.error.message.includes("Failed to fetch") ||
            result.error.message.includes("NetworkError"))
        ) {
          httpStatus.textContent += `\nConnection to port ${httpPort} failed. Is JabRef running and configured to accept HTTP connections on this port?`;
        }
      } else {
        httpStatus.textContent = `Connection to port ${httpPort} failed for unknown reasons.`;
      }
    }
  });
}

async function restoreOptions() {
  const options = await browser.storage.sync.get({
    exportMode: ExportMode.BibTeX,
    takeSnapshots: false,
    retrieveCitationCounts: false,
    httpPort: DEFAULT_PORT,
  });

  console.log("exportMode = " + options.exportMode);
  console.log("takeSnapshots = " + options.takeSnapshots);
  console.log("retrieveCitationCounts = " + options.retrieveCitationCounts);
  console.log("httpPort = " + options.httpPort);
  if (options.exportMode === ExportMode.BibLaTeX) {
    document.getElementById("exportBiblatex").checked = true;
  } else {
    document.getElementById("exportBibtex").checked = true;
  }
  if (options.takeSnapshots) {
    document.getElementById("snapshotsOn").checked = true;
  } else {
    document.getElementById("snapshotsOff").checked = true;
  }
  if (options.retrieveCitationCounts) {
    document.getElementById("retrieveCitationCountsOn").checked = true;
  } else {
    document.getElementById("retrieveCitationCountsOff").checked = true;
  }

  document.getElementById("portInput").value = options.httpPort;
  return options;
}

function saveOptions() {
  let exportMode;
  if (document.getElementById("exportBiblatex").checked) {
    exportMode = ExportMode.BibLaTeX;
  } else {
    exportMode = ExportMode.BibTeX;
  }
  var takeSnapshots = document.getElementById("snapshotsOn").checked;
  var retrieveCitationCounts = document.getElementById("retrieveCitationCountsOn").checked;
  var port = document.getElementById("portInput").value;
  const options = {
    exportMode: exportMode,
    takeSnapshots: takeSnapshots,
    retrieveCitationCounts: retrieveCitationCounts,
    httpPort: port,
  };
  browser.storage.sync.set(options);
  return options;
}

async function init() {
  const options = await restoreOptions();
  checkConnections(options);

  document.getElementById("exportBiblatex").addEventListener("change", () => saveOptions());
  document.getElementById("exportBibtex").addEventListener("change", () => saveOptions());

  document.getElementById("snapshotsOn").addEventListener("change", () => saveOptions());
  document.getElementById("snapshotsOff").addEventListener("change", () => saveOptions());

  document
    .getElementById("retrieveCitationCountsOn")
    .addEventListener("change", () => saveOptions());
  document
    .getElementById("retrieveCitationCountsOff")
    .addEventListener("change", () => saveOptions());

  const portInput = document.getElementById("portInput");
  const portChanged = () => {
    const options = saveOptions();
    checkConnections(options);
  };
  portInput.addEventListener("change", () => portChanged());
  portInput.addEventListener("blur", () => portChanged());
  portInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      portChanged();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
