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


/* Show the options page when first installed */
chrome.runtime.onInstalled.addListener(function(details){
	if(details.reason == "install"){
		chrome.runtime.sendMessage({method: "options"}, function(response) {});
	}
	else if(details.reason == "update"){
		// Any need for this?
	}
});