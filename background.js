// Called when the user clicks on the browser action.
chrome.browserAction.onClicked.addListener(function(tab) {
	// Send a message to the active tab
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		var activeTab = tabs[0];
		if (activeTab) {
			chrome.tabs.sendMessage(activeTab.id, {"message": "clicked_browser_action"});
		}
	});
});

// Called when the page is updated
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
	if (changeInfo.status !== "loading") {
		chrome.tabs.sendMessage(tabId, {"message": "tab_updated"});
	}
});

chrome.webRequest.onCompleted.addListener(
	function(details) {
		console.log("GitHub sent request to: " + details.url);
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			var activeTab = tabs[0];
			if (activeTab) {
				chrome.tabs.sendMessage(activeTab.id, {"message": details.url});
			}
		});
	},
	{urls: ['<all_urls>']}
);