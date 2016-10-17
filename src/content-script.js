'use strict';

chrome.storage.sync.get(
	STORAGE_DEFAULTS, 
	function(settings) {
		if (settings.bugzillaURL.length > 0 && settings.gitHubURL.length > 0) {
			run(settings);
		}
	}
);

// Make the icon active when we're on our GitHub or Bugzilla pages
function activateIcon() {
	chrome.runtime.sendMessage({method: "icon"}, function(response) {});
}

function run(settings) {
	// Check the URL to determine if we're in Bugzilla or GitHub
	if (location.href.indexOf(settings.bugzillaURL) > -1) {
		// We're in Bugzilla
		activateIcon();
		
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
		
		// This object will be used to interact with Bugzilla.
		var bugzilla = new Bugzilla(settings);
		
		var $form = $('form[name="changeform"]');

		$form.find('input#check_all').after(
			$("<input>")
				.attr({
					type: "button",
					id: "dupe_selected",
					value: "Mark as Duplicate"
				})
				.css("margin-left", "4px")
				.click(function() {
					var dupes = $('.bz_checkbox_column :checked').map(function() {
						return this.name.replace("id_", "");
					}).toArray();
					
					if (dupes.length) {
						var dupeOf = prompt("Please enter the " + settings.terms.bug + " to mark the selected " + settings.terms.bug + "s as duplicates of.");
						
						if (dupeOf) {
							$(this).prop("disabled", true).val("Marking as duplicate of " + dupeOf + "...");
							
							// Have to mark each one as a dupe individually
							var dupeBug = function(i) {
								bugzilla
									.updateBugs(dupes[i], {"dupe_of": dupeOf, "comment": {"body": "Marking as duplicate."}})
									.success(function(response) {
										// Dupe the next bug, if there is one to dupe
										if (dupes[i+1]) {
											dupeBug(i+1);
										}
									
										// Close this bug now that it's duped
										bugzilla
											.updateBugs(dupes[i], {"status": "CLOSED", "comment": {"body": "Closing duplicate."}})
											.success(function() {
												// Go to the real bug if there is nothing left to update
												if (!dupes[i+1]) {
													window.location.href = settings.bugzillaURL + "/show_bug.cgi?id=" + dupeOf;
												}
											});
									});
							};
							
							dupeBug(0);
						}
					}
					else {
						alert("You must select at least one " + settings.terms.bug + " to mark as duplicate.");
					}
				})
		);
	}
	else if (location.href.indexOf(settings.gitHubURL) > -1) {
		// We're in GitHub
		activateIcon();
		
		// This injects the script that requires access to the window object into the DOM.
		var s = document.createElement('script');
		s.src = chrome.extension.getURL('src/injected.js');
		s.onload = function() {
			this.parentNode.removeChild(this);
			
			var product;
			var repo = location.href.replace(/.*.com\//, '').split('/')[1];
					
			if (repo && repo.length > 0 && settings.productMap[repo]) {
				product = settings.productMap[repo];
			}
			
			window.postMessage({method: "init", settings: settings, product: product}, '*');
		};
		(document.head || document.documentElement).appendChild(s);
		
		// This object will be used to interact with Bugzilla.
		var bugzilla = new Bugzilla(settings);
		
		// This object will be used to map GitHub repos with Bugzilla products.
		var productMap = settings.productMap;
		
		// These will be used to cache info from Bugzilla.
		var products = [];
		var milestones = [];
		
		// We'll accept messages from the injected script in order to make calls to Bugzilla.
		window.addEventListener('message', function(event) {
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
					loadBugDetails(message);
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
					showProductForm();
					break;
				
				/* Shows a select control for Bugzilla milestone */
				case "showMilestoneForm":
					showMilestoneForm();
					break;
				
				/* Sends comment to Bugzilla */
				case "addComment":
					bugzilla.addComment(message.bugId, message.comment, message.hoursWorked);
					break;
					
				/* Updates bug details */
				case "updateBug":
					bugzilla.updateBug(message.bugId, message.params).done(function() {
						// Update the bug details when it's finished updating
						loadBugDetails(message);
					});
					break;
					
				/* Updates bug details */
				case "updateBugs":
					bugzilla.updateBugs(message.bugIds, message.params);
					break;
			}
		});
		
		function syncProductMap() {
			// Here, we're setting up a map between Bugzilla product and GitHub repo in the user's storage.
			chrome.storage.sync.get('productMap', function (obj) {
				if (obj && obj.productMap) {
					productMap = obj.productMap;
					
					var repo = location.href.replace(/.*.com\//, '').split('/')[1];
					
					if (repo && repo.length > 0 && productMap[repo]) {
						window.postMessage({method: "setProduct", product: productMap[repo]}, '*');
					}
				}
			});
		}
		
		function getFaultString(response) {
			return $(response.responseXML).find("fault").find("member").first().find("string").html();
		}
		
		function showProductForm(repo) {
			repo = repo || location.href.replace(/.*.com\//, '').split('/')[1];
			
			var setProduct = function(productName) {
				if (productName === "") {
					delete productMap[repo];
				}
				else {
					productMap[repo] = {
						name: productName
					};
				}
				
				chrome.storage.sync.set({productMap: productMap}, function(obj) {
					window.postMessage({method: "setProduct", product: productMap[repo]}, '*');
				});
			};
			
			var populateProductList = function() {
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
									.keyup(function(e) {
										e.stopPropagation();
										var searchVal = $.trim(this.value);
										
										$(this).parent().parent().find(".select-menu-list .select-menu-item").each(function() {
											var $el = $(this);
											var text = $el.find(".select-menu-item-heading").text();
											
											if(searchVal.length && text.toLowerCase().indexOf(searchVal.toLowerCase()) < 0) {
												$el.hide();
											}
											else {
												$el.show();
											}
										});
									})
									.keydown(function(e) {
										// Stops GitHub's JS interaction from messing us up
										if (e.keyCode === 13) {
											e.stopPropagation();
											
											var name = $div.find(".navigation-focus .select-menu-item-heading").html() || "";
											setProduct(name);
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
							.click(function(e) {
								e.stopPropagation();
								
								setProduct("");
							})
					);
						
				$("input#product-filter-field").focus();
				$div = $div.children("div").last();
				$div.html("");
				
				$.each(products, function(i, el) {
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
							.click(function(e) {
								e.stopPropagation();
								
								setProduct(el.name);
							})
					);
				});
			};
			
			if (products.length === 0) {
				bugzilla.getProducts()
					.fail(function(response) {
						var faultString = getFaultString(response);
						
						if (faultString.indexOf("You must log in") > -1) {
							showLoginForm(function() {
								showProductForm(repo);
							});
						}
					})
					.done(function(response) {
						products = response[0].products.sort(function(a, b) {
							return (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
						});
		
						populateProductList();
					});
			}
			else {
				populateProductList();
			}
		}
		
		function showMilestoneForm(repo) {
			repo = repo || location.href.replace(/.*.com\//, '').split('/')[1];
			
			var setMilestone = function(milestoneName) {
				$("input#milestone_title").val(milestoneName).focus();
				$(".milestone-select-menu .select-menu-modal-holder").hide();
			};
			
			var populateMilestoneList = function() {
				var $div = $(".milestone-select-menu").find(".select-menu-list");
				
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
										id: "milestone-filter-field",
										type: "text",
										placeholder: "Filter milestones",
										autocomplete: "off"
									})
									.keyup(function(e) {
										e.stopPropagation();
										var searchVal = $.trim(this.value);
										
										$(this).parent().parent().find(".select-menu-list .select-menu-item").each(function() {
											var $el = $(this);
											var text = $el.find(".select-menu-item-heading").text();
											
											if(searchVal.length && text.toLowerCase().indexOf(searchVal.toLowerCase()) < 0) {
												$el.hide();
											}
											else {
												$el.show();
											}
										});
									})
									.keydown(function(e) {
										// Stops GitHub's JS interaction from messing us up
										switch(e.keyCode) {
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
							.click(function(e) {
								e.stopPropagation();
								
								setMilestone("");
							})
					);
	
				$("input#milestone-filter-field").focus();
				$div = $div.children("div").last();
				$div.html("");
				
				var values = $.map(milestones, function(milestone) {
					if ($.inArray(productMap[repo].name, milestone.visibility_values) < 0) {
						return;
					}
					else {
						return {name: milestone.name, sortkey: milestone.sortkey};
					}
				});
				
				values.sort(function(a, b) {
					return (a.sortkey < b.sortkey ? -1 : (a.sortkey > b.sortkey ? 1 : 0));
				});
				
				$.each(values, function(i, el) {
					var selected = $("input#milestone_title").val() === el.name;
					
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
							.click(function(e) {
								e.stopPropagation();
								
								setMilestone(el.name);
							})
					);
				});
			};
			
			if (milestones.length === 0) {
				bugzilla.getFieldInfo(["target_milestone"])
					.error(function(response) {
						var faultString = getFaultString(response);
						
						if (faultString.indexOf("You must log in") > -1) {
							showLoginForm(function() {
								showMilestoneForm(repo);
							});
						}
					})
					.success(function(response) {					
						milestones = response[0].fields[0].values;
		
						populateMilestoneList();
					});
			}
			else {
				populateMilestoneList();
			}
		}
		
		function showLoginForm(callback) {
			if ($("#bzLoginForm").length === 0) {
				$(".header").before(
					$("<form>")
						.attr({id: "bzLoginForm"})
						.addClass("commit-tease js-sticky")
						.css("z-index", 100)
						.html(
							$("<div>")
								.addClass("container")
								.html(
									$("<img>")
										.attr({src: chrome.extension.getURL("images/icon48.png")})
										.css({height: '1.5em', margin: '0 5px', 'vertical-align': 'text-bottom'})
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
						.submit(function(e) {
							e.preventDefault();
							
							var $errorLabel = $("#bzLoginForm label");
							var $submitButton = $(this).find("button");
							
							$errorLabel.html("");
							$submitButton.prop("disabled", true);
		
							bugzilla.login($("#bzUsername").val(), $("#bzPassword").val())
								.error(function(response) {
									$errorLabel.html(getFaultString(response));
								})
								.success(function(response) {
									var $form = $("#bzLoginForm");
									if (response[0].token) {
										bugzilla.setToken(response[0].token);
									}
									$form.prev(".is-placeholder").remove();
									$form.remove();
									callback();
								})
								.always(function() {
									$submitButton.prop("disabled", false);
								});
						})
				);
			}
		}
		
		function loadBugDetails(message) {
			var fieldsToShow = $.map(settings.bugInfoFields, function(el) {
				var field = el.field;
				
				field = field
					// We need to remove anything with "bug_" as the prefix so that we get the correct field
					.replace(/^bug_/, "")
				
					// Hours Worked (work_time) is actually actual_time
					.replace("work_time", "actual_time");

				return field;
			});
			var bugInfoPromise = bugzilla.getBug(message.bugId, fieldsToShow);
			var attachmentPromise = bugzilla.getAttachments(message.bugId);
	
			bugInfoPromise
				.error(function(response) {
					var faultString = getFaultString(response);
					
					if (faultString.indexOf("You must log in") > -1) {
						showLoginForm(function() {
							loadBugDetails(message);
						});
					}
				})
				.success(function(response) {
					var bugInfo = response[0].bugs[0];
					var $sidebar = $('.sidebar-dit-bugzilla-details');
		
					$sidebar.html('');
					
					for (var i = 0; i < settings.bugInfoFields.length; i++) {
						var field = fieldsToShow[i];
						var label = settings.bugInfoFields[i].label;
						
						$sidebar.append(
							$('<p class="reason text-small text-muted">')
								.html(label + ": " + bugInfo[field])
						);
					}
						
					attachmentPromise.success(function(response) {
						var attachments = response[0].bugs[message.bugId];
						var $attachments = $(".sidebar-dit-bugzilla-attachments");
		
						attachments = $.grep(attachments, function(attachment) {
							return !attachment.is_obsolete;
						});
						
						if (attachments.length > 0) {
							$attachments.html("");
							for (var i = 0; i < attachments.length; i++) {
								var attachment = attachments[i];
								$attachments.append(
									$('<p class="reason text-small text-muted">')
										.html('<a href="' + bugzilla.attachmentUrl + '?id=' + attachment.id + '">' + attachment.summary + '</a>')
								)
							}
						}
						else {
							$attachments.html(
								$('<p class="reason text-small text-muted">')
									.html("No attachments")
							);
						}
					});
				});
		}
		
		function loadBugLinkTitles(message) {
			bugzilla.getBugs(message.bugIds, ["summary", "id"])
				.error(function(response) {
					var faultString = getFaultString(response);
					
					if (faultString.indexOf("You must log in") > -1) {
						showLoginForm(function() {
							loadBugDetails(message);
						});
					}
				})
				.success(function(response) {
					var bugInfo = response[0].bugs;

					for (var i = 0; i < bugInfo.length; i++) {
						var bugId = bugInfo[i].id;
						var title = bugInfo[i].summary;
						$("a.bzLink[name='" + bugId + "']")
							.addClass("tooltipped tooltipped-s")
							.attr("aria-label", title);
					}
				});
		}
		
		function setPullRequestTitleToBugTitle(message) {
			var bugInfoPromise = bugzilla.getBug(message.bugId, ["summary"]);
	
			bugInfoPromise
				.error(function(response) {
					var faultString = getFaultString(response);
					
					if (faultString.indexOf("You must log in") > -1) {
						showLoginForm(function() {
							setPullRequestTitleToBugTitle(message);
						});
					}
				})
				.success(function(response) {
					var bugInfo = response[0].bugs[0];
					var $title = $('#pull_request_title');

					$title.val("[" + message.bugId + "] " + bugInfo.summary);
				});
		}
	}
}