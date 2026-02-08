// Provide a minimal compatibility shim: if `browser` is missing, alias it to `chrome`.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

var mainList = document.getElementById("itemList");

var jabrefBaseUrlPromise = null;

browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.popupClose) {
    // The popup should be closed
    setTimeout(function () {
      window.close();
    }, 3000);
    console.log("JabRef: Popup closed");
  } else if (message.onCitationCount) {
    document.getElementById("citationCountNumber").innerHTML = "" + message.onCitationCount;
    document.getElementById("citationCount").style.display = "block";
  } else if (message.itemIncomplete) {
    document.getElementById("itemIncomplete").style.display = "block";
  } else if (message.onGoogleScholarCaptcha) {
    document.getElementById("googleScholarCaptchaLink").href = message.onGoogleScholarCaptcha;
    document.getElementById("googleScholarCaptcha").style.display = "block";
  } else if (message.tooManyRequests) {
    document.getElementById("tooManyRequests").style.display = "block";
  } else if (message.onConvertToBibtex) {
    document.getElementById("status").innerHTML = "Converting to BibTeX...";
  } else if (message.onSendToJabRef) {
    document.getElementById("status").innerHTML = "Sending to JabRef...";
  }
});

/*
 * Show the item in the progress window.
 */
/*
addon.port.on("show", function onShow(item) {

	// Hide initial message
	initalMessage.style.display = 'none';

	// Create list entry for item
	var listItem = document.createElement('li');
	listItem.style.backgroundImage = "url('" + item.imageSrc + "')";
	listItem.appendChild(document.createTextNode(item.title));

	// Create sublist for attachments
	var attachmentList = document.createElement('ul');
	attachmentList.className = "attachmentList"
	for (var i = 0; i < item.attachments.length; i++) {
		var attachmentItem = document.createElement('li');
		attachmentItem.id = item.attachments[i].attachmentId;
		attachmentItem.appendChild(document.createTextNode(item.attachments[i].title + "  "));
		attachmentItem.style.backgroundImage = "url('" + item.attachments[i].imageSrc + "')";
		attachmentItem.style.opacity = 0.3;
		attachmentItem.className = "inprogress";
		attachmentList.appendChild(attachmentItem);
	}
	listItem.appendChild(attachmentList);

	mainList.appendChild(listItem);

	// Notify main code that the progress window should be resized
	addon.port.emit("winsize", {
		height: mainList.scrollHeight + 100,
		width: mainList.scrollWidth
	});
});
*/

/*
 * Update progress of attachment download.
 */
/*
addon.port.on("updateProgress", function onUpdateProgress(item) {

	var attachmentListItem = document.getElementById(item.attachmentId);
	var progress = item.progress / 100;
	if (progress < 0.3)
		progress = 0.3;
	attachmentListItem.style.opacity = progress;
	if (progress > 0.9)
		attachmentListItem.className = ""; // Remove inprogress
});
*/

async function onPopupOpened() {
  try {
    appendLog("Popup opened, starting translator run", "info");
    const resp = await browser.runtime.sendMessage({ type: "popupOpened" });
    if (resp && resp.ok) appendLog("Background acknowledged request", "info");
    else appendLog(`Background error: ${resp && resp.error ? resp.error : "unknown"}`, "error");
  } catch (e) {
    console.error("Failed to send popupOpened message", e);
  }
}

// Listen for offscreen results
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "offscreenResult") return;
  const error = msg.error;
  const result = msg.result;
  if (error) {
    appendLog(`Error: ${error}`);
    return;
  }
  appendLog(`Received result for ${msg.url}`);
  // Send to JabRef automatically
  sendBibEntry(result);
});

function appendLog(text) {
  const log = document.getElementById("log");
  if (!log) return;
  const d = document.createElement("div");
  d.className = "log-line";
  // Convert URLs in the text into clickable links
  // Split the text keeping URLs (captures https?://...)
  const parts = text.split(/(https?:\/\/(docs.jabref.org|github.com)[^\s]+)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("http://") || part.startsWith("https://")) {
      const a = document.createElement("a");
      a.href = part;
      a.textContent = part;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      d.appendChild(a);
    } else {
      d.appendChild(document.createTextNode(part));
    }
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

async function getBaseUrl() {
  const settings = await browser.storage.sync.get({ httpPort: 23119 });
  return `http://localhost:${settings.httpPort}/`;
}

/* Try to connect to JabRef via HTTP */
async function connectToJabRef() {
  const url = await getBaseUrl();
  appendLog(`Checking JabRef at ${url}...`, "info");
  try {
    // Try a simple GET to the base URL to detect availability.
    const resp = await fetch(url, { method: "GET", cache: "no-store" });
    if (resp && (resp.ok || resp.status === 404)) {
      appendLog("JabRef reachable (HTTP)", "success");
      return url;
    } else {
      appendLog(`JabRef responded with status ${resp.status}`, "warning");
      return null;
    }
  } catch (error) {
    appendLog(`Connection failed: ${error && error.message ? error.message : error}`, "error");
    console.error("HTTP connection error:", error);
    return null;
  }
}

// Send BibTeX entry to JabRef
async function sendBibEntry(bibEntry) {
  if (!bibEntry) {
    appendLog("BibTeX entry is empty", "error");
    return;
  }
  const url = (await jabrefBaseUrlPromise) + "libraries/current/entries";
  appendLog(`Sending BibTeX entry to JabRef at ${url}...`, "info");

  if (!bibEntry.startsWith("@")) {
    appendLog("BibTeX entry does not start with '@'", "error");
    return;
  }

  try {
    console.log("Sending to JabRef (HTTP POST):", bibEntry);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-bibtex" },
      body: bibEntry,
    });

    if (resp.ok) {
      appendLog("BibTeX entry sent successfully!", "success");
      appendLog(`Sent: ${bibEntry.substring(0, 50)}...`, "info");
    } else {
      let text;
      try {
        text = await resp.text();
      } catch (e) {
        text = String(e);
      }
      appendLog(`Failed to send (HTTP ${resp.status}): ${text}`, "error");
      console.error("HTTP send failed", resp.status, text);
    }
  } catch (error) {
    appendLog(`Failed to send: ${error && error.message ? error.message : error}`, "error");
    console.error("Send error:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("JabRef: Popup opened");

  // Try to auto-connect to JabRef via HTTP when popup opens
  jabrefBaseUrlPromise = connectToJabRef();

  // Run translators for the active tab
  onPopupOpened();
});
