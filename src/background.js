/* Make the icon active when we're on our GitHub or Bugzilla pages */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.method) {
		case "icon":
			chrome.pageAction.show(sender.tab.id);
			break;
		case "options":
			chrome.runtime.openOptionsPage();
			break;
	}
});