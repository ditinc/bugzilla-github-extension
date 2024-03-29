try {
	importScripts('src/bugzilla.js');
} catch (e) {
	console.error(e);
}
/* Handle calls when we're on our GitHub or Bugzilla pages */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
	if (request.bugzillaSettings != null) {
		// This object will be used to interact with Bugzilla.
		var bugzilla = new Bugzilla(request.bugzillaSettings);
	}

	switch (request.method) {
		case 'options':
			chrome.runtime.openOptionsPage();
			break;

		case 'login':
			bugzilla
				.login(request.username, request.password)

				.then(function (response) {
					if (response.token) {
						bugzilla.setToken(response.token);
					}
					chrome.tabs.sendMessage(sender.tab.id, {
						method: 'loginFinished',
						response: response,
						settings: request.bugzillaSettings,
						callback: request.callback
					});
				})
				.catch(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: 'loginFailed',
						response: response,
						settings: request.bugzillaSettings
					});
				});
			break;

		case 'getBug':
			bugzilla
				.getBug(request.bugId, request.fieldsToShow)
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
					var failMethod = request.callbackMessage === 'titleLoaded' ? 'titleLoadFailed' : 'detailsLoadFailed';
					chrome.tabs.sendMessage(sender.tab.id, {
						method: failMethod,
						response: response,
						settings: request.bugzillaSettings,
						bugId: request.bugId
					});
				});
			break;

		case 'getBugs':
			bugzilla
				.getBugs(request.bugIds, request.fieldsToShow)
				.then(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: request.callbackMessage,
						response: response,
						settings: request.bugzillaSettings,
						fieldsToShow: request.fieldsToShow,
						bugId: request.bugIds
					});
				})
				.catch(function (response) {
					var failMethod = request.callbackMessage === 'titlesLoaded' ? 'titlesLoadFailed' : 'detailsLoadFailed';
					chrome.tabs.sendMessage(sender.tab.id, {
						method: failMethod,
						response: response,
						settings: request.bugzillaSettings,
						bugId: request.bugIds
					});
				});
			break;

		case 'getAttachments':
			bugzilla.getAttachments(request.bugId).then(function (response) {
				chrome.tabs.sendMessage(sender.tab.id, {
					method: 'attachmentsLoaded',
					response: response,
					settings: request.bugzillaSettings,
					bugId: request.bugId,
					attachmentUrl: bugzilla.attachmentUrl
				});
			});
			break;

		case 'updateBug':
			bugzilla.updateBug(request.bugId, request.params).then(function (response) {
				chrome.tabs.sendMessage(sender.tab.id, {
					method: 'updateFinished',
					response: response,
					settings: request.bugzillaSettings,
					bugId: request.bugId
				});
			});
			break;

		case 'updateBugs':
			bugzilla.updateBugs(request.bugId, request.params);
			break;

		case 'addComment':
			bugzilla.addComment(request.bugId, request.comment, request.hoursWorked);
			break;

		case 'getProducts':
			bugzilla
				.getProducts()

				.then(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: 'productsLoaded',
						response: response,
						settings: request.bugzillaSettings
					});
				})
				.catch(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: 'productsLoadFailed',
						response: response,
						settings: request.bugzillaSettings
					});
				});
			break;

		case 'duplicateBugs':
			var dupeBug = function (i) {
				bugzilla
					.updateBugs(request.duplicates[i], {
						dupe_of: request.dupeOf,
						comment: { body: 'Marking as duplicate.' }
					})
					.then(function (response) {
						// Dupe the next bug, if there is one to dupe
						if (request.duplicates[i + 1]) {
							dupeBug(i + 1);
						}

						bugzilla
							.updateBugs(request.duplicates[i], {
								status: 'CLOSED',
								comment: { body: 'Closing duplicate.' }
							})
							.then(function (response) {
								chrome.tabs.sendMessage(sender.tab.id, {
									method: 'duplicateFinished',
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

		case 'getFieldInfo':
			bugzilla
				.getFieldInfo(request.fields)

				.then(function (response) {
					chrome.tabs.sendMessage(sender.tab.id, {
						method: 'fieldInfoLoaded',
						response: response,
						settings: request.bugzillaSettings
					});
				})
				.catch(function (response) {
					var faultString = getFaultString(response);

					if (faultString.indexOf('You must log in') > -1) {
						showLoginForm(function () {
							showMilestoneForm(repo);
						});
					}
				});
			break;
	}

	sendResponse({});
});

/* Show the options page when first installed */
chrome.runtime.onInstalled.addListener(async function (details) {
	if (details.reason == 'install') {
		chrome.runtime.sendMessage({ method: 'options' }, function (response) {});
	} else if (details.reason == 'update') {
		// Any need for this?
	}
});
