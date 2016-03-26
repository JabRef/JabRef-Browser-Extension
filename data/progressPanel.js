var mainList = document.getElementById("itemList");
var initalMessage = document.getElementById("initalMessage");

/*
 * Show the item in the progress window.
 */
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

/*
 * Update progress of attachment download.
 */
addon.port.on("updateProgress", function onUpdateProgress(item) {

	var attachmentListItem = document.getElementById(item.attachmentId);
	var progress = item.progress / 100;
	if (progress < 0.3)
		progress = 0.3;
	attachmentListItem.style.opacity = progress;
	if (progress > 0.9)
		attachmentListItem.className = ""; // Remove inprogress
});
