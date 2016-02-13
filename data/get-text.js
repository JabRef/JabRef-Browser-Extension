var mainList = document.getElementById("itemList");
var initalMessage = document.getElementById("initalMessage");
//var attachmentsMap = new WeakMap();

addon.port.on("show", function onShow(item) {

	initalMessage.style.display = 'none';

	var listItem = document.createElement('li');
	listItem.style.backgroundImage = "url('"+item.imageSrc+"')";
	listItem.appendChild(document.createTextNode(item.title));

	var attachmentList = document.createElement('ul');
	attachmentList.className = "attachmentList"
	for(var i = 0; i < item.attachments.length; i++) {
		var attachmentItem = document.createElement('li');
		attachmentItem.id = item.attachments[i].attachmentId;
		attachmentItem.appendChild(document.createTextNode(item.attachments[i].title));
		attachmentItem.style.backgroundImage = "url('"+item.attachments[i].imageSrc+"')";
		attachmentItem.style.opacity = 0.3;
		attachmentList.appendChild(attachmentItem);
    	}
	listItem.appendChild(attachmentList);

	mainList.appendChild(listItem);

	addon.port.emit("winsize", {height: mainList.scrollHeight + 100, width: mainList.scrollWidth});
});

addon.port.on("updateProgress", function onUpdateProgress(item) {

	var attachmentListItem = document.getElementById(item.attachmentId);
	var progress = item.progress / 100;
	if(progress < 0.3) 
		progress = 0.3;
	attachmentListItem.style.opacity = progress;
});
