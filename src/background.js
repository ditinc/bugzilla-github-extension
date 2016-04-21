/* Make the icon active when we're on our GitHub or Bugzilla pages */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	chrome.pageAction.show(sender.tab.id);
});