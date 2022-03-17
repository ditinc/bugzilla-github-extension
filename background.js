try {
	importScripts("src/bugzilla.js");
} catch (e) {
	console.error(e);
}
/* Handle calls when we're on our GitHub or Bugzilla pages */
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

	if (request.bugzillaSettings != null) {
		// This object will be used to interact with Bugzilla.
		var bugzilla = new Bugzilla(request.bugzillaSettings);
	}

	switch (request.method) {
		case "options":
			chrome.runtime.openOptionsPage();
			break;

		case "login":
			console.log("Got to login", request)
			bugzilla.login(request.username, request.password)
				.then(function (response) {
					if (response[0].token) {
						bugzilla.setToken(response[0].token);
					}
					chrome.tabs.sendMessage(sender.tab.id, {
						method: "loginFinished",
						response: response,
						settings: request.bugzillaSettings,
						callback: request.callback
					});
				})
				.catch(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: "loginFailed",
						response: response,
						settings: request.bugzillaSettings
					});
				});
			break;

		case "getBug":
			console.log("Got to getBug", request)
			bugzilla.getBug(request.bugId, request.fieldsToShow)
				.then(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: request.callbackMessage,
						response: response,
						settings: request.bugzillaSettings,
						fieldsToShow: request.fieldsToShow,
						bugId: request.bugId
					});
				})
				.catch(function (response) {
					var failMethod = request.callbackMessage === "titleLoaded" ? "titleLoadFailed" : "detailsLoadFailed";
					chrome.tabs.sendMessage(sender.tab.id, {
						method: failMethod,
						response: response,
						settings: request.bugzillaSettings,
						bugId: request.bugId
					});
				});

			break;

		case "getBugs":
			console.log("Got to getBugs", request)
			bugzilla.getBugs(request.bugIds, request.fieldsToShow)
				.then(function (response) {
					console.log(response)
					chrome.tabs.sendMessage(sender.tab.id, {
						method: request.callbackMessage,
						response: response,
						settings: request.bugzillaSettings,
						fieldsToShow: request.fieldsToShow,
						bugId: request.bugIds
					});
				})
				.catch(function (response) {
					var failMethod = request.callbackMessage === "titlesLoaded" ? "titlesLoadFailed" : "detailsLoadFailed";
					chrome.tabs.sendMessage(sender.tab.id, {
						method: failMethod,
						response: response,
						settings: request.bugzillaSettings,
						bugId: request.bugIds
					});
				});
			break;

		case "getAttachments":
			console.log("Got to getAttachments", request)
			bugzilla.getAttachments(request.bugId)
				.then(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: "attachmentsLoaded",
						response: response,
						settings: request.bugzillaSettings,
						bugId: request.bugId,
						attachmentUrl: bugzilla.attachmentUrl
					});
				})
				.catch((response) => console.log(response));
			break;

		case "updateBug":
			console.log("Got to updateBug", request)
			bugzilla.updateBug(request.bugId, request.params)
				.then(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: "updateFinished",
						response: response,
						settings: request.bugzillaSettings,
						bugId: request.bugId
					});
				});
			break;

		case "updateBugs":
			console.log("Got to updateBugs", request)
			bugzilla.updateBugs(request.bugId, request.params);
			break;

		case "addComment":
			console.log("Got to addComment", request)
			bugzilla.addComment(request.bugId, request.comment, request.hoursWorked);
			break;

		case "getProducts":
			console.log("Got to getProducts", request)
			bugzilla.getProducts()
				.then(function (response) {
					console.log(response)
					chrome.tabs.sendMessage(sender.tab.id, {
						method: "productsLoaded",
						response: response,
						settings: request.bugzillaSettings
					});
				})
				.catch(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: "productsLoadFailed",
						response: response,
						settings: request.bugzillaSettings
					});
				});
			break;

		case "duplicateBugs":
			console.log("Got to duplicateBugs", request)
			var dupeBug = function (i) {
				bugzilla.updateBugs(request.duplicates[i], { "dupe_of": request.dupeOf, "comment": { "body": "Marking as duplicate." } })
					.then(function (response) {
						// Dupe the next bug, if there is one to dupe
						if (request.duplicates[i + 1]) {
							dupeBug(i + 1);
						}

						bugzilla.updateBugs(request.duplicates[i], { "status": "CLOSED", "comment": { "body": "Closing duplicate." } })
							.then(function (response) {
								chrome.tabs.sendMessage(sender.tab.id, {
									method: "duplicateFinished",
									response: response,
									settings: request.bugzillaSettings,
									duplicates: request.duplicates,
									dupeOf: request.dupeOf
								});
							});
					});
			};

			dupeBug(0);
			break;

		case "getFieldInfo":
			console.log("Got to getFieldInfo", request)
			bugzilla.getFieldInfo(request.fields)
				.then(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: "fieldInfoLoaded",
						response: response,
						settings: request.bugzillaSettings
					});
				})
				.catch(function (response) {
					var faultString = getFaultString(response);

					if (faultString.indexOf("You must log in") > -1) {
						showLoginForm(function () {
							showMilestoneForm(repo);
						});
					}
				});

			break;
	}
	return true;
});

/* Show the options page when first installed */
chrome.runtime.onInstalled.addListener(function (details) {
	if (details.reason == "install") {
		chrome.runtime.sendMessage({ method: "options" }, function (response) { });
	}
	else if (details.reason == "update") {
		// Any need for this?
	}
});