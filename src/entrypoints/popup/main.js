import "./style.css";

browser.runtime.onMessage.addListener(function (message, _sender, _sendResponse) {
  console.debug("JabRef: Received message in popup:", message);
  if (message.popupClose) {
    // The popup should be closed
    setTimeout(function () {
      window.close();
    }, 3000);
    console.log("JabRef: Popup closed");
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

document.addEventListener("DOMContentLoaded", async () => {
  console.log("JabRef: Popup opened");

  // Run translators for the active tab
  onPopupOpened();
});
