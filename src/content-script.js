'use strict';
// try {
// 	importScripts("../lib/jquery-3.3.1.min.js");
// } catch (e) {
// 	console.error(e);
// }

chrome.storage.sync.get(
	STORAGE_DEFAULTS,
	function (settings) {
		if (settings.bugzillaURL.length > 0 && settings.gitHubURL.length > 0) {
			run(settings);
		}
	}
);

chrome.runtime.onMessage.addListener((request) => {
	switch (request.method) {
		case "loginFinished":
			var $form = $("#bzLoginForm");
			$form.find("button").prop("disabled", false);
			$form.prev(".is-placeholder").remove();
			$form.remove();
			request.callback();
			break;

		case "loginFailed":
			var $form = $("#bzLoginForm");
			$form.find("button").prop("disabled", false);
			$form.find("label").html(getFaultString(request.response));
			break;

		case "titleLoaded":
			var bugInfo = request.response[0].bugs[0];
			var $title = $('#pull_request_title');

			$title.val("[" + request.bugId + "] " + bugInfo.summary);
			break;

		case "titleLoadFailed":
			var faultString = getFaultString(request.response);

			if (faultString.indexOf("You must log in") > -1) {
				showLoginForm(function () {
					setPullRequestTitleToBugTitle({ bugId: request.bugId });
				}, request.settings);
			}
			break;

		case "titlesLoaded":
			console.log("Got to titlesLoaded", request)
			var bugInfo = request.response[0].bugs;

			for (var i = 0; i < bugInfo.length; i++) {
				var bugId = bugInfo[i].id;
				var title = bugInfo[i].summary;
				$("a.bzLink[name='" + bugId + "']")
					.addClass("tooltipped tooltipped-s")
					.attr("aria-label", title);
			}
			break;

		case "titlesLoadFailed":
			break;

		case "detailsLoaded":
			var bugInfo = request.response.member.find(item => item.name === 'bugs').member;
			var $sidebar = $('.sidebar-dit-bugzilla-details');

			$sidebar.html('');

			for (var i = 0; i < request.settings.bugInfoFields.length; i++) {
				var field = request.fieldsToShow[i];
				var label = request.settings.bugInfoFields[i].label;
				const text = bugInfo.find(item => item.name === field);
				
				$sidebar.append(
					$('<p class="reason text-small text-muted">')
						.html(label + ": " + (text && text.value ? text.value : "Not available"))
				);
			}

			chrome.runtime.sendMessage({
				bugzillaSettings: request.settings,
				method: "getAttachments",
				bugId: request.bugId
			});
			break;

		case "detailsLoadFailed":
			var faultString = getFaultString(request.response);

			if (faultString.indexOf("You must log in") > -1) {
				showLoginForm(function () {
					loadBugDetails(request.bugId, request.settings);
				}, request.settings);
			}
			break;

		case "productsLoaded":
			var products = request.response[0].products.sort(function (a, b) {
				return (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
			});

			populateProductList(products, request.settings.productMap);
			break;

		case "productsLoadFailed":
			var faultString = getFaultString(request.response);

			if (faultString.indexOf("You must log in") > -1) {
				showLoginForm(function () {
					showProductForm([], settings.productMap, settings);
				}, request.settings);
			}
			break;

		case "attachmentsLoaded":
			var attachments = request.response.member.find(item => item.name === 'bugs').member.data
			var $attachments = $(".sidebar-dit-bugzilla-attachments");
			if (attachments) {
				attachments = $.grep(attachments, function (attachment) {
					return !attachment.is_obsolete;
				});
			}

			if (attachments && attachments.length > 0) {
				$attachments.html("");
				for (var i = 0; i < attachments.length; i++) {
					var attachment = attachments[i];
					$attachments.append(
						$('<p class="reason text-small text-muted">')
							.html('<a href="' + request.attachmentUrl + '?id=' + attachment.id + '">' + attachment.summary + '</a>')
					)
				}
			}
			else {
				$attachments.html(
					$('<p class="reason text-small text-muted">')
						.html("No attachments")
				);
			}
			break;

		case "duplicateFinished":
			window.location.href = request.settings.bugzillaURL + "/show_bug.cgi?id=" + request.dupeOf;
			break;

		case "updateFinished":
			loadBugDetails(request.bugId, request.settings);
			break;

		case "fieldInfoLoaded":
			var milestones = request.response[0].fields[0].values;

			populateMilestoneList(milestones, request.settings.productMap);
			break;
	}

	return true;
});

function getRepo() {
	return location.href.replace(/.*.com\//, '').split('/')[1];
}

function getFaultString(response) {
	return $(response.responseXML).find("fault").find("member").first().find("string").html();
}

function populateProductList(products, productMap) {
	var repo = getRepo();
	var $div = $(".product-select-menu").find(".select-menu-list");

	$div.prev(".is-loading").remove();
	$div.prev(".select-menu-clear-item").remove();
	$div.prev(".select-menu-text-filter").remove();

	$div
		.before(
			$("<div>")
				.addClass("select-menu-text-filter")
				.css({
					"padding-bottom": "10px",
					"border-bottom": "1px solid #ddd"
				})
				.html(
					$("<input>")
						.addClass("js-filterable-field js-navigation-enable")
						.attr({
							id: "product-filter-field",
							type: "text",
							placeholder: "Filter products",
							autocomplete: "off"
						})
						.keyup(function (e) {
							e.stopPropagation();
							var searchVal = $.trim(this.value);

							$(this).parent().parent().find(".select-menu-list .select-menu-item").each(function () {
								var $el = $(this);
								var text = $el.find(".select-menu-item-heading").text();

								if (searchVal.length && text.toLowerCase().indexOf(searchVal.toLowerCase()) < 0) {
									$el.hide();
								}
								else {
									$el.show();
								}
							});
						})
						.keydown(function (e) {
							// Stops GitHub's JS interaction from messing us up
							if (e.keyCode === 13) {
								e.stopPropagation();

								var name = $div.find(".navigation-focus .select-menu-item-heading").html() || "";
								setProduct(name, productMap, repo);
							}
						})
						.focus()
				)
		)
		.before(
			$("<div>")
				.addClass("select-menu-clear-item select-menu-item js-navigation-item")
				.attr({
					"data-clear-products": ""
				})
				.data({
					"clear-products": ""
				})
				.html('<svg aria-hidden="true" class="octicon octicon-x select-menu-item-icon" height="16" version="1.1" viewBox="0 0 12 16" width="12"><path d="M7.48 8l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75-1.48-1.48 3.75-3.75L0.77 4.25l1.48-1.48 3.75 3.75 3.75-3.75 1.48 1.48-3.75 3.75z"></path></svg>')
				.append(
					$("<div>")
						.addClass("select-menu-item-text")
						.html("Clear product")
				)
				.click(function (e) {
					e.stopPropagation();

					setProduct("", productMap, repo);
				})
		);

	$("input#product-filter-field").focus();
	$div = $div.children("div").last();
	$div.html("");

	$.each(products, function (i, el) {
		var selected = productMap[repo] && el.name === productMap[repo].name;

		$div.append(
			$("<div>")
				.addClass("select-menu-item js-navigation-item" + (selected ? " selected" : ""))
				.html('<svg aria-hidden="true" class="octicon octicon-check select-menu-item-icon" height="16" version="1.1" viewBox="0 0 12 16" width="12"><path d="M12 5L4 13 0 9l1.5-1.5 2.5 2.5 6.5-6.5 1.5 1.5z"></path></svg>')
				.append(
					$("<div>")
						.addClass("select-menu-item-text")
						.html(
							$("<span>")
								.addClass("select-menu-item-heading")
								.html(el.name)
						)
				)
				.click(function (e) {
					e.stopPropagation();

					setProduct(el.name, productMap, repo);
				})
		);
	});
};

function setProduct(productName, productMap, repo) {
	if (productName === "") {
		delete productMap[repo];
	}
	else {
		productMap[repo] = {
			name: productName
		};
	}

	chrome.storage.sync.set({ productMap: productMap }, function (obj) {
		window.postMessage({ method: "setProduct", product: productMap[repo] }, '*');
	});
};

function populateMilestoneList(milestones, productMap) {
	var repo = getRepo();
	var $div = $(".milestone-select-menu").find(".select-menu-list");

	$div.prev(".is-loading").remove();
	$div.prev(".select-menu-clear-item").remove();
	$div.prev(".select-menu-text-filter").remove();

	$div
		.before(
			$("<div>")
				.addClass("select-menu-text-filter pb-10")
				.css({
					"padding-bottom": "10px",
					"border-bottom": "1px solid #ddd",
					"cursor": "auto"
				})
				.html(
					$("<input>")
						.addClass("js-filterable-field js-navigation-enable")
						.attr({
							id: "milestone-filter-field",
							type: "text",
							placeholder: "Filter milestones",
							autocomplete: "off"
						})
						.keyup(function (e) {
							e.stopPropagation();
							var searchVal = $.trim(this.value);

							$(this).parent().parent().find(".select-menu-list .select-menu-item").each(function () {
								var $el = $(this);
								var text = $el.find(".select-menu-item-heading").text();

								if (searchVal.length && text.toLowerCase().indexOf(searchVal.toLowerCase()) < 0) {
									$el.hide();
								}
								else {
									$el.show();
								}
							});
						})
						.keydown(function (e) {
							// Stops GitHub's JS interaction from messing us up
							switch (e.keyCode) {
								case 13:
									e.preventDefault();
									e.stopPropagation();

									var name = $div.find(".navigation-focus .select-menu-item-heading").html() || "";
									setMilestone(name);
									break;
								case 40:
									e.stopPropagation();

									var $items = $(e.target).closest(".js-menu-container").find(".js-navigation-item");

									if ($items.length) {
										var index = $items.index($(".js-navigation-item.navigation-focus"));
										$items.eq(index).removeClass("navigation-focus");
										var $select = $items.eq(Math.min($items.length - 1, index + 1));
										$select.addClass("navigation-focus");
									}

									break;
								case 38:
									e.stopPropagation();

									var $items = $(e.target).closest(".js-menu-container").find(".js-navigation-item");

									if ($items.length) {
										var index = $items.index($(".js-navigation-item.navigation-focus"));
										$items.eq(index).removeClass("navigation-focus");
										var $select = $items.eq(Math.max(0, index - 1));
										$select.addClass("navigation-focus");
									}

									break;
							}
						})
				)
				.append(
					$("<div>")
						.addClass("pt-2")
						.append(
							$("<label>")
								.append(
									$('<input class="showAllMilestones mr-1 d-inline" type="checkbox" style="width: auto;" />')
										.change(function (e) {
											e.stopPropagation();

											var checked = e.target.checked;
											if (checked) {
												$(".bzInactive").removeClass("d-none");
											} else {
												$(".bzInactive").addClass("d-none");
											}
										})
								)
								.append("Show Inactive Milestones")
						)
				)
		)
		.before(
			$("<div>")
				.addClass("select-menu-clear-item select-menu-item js-navigation-item")
				.attr({
					"data-clear-milestones": ""
				})
				.data({
					"clear-milestones": ""
				})
				.html('<svg aria-hidden="true" class="octicon octicon-x select-menu-item-icon" height="16" version="1.1" viewBox="0 0 12 16" width="12"><path d="M7.48 8l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75-1.48-1.48 3.75-3.75L0.77 4.25l1.48-1.48 3.75 3.75 3.75-3.75 1.48 1.48-3.75 3.75z"></path></svg>')
				.append(
					$("<div>")
						.addClass("select-menu-item-text")
						.html("Clear milestone")
				)
				.click(function (e) {
					e.stopPropagation();

					setMilestone("");
				})
		);

	$("input#milestone-filter-field").focus();
	$div = $div.children("div").last();
	$div.html("");

	var values = $.map(milestones, function (milestone) {
		if ($.inArray(productMap[repo].name, milestone.visibility_values) < 0) {
			return;
		}
		else {
			return { name: milestone.name, sortkey: milestone.sortkey, is_active: milestone.is_active };
		}
	});

	values.sort(function (a, b) {
		return (a.sortkey < b.sortkey ? -1 : (a.sortkey > b.sortkey ? 1 : 0));
	});

	$.each(values, function (i, el) {
		var selected = $("input#milestone_title").val() === el.name;

		$div.append(
			$("<div>")
				.addClass("select-menu-item js-navigation-item" + (selected ? " selected" : "") + (el.is_active ? "" : " bzInactive d-none"))
				.html('<svg aria-hidden="true" class="octicon octicon-check select-menu-item-icon" height="16" version="1.1" viewBox="0 0 12 16" width="12"><path d="M12 5L4 13 0 9l1.5-1.5 2.5 2.5 6.5-6.5 1.5 1.5z"></path></svg>')
				.append(
					$("<div>")
						.addClass("select-menu-item-text")
						.html(
							$("<span>")
								.addClass("select-menu-item-heading")
								.html(el.name)
						)
				)
				.click(function (e) {
					e.stopPropagation();

					setMilestone(el.name);
				})
		);
	});
};

function setMilestone(milestoneName) {
	$("input#milestone_title").val(milestoneName).focus();
	$(".milestone-select-menu .select-menu-modal-holder").hide();
};

function showLoginForm(callback, settings) {
	if ($("#bzLoginForm").length === 0) {
		$(".header").before(
			$("<form>")
				.attr({ id: "bzLoginForm" })
				.addClass("commit-tease js-sticky")
				.css("z-index", 100)
				.html(
					$("<div>")
						.addClass("container")
						.html(
							$("<img>")
								.attr({ src: chrome.runtime.getURL("images/icon48.png") })
								.css({ height: '1.5em', margin: '0 5px', 'vertical-align': 'text-bottom' })
						)
						.append("You are not logged into " + settings.terms.bugzilla + ".  Please login:")
						.append(
							$("<input>")
								.addClass("form-control input-sm ml-3")
								.attr({
									type: "text",
									placeholder: "Username",
									name: "bzUsername",
									id: "bzUsername"
								})
								.css("width", "8em")
						)
						.append(
							$("<input>")
								.addClass("form-control input-sm input-contrast ml-3")
								.attr({
									type: "password",
									name: "bzPassword",
									id: "bzPassword"
								})
								.css("width", "8em")
						)
						.append(
							$("<button>")
								.addClass("btn btn-sm btn-primary ml-3")
								.attr({
									type: "submit"
								})
								.html("Login")
						)
						.append(
							$("<label>")
								.addClass("ml-3 text-red one-fifth")
						)
				)
				.submit(function (e) {
					e.preventDefault();

					var $errorLabel = $("#bzLoginForm label");
					var $submitButton = $(this).find("button");

					$errorLabel.html("");
					$submitButton.prop("disabled", true);

					chrome.runtime.sendMessage({
						bugzillaSettings: settings,
						method: "login",
						username: $("#bzUsername").val(),
						password: $("#bzPassword").val(),
						callback: callback
					});
				})
		);
	}
}

function loadBugDetails(bugId, settings) {
	var fieldsToShow = $.map(settings.bugInfoFields, function (el) {
		var field = el.field;

		field = field
			// We need to remove anything with "bug_" as the prefix so that we get the correct field
			.replace(/^bug_/, "")

			// Hours Worked (work_time) is actually actual_time
			.replace("work_time", "actual_time");

		return field;
	});

	chrome.runtime.sendMessage({
		bugzillaSettings: settings,
		method: "getBug",
		bugId: bugId,
		fieldsToShow: fieldsToShow,
		callbackMessage: "detailsLoaded"
	});
}

function showProductForm(products, productMap, settings) {
	if (products.length === 0) {
		chrome.runtime.sendMessage({
			bugzillaSettings: settings,
			method: "getProducts"
		});
	}
	else {
		populateProductList(products, productMap);
	}
}

function run(settings) {
	// Check the URL to determine if we're in Bugzilla or GitHub
	if (location.href.indexOf(settings.bugzillaURL) > -1) {
		if (settings.fields.gitHubPullRequestURL.length > 0) {
			var url = $('#' + settings.fields.gitHubPullRequestURL).val();

			if (url && url.length) {
				var urlArray = url.split('/');
				var pr = urlArray[urlArray.length - 1];

				/* This will put the pull request # as a link next to the bug title */
				if (url) {
					var $bugTitle = $('#summary_alias_container, #summary_container');

					if ($bugTitle[0]) {
						if ($($bugTitle[0].previousSibling).is("A")) {
							$($bugTitle[0].previousSibling).remove();
						}

						$bugTitle[0].previousSibling.textContent = " - ";

						$bugTitle.before(
							$("<a>")
								.attr({
									"href": url
								})
								.html('[#' + pr + ']')
						);
					}
				}
			}
		}

		var $form = $('form[name="changeform"]');

		$form.find('input#check_all').after(
			$("<input>")
				.attr({
					type: "button",
					id: "dupe_selected",
					value: "Mark as Duplicate"
				})
				.css("margin-left", "4px")
				.click(function () {
					var dupes = $('.bz_checkbox_column :checked').map(function () {
						return this.name.replace("id_", "");
					}).toArray();

					if (dupes.length) {
						var dupeOf = prompt("Please enter the " + settings.terms.bug + " to mark the selected " + settings.terms.bug + "s as duplicates of.");

						if (dupeOf) {
							$(this).prop("disabled", true).val("Marking as duplicate of " + dupeOf + "...");

							chrome.runtime.sendMessage({
								bugzillaSettings: settings,
								method: "duplicateBugs",
								dupeOf: dupeOf,
								duplicates: dupes
							});
						}
					}
					else {
						alert("You must select at least one " + settings.terms.bug + " to mark as duplicate.");
					}
				})
		);
	}
	else if (location.href.indexOf(settings.gitHubURL) > -1) {
		// This injects the script that requires access to the window object into the DOM.
		var s = document.createElement('script');
		s.src = chrome.runtime.getURL('src/injected.js');
		s.onload = function () {
			this.parentNode.removeChild(this);

			var product;
			var repo = getRepo();

			if (repo && repo.length > 0 && settings.productMap[repo]) {
				product = settings.productMap[repo];
			}

			window.postMessage({ method: "init", settings: settings, product: product }, '*');
		};
		(document.head || document.documentElement).appendChild(s);

		// This object will be used to map GitHub repos with Bugzilla products.
		var productMap = settings.productMap;

		// These will be used to cache info from Bugzilla.
		var products = [];
		var milestones = [];

		// We'll accept messages from the injected script in order to make calls to Bugzilla.
		window.addEventListener('message', function (event) {
			// Only accept messages from same frame
			if (event.source !== window) {
				return;
			}

			var message = event.data;

			// Only accept messages that we know are ours
			if (typeof message !== 'object' || message === null || !message.method) {
				return;
			}

			switch (message.method) {
				/* Puts Bugzilla bug info into our sidebar section */
				case "loadBugDetails":
					loadBugDetails(message.bugId, settings);
					break;

				/* Puts Bugzilla bug titles into bug number links */
				case "loadBugLinkTitles":
					loadBugLinkTitles(message);
					break;

				/* Sets the pull request title to the bug title */
				case "setPullRequestTitleToBugTitle":
					setPullRequestTitleToBugTitle(message);
					break;

				/* Shows a select control for Bugzilla product */
				case "showProductForm":
					showProductForm(products, productMap, settings);
					break;

				/* Shows a select control for Bugzilla milestone */
				case "showMilestoneForm":
					showMilestoneForm();
					break;

				/* Sends comment to Bugzilla */
				case "addComment":
					chrome.runtime.sendMessage({
						bugzillaSettings: settings,
						method: "addComment",
						bugId: message.bugId,
						comment: message.comment,
						hoursWorked: message.hoursWorked
					});
					break;

				/* Updates bug details */
				case "updateBug":
					chrome.runtime.sendMessage({
						bugzillaSettings: settings,
						method: "updateBug",
						bugId: message.bugId,
						params: message.params
					});
					break;

				/* Updates bug details */
				case "updateBugs":
					chrome.runtime.sendMessage({
						bugzillaSettings: settings,
						method: "updateBugs",
						bugId: message.bugIds,
						params: message.params
					});
					break;
			}
		});

		function syncProductMap() {
			// Here, we're setting up a map between Bugzilla product and GitHub repo in the user's storage.
			chrome.storage.sync.get('productMap', function (obj) {
				if (obj && obj.productMap) {
					productMap = obj.productMap;

					var repo = getRepo();

					if (repo && repo.length > 0 && productMap[repo]) {
						window.postMessage({ method: "setProduct", product: productMap[repo] }, '*');
					}
				}
			});
		}

		function showMilestoneForm(repo) {
			if (milestones.length === 0) {
				chrome.runtime.sendMessage({
					bugzillaSettings: settings,
					method: "getFieldInfo",
					fields: ["target_milestone"]
				});
			}
			else {
				populateMilestoneList(milestones, productMap);
			}
		}

		function loadBugLinkTitles(message) {
			chrome.runtime.sendMessage({
				bugzillaSettings: settings,
				method: "getBugs",
				bugIds: message.bugIds,
				fieldsToShow: ["summary", "id"],
				callbackMessage: "tilesLoaded"
			});
		}

		function setPullRequestTitleToBugTitle(message) {
			chrome.runtime.sendMessage({
				bugzillaSettings: settings,
				method: "getBug",
				bugId: message.bugId,
				fieldsToShow: ["summary"],
				callbackMessage: "titleLoaded"
			});
		}
	}
}