/**
 * Here, we're setting up a map between Bugzilla product and GitHub repo in the user's storage.
 */
var productMap = {};
chrome.storage.sync.get('productMap', function (obj) {
	if (obj && obj.productMap) {
		productMap = obj.productMap;
	}
});
		
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.message) {
		/* This will reinitialize the plugin when the extension button is pressed */
		case "clicked_browser_action":
			init();
			break;
		/* This will reinitialize the plugin when the tab is updated */
		case "tab_updated":
			chrome.storage.sync.get('productMap', function (obj) {
				if (obj && obj.productMap) {
					productMap = obj.productMap;
				}
				init();
			});
			break;
	}
});

function init() {
	"use strict";
	// This object will be used to interact with Bugzilla
	var bugzilla = new Bugzilla();
	
	// Check the URL to determine if we're in Bugzilla or GitHub
	if (location.href.indexOf("bugzilla") > -1) {
		// We're in Bugzilla
		
		var url = $('#cf_pull_request_number').val();
		
		if (url && url.length) {
			var urlArray = url.split('/');
			var pr = urlArray[urlArray.length - 1];
			
			/* This will put the pull request # as a link next to the bug title */
			if (url) {
				var $bugTitle = $('#summary_alias_container');
				
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
	else if (location.href.indexOf("github") > -1) {
		// We're in GitHub
		
		var repo = location.href.replace(/.*.com\//, '').split('/')[1];
		
		var REGEX = /^\[(\d+)\]|^(\d+)|^Bug\s*(\d+)/; // for example, matches [83508], 83508, Bug83508 or Bug 83508
		var $issueTitle = $('.js-issue-title');
		var bugUrl = "https://bugzilla.dtec.com/show_bug.cgi?id=";
		
		if ($issueTitle.length) {
			var matches = $issueTitle.html().match(REGEX);
			
			if (matches && matches.length) {
				var bugId = matches[0].match(/\d+/)[0];
				bugUrl += bugId;
				
				/* This will turn the bug number into a link to the bug */
				$issueTitle.html(
					$issueTitle.html().replace(REGEX, '<a href="' + bugUrl + '">[' + bugId + ']</a>')
				);
				
				/* This will put a section on the side of the page for displaying info from Bugzilla */
				$("#partial-discussion-sidebar").prepend(
						$("<div>")
							.addClass("discussion-sidebar-item sidebar-dit-bugzilla")
							.append(
								$("<h3>")
									.addClass("discussion-sidebar-heading")
									.html("Bugzilla ")
									.append(
										$("<a>")
											.attr("href", bugUrl)
											.html("[" + bugId + "]")
									)
							)
							.append(
								$("<div>")
									.html(
										$('<p class="reason text-small text-muted">')
											.html("Loading...")
									)
							)
				);
				
				/* Put Bugzilla bug info into side section */
				bugzilla.getBug(bugId).done(function(response) {
					var bugInfo = response[0].bugs[0];
					
					$(".sidebar-dit-bugzilla div")
						.html(
							$('<p class="reason text-small text-muted">')
								.html("Status: " + bugInfo.status)
						)
						.append(
							$('<p class="reason text-small text-muted">')
								.html("Resolution: " + bugInfo.resolution)
						)
						.append(
							$('<p class="reason text-small text-muted">')
								.html("LOE: " + bugInfo.estimated_time)
						)
						.append(
							$('<p class="reason text-small text-muted">')
								.html("Charge Code: " + bugInfo.cf_chargecode)
						)
						.append(
							$('<p class="reason text-small text-muted">')
								.html("Assignee: " + bugInfo.assigned_to)
						)
						.append(
							$('<p class="reason text-small text-muted">')
								.html("QA Contact: " + bugInfo.qa_contact)
						);
				});
				
				/* This will modify the comment form to allow entering Hours Worked and update Bugzilla with the comment */
				$("#workTime").remove();
				$("#partial-new-comment-form-actions button")
					.last()
						.after(
							$("<label>")
								.text("Hours Worked")
								.attr({
									for: "workTime"
								})
								.css({
									float: "right",
									padding: "7px 0"
								})
						)
						.after(
							$("<input>")
								.attr({
									name: "workTime",
									id: "workTime",
									type: "number",
									step: "0.5"
								})
								.css({
									width: "2.5em",
									float: "right",
									margin: "5px"
								})
						);
						
				$("body")
					/* Syncs comments with the bug in Bugzilla */
					.off("click.DITBugzillaGitHub", "#partial-new-comment-form-actions button")
					.on("click.DITBugzillaGitHub", "#partial-new-comment-form-actions button", function() {
						bugzilla.addComment(bugId, $("#new_comment_field").val(), $("#workTime").val());
					})
					
					/* Syncs line comments with the bug in Bugzilla */
					.off("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']")
					.on("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']", function() {
						var $form = $(this).closest("form");
						var comment = $form.find("textarea").val();
						var line = $form.find("[name='line']").val();
						var path = $form.find("[name='path']").val();
						bugzilla.addComment(bugId, path + " line " + line + ": " + comment, 0);
					})
				
					/* Updates the code status in Bugzilla when merging a pull request */
					.off("click.DITBugzillaGitHub", "button[type='submit'].js-merge-commit-button")
					.on("click.DITBugzillaGitHub", "button[type='submit'].js-merge-commit-button", function() {
						var newCodeStatus;
						var comment = "Merged pull request " + $(".gh-header-number").html();
						var mergeTarget = $(".current-branch").eq(0).children().html();
						
						if (mergeTarget === "master") {
							newCodeStatus = "Merged to master/trunk";
							comment += " to master.";
						}
						else {
							newCodeStatus = "Merged to parent branch";
							comment += " to parent branch.";
						}
						
						bugzilla.updateBug(bugId, {"cf_codestatus": newCodeStatus, "comment": {"body": comment}});
					});
			}
		}
		
		if (repo && repo.length > 0 && !productMap[repo] && $("#productMapSelector").length === 0) {
			$("body").before(
				$("<div>")
					.attr({id: "productMapSelector"})
					.addClass("commit-tease")
					.html(
						$("<img>")
							.attr({src: chrome.extension.getURL("icon.png")})
							.css({height: '1.5em', margin: '0 5px', 'vertical-align': 'text-bottom'})
					)
					.append("Bugzilla product not set.  Loading products...")
			);
			
			bugzilla.getProducts().done(function(response) {
				var products = response[0].products.sort(function(a, b) {
					return (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
				});
				$("div#productMapSelector")
					.html(
						$("<img>")
							.attr({src: chrome.extension.getURL("icon.png")})
							.css({height: '1.5em', margin: '0 5px', 'vertical-align': 'text-bottom'})
					)
					.append("Please choose the Bugzilla product this repo is associated with:")
					.append(
						$("<select>")
							.addClass("form-control input-sm")
							.css("margin", "0 5px")
							.append("<option>")
							.append(
								$.map(products, function(el, i) {
									return $("<option>").val(el.name).html(el.name);
								})
							)
					)
					.append(
						$("<button>")
							.html("OK")
							.addClass("btn btn-sm btn-primary")
							.click(function() {
								var selectedProduct = $(this).prev().val();
								productMap[repo] = {
									name: selectedProduct
								};
								chrome.storage.sync.set({productMap: productMap}, function(obj) {
									$("#productMapSelector").remove();
								});
							})
					)
					.append(
						$("<button>")
							.html("Cancel")
							.addClass("btn btn-sm")
							.css("margin", "0 5px")
							.click(function() {
								$("#productMapSelector").remove();
							})
					);
			});
		}
		
		function syncIssues() {
			chrome.storage.local.get('bugs', function(obj) {
				var bugs = obj.bugs[repo] || [];
				var $spans = $("a[href$='/issues']:not([href^='/issues'])").children("span");
				var numTotal = bugs.length;
				if ($spans.eq(0).html() === "Issues") {
					var numIssues = parseInt($spans.eq(1).html(), 10);
					if (productMap[repo]) {
						productMap[repo].numIssues = numIssues;
					}
					numTotal += numIssues;
					$spans.eq(0).html("Issues/Bugs");
				}
				else if (productMap[repo]) {
					numTotal += productMap[repo].numIssues;
				}
				
				$spans.eq(1).html(numTotal);
			});
		}
		
		syncIssues();
		
		$("body")
			/* Lists bugs from Bugzilla in the Issues section */
			.off("click.DITBugzillaGitHub", "a[href$='/issues']:not([href^='/issues'])")
			.on("click.DITBugzillaGitHub", "a[href$='/issues']:not([href^='/issues'])", function() {
				if (!productMap[repo]) {
					return;
				}
				bugzilla.searchBugs({
					product: [productMap[repo].name],
					status: ['NEW','ASSIGNED','REOPENED']
				})
				.done(function(response) {
					var bugs = response[0].bugs;
					
					if (bugs.length > 0) {
						// Make sure the issues list is not empty
						$("div.blankslate")
							.hide()
							.after(
								$('<ul class="table-list table-list-bordered table-list-issues js-navigation-container js-active-navigation-container">')
							);
							
						// Update the numbers
						var bugStruct = {};
						bugStruct[repo] = bugs;
						chrome.storage.local.set({bugs: bugStruct}, function() {
							syncIssues();
						});
					}
					
					var $ul = $("ul.table-list-issues");
					
					$.each(response[0].bugs, function(){
						$ul.append(
							$('<li class="selectable read table-list-item js-navigation-item js-issue-row">')
								.append('<label class="table-list-cell table-list-cell-checkbox">')
								.append('<div class="table-list-cell table-list-cell-type">')
								.append(
									$('<div class="table-list-cell issue-title">')
										.append(
											$('<a href="' + bugUrl + this.id + '" class="issue-title-link js-navigation-open">')
												.append('[' + this.id + '] ' + this.summary)
										)
										.append(
											$('<div class="issue-meta">')
												.append('<span class="issue-meta-section opened-by">Bug reported <time datetime="' + this.creation_time + '" is="relative-time"></time> by ' + this.creator + '</span>')
												.append(
													$('<span class="issue-meta-section css-truncate issue-milestone">')
														.append(
															$('<a class="milestone-link muted-link css-truncate tooltipped tooltipped-s" aria-label="View all issues in this milestone" href="/ditinc/35B/milestones/' + encodeURIComponent(this.target_milestone) + '">')
																.append('<svg aria-hidden="true" class="octicon octicon-milestone" height="16" version="1.1" viewBox="0 0 14 16" width="14"><path d="M8 2H6V0h2v2z m4 5H2c-0.55 0-1-0.45-1-1V4c0-0.55 0.45-1 1-1h10l2 2-2 2zM8 4H6v2h2V4z m-2 12h2V8H6v8z"></path></svg>')
																.append('<span class="css-truncate-target">&nbsp;' + this.target_milestone + '</span>')
          												)
          										)
										)
								)
								.append('<div class="table-list-cell table-list-cell-avatar">')
								.append('<div class="table-list-cell issue-comments">')
						);
					});
				});
			})
	}
}