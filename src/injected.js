'use strict';

var DITBugzillaGitHub = function() {
	var bugUrl = "https://bugzilla.dtec.com/show_bug.cgi?id="; // TODO: make this dynamic
	var bugId;
	var BUG_REGEX = /^\[(\d+)\]|^(\d+)|^Bug\s*(\d+)/i; // for example, matches [83508], 83508, Bug83508 or Bug 83508
	var $ = require('github/jquery').default;
	
	var applyExtension = function(contents) {
		linkifyBugNumber(contents);
		showBugDetailsInSidebar(contents);
		injectHoursWorkedInput(contents);
		injectCommentOptions(contents);
		injectNewPullRequestOptions(contents);
		injectResolveBugCheckbox(contents);
	};
	
	var getBugUrl = function() {
		return bugUrl + bugId;
	}

	var createListeners = function() {
		// This handles partial updates
		var proxied = $.fn.replaceWith;
		$.fn.replaceWith = function(contents) {
			applyExtension(contents);
			return proxied.apply(this, arguments);
		};
		
		var pjaxBeforeReplaceHandler = function(e) {
			applyExtension(e.originalEvent.detail.contents);
		};
		
		$(document)
			/* Allows us to modify content before GitHub renders it... this handles PJAX */
			.off("pjax:beforeReplace", pjaxBeforeReplaceHandler)
			.on("pjax:beforeReplace", pjaxBeforeReplaceHandler)
			
			/* Syncs comments with the bug in Bugzilla */
			.off("click.DITBugzillaGitHub", "#partial-new-comment-form-actions button")
			.on("click.DITBugzillaGitHub", "#partial-new-comment-form-actions button", function() {
				if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
			
				var $form = $(this).closest("form");
				var syncComment = $form.find(".syncComment").prop("checked");
				var resolveBug = $form.find(".resolveBug").prop("checked");
				var comment = (syncComment ? $("#new_comment_field").val() : "");
				var hoursWorked = $("#workTime").val();
				
				if (syncComment && !resolveBug) {
					if ($.trim(comment).length) {
						window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: hoursWorked}, '*');
					}
				}
				else if (resolveBug) {
					var params = {
						status: "RESOLVED",
						resolution: "FIXED",
						"work_time": hoursWorked
					};
					
					if (syncComment) {
						comment += "\r\n\r\n";
					}
					
					comment += "Marking as FIXED.";
					
					params["comment"] = {"body": $.trim(comment)};
				
					window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
				}
			})
			
			/* Syncs line comments with the bug in Bugzilla */
			.off("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']")
			.on("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']", function() {
				if (!bugId) { return; } // Don't continue if we aren't mapped to a bug

				var $form = $(this).closest("form");
				var syncComment = $form.find(".syncComment").prop("checked");
				
				if (syncComment) {
					var comment = $form.find("textarea").val();
					var line = $form.find("[name='line']").val();
					var path = $form.find("[name='path']").val();
					
					if ($.trim(comment).length) {
						if (!line || line === "false") {
							comment = path + ": " + comment;
						}
						else {
							comment = path + " line " + line + ": " + comment
						}
						
						window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: 0}, '*');
					}
				}
			})
			
			/* Make sure we display correct mergeTarget */
			.off("click.DITBugzillaGitHub", "button.js-merge-branch-action")
			.on("click.DITBugzillaGitHub", "button.js-merge-branch-action", function() {
				if (!bugId) { return; } // Don't continue if we aren't mapped to a bug

				var mergeTarget = $(".current-branch").eq(0).children().html();
				var newCodeStatus;
				
				if (mergeTarget === "master") {
					newCodeStatus = "Merged to master/trunk";
				}
				else {
					newCodeStatus = "Merged to parent branch";
				}

				$("#newCodeStatus").html(newCodeStatus);
			})
				
			/* Updates the bug in Bugzilla when merging a pull request */
			.off("click.DITBugzillaGitHub", "button[type='submit'].js-merge-commit-button")
			.on("click.DITBugzillaGitHub", "button[type='submit'].js-merge-commit-button", function() {
				if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
			
				var resolveBug = $("#resolveBug").prop("checked");
				var updateBugCodeStatus = $("#updateBugCodeStatus").prop("checked");
				var mergeTarget = $(".current-branch").eq(0).children().html();
				var params = {};
				var comment = "";
				var newCodeStatus;
					
				/* If we chose to resolve, set to RESOLVED TESTED and comment as much */
				if (resolveBug) {
					comment += "Marking as TESTED.  ";
					params["status"] = "RESOLVED";
					params["resolution"] = "TESTED";
				}
					
				/* Always comment that we merged it */
				comment += "Merged pull request " + $(".gh-header-number").html();
				
				if (mergeTarget === "master") {
					newCodeStatus = "Merged to master/trunk";
					comment += " to master.";
				}
				else {
					newCodeStatus = "Merged to parent branch";
					comment += " to parent branch.";
				}
				comment += " (" + window.location.href + ")";
					
				/* Update code status is we chose to */
				if (updateBugCodeStatus) {
					params["cf_codestatus"] = newCodeStatus;
				}
				
				params["comment"] = {"body": $.trim(comment)};
				
				window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
			})
				
			/* Updates the bug in Bugzilla when creating a pull request */
			.off("click.DITBugzillaGitHub", "#new_pull_request button[type='submit']")
			.on("click.DITBugzillaGitHub", "#new_pull_request button[type='submit']", function() {
				if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
			
				var updateBug = $("#new_pull_request .updateBug").prop("checked");
				var syncComment = $("#new_pull_request .syncComment").prop("checked");
				var comment = "";
				
				if (syncComment) {	
					comment = $("#pull_request_body").val();
				}
				
				if (updateBug || syncComment) {
					/* We want to update the bug when the page is done reloading because the URL should have changed then */
					window.localStorage.setItem("DIT-newPullRequest", true);
					window.localStorage.setItem("DIT-updateBug", updateBug);
					window.localStorage.setItem("DIT-bugId", bugId);
					window.localStorage.setItem("DIT-comment", comment);
				}
			});
	};

	var linkifyBugNumber = function(contents) {
		var $issueTitle = $(contents).find('.js-issue-title');
		var newHtml = $issueTitle.html();

		if ($issueTitle.length && $issueTitle.children('a').length === 0) {
			var matches = $issueTitle.html().match(BUG_REGEX);
			
			if (matches && matches.length) {
				bugId = matches[0].match(/\d+/)[0];
				
				/* This will turn the bug number into a link to the bug */
				newHtml = $issueTitle.html().replace(BUG_REGEX, '<a href="' + getBugUrl() + '">[' + bugId + ']</a>');
			}
			else {
				bugId = null;
			}
		}

		$issueTitle.html(newHtml);
	};
	
	var showBugDetailsInSidebar = function(contents) {
		if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
		var selector = '#partial-discussion-sidebar';
		var $sidebar;
		
		if ($(contents).length === 1 && $(contents).is(selector)) {
			$sidebar = $(contents);
		}
		else {
			try {
				$sidebar = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}
		
		if ($sidebar.length && $sidebar.find("div.sidebar-dit-bugzilla").length === 0) {
			$sidebar.prepend(
				$("<div>")
					.addClass("discussion-sidebar-item sidebar-dit-bugzilla")
					.append(
						$("<h3>")
							.addClass("discussion-sidebar-heading")
							.html("Bugzilla ")
							.append(
								$("<a>")
									.attr("href", getBugUrl())
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
			
			window.postMessage({method: "loadBugDetails", bugId: bugId}, '*');
		}
		else if ($sidebar.length) {
			// Need this line or else we lose previously applied changes.
			$sidebar.html($sidebar.html());
		}
	};
	
	var injectCommentOptions = function(contents) {
		if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
		var selector = '.js-previewable-comment-form';
		var $div;
		
		if ($(contents).length === 1 && $(contents).is(selector)) {
			$div = $(contents);
		}
		else {
			try {
				$div = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}
		
		if ($div.length) {
			$div.each(function(i) {
				var $this = $(this);
				var $form = $this.closest("form"); 

				// Don't do anything if we've already updated previously or if it's an update to an existing comment
				if ($this.find("input.syncComment").length > 0 || $form.is(".js-comment-update") || $form.is(".new-pr-form")) { return; }
				
				var showResolveInput = $form.is(".js-new-comment-form");
				
				if (showResolveInput) {
					$this.find("div.toolbar-help")
						.before(
							$("<div>")
								.addClass("pl-3")
								.html(
									$("<div>")
										.addClass("form-checkbox")
										.append(
											$("<label>")
												.text("Resolve bug " + bugId)
												.append(
													$("<input>")
														.addClass("resolveBug")
														.attr({
															type: "checkbox"
														})
														.prop('checked', false)
												)
										)
										.append(
											$("<p>")
												.addClass("note")
												.html("Set the bug to <strong>RESOLVED FIXED</strong> in Bugzilla.")
										)
								)
						);
				}
			
				$this.find("div.toolbar-help")
					.before(
						$("<div>")
							.addClass("pl-3")
							.html(
								$("<div>")
									.addClass("form-checkbox")
									.append(
										$("<label>")
											.text("Post comment to bug " + bugId)
											.append(
												$("<input>")
													.addClass("syncComment")
													.attr({
														type: "checkbox",
														checked: "checked"
													})
													.prop('checked', true)
											)
									)
									.append(
										$("<p>")
											.addClass("note")
											.html("Add the comment to the bug in Bugzilla.")
									)
							)
					);
			});
		}
		else if ($div.length) {
			// Need this line or else we lose previously applied changes.
			$div.html($div.html());
		}
	};
	
	var injectHoursWorkedInput = function(contents) {
		if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
		var selector = '#partial-new-comment-form-actions';
		var $buttons;
		
		if ($(contents).length === 1 && $(contents).is(selector)) {
			$buttons = $(contents);
		}
		else {
			try {
				$buttons = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}
		
		if ($buttons.length && $buttons.find("input#workTime").length === 0) {
			$buttons
				.append(
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
				)
				.append(
					$("<label>")
						.text("Hours Worked")
						.attr({
							for: "workTime"
						})
						.css({
							float: "right",
							padding: "7px 0"
						})
				);
		}
		else if ($buttons.length) {
			// Need this line or else we lose previously applied changes.
			$buttons.html($buttons.html());
		}
	};
	
	var injectNewPullRequestOptions = function(contents) {
		var selector = 'form#new_pull_request';
		var $form;
		
		if ($(contents).length === 1 && $(contents).is(selector)) {
			$form = $(contents);
		}
		else {
			try {
				$form = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}
		
		if ($form.length) {
			// Figure out the bug number
			var $title = $form.find("input#pull_request_title");
			var matches = $title.val().match(BUG_REGEX);
			
			// Update things if title changes
			$title.off("change.DITBugzillaGitHub");
			$title.on("change.DITBugzillaGitHub", function() {
				$title.off("change.DITBugzillaGitHub");
				injectNewPullRequestOptions(contents);
			});

			if (matches && matches.length) {
				bugId = matches[0].match(/\d+/)[0];
				
				if ($form.find(".bugOptions").length) {
					$form.find(".bugId").html(bugId);
				}
				else {
					$form.find("div.toolbar-help")
						.before(
							$("<div>")
								.addClass("bugOptions pl-3")
								.html(
									$("<div>")
										.addClass("form-checkbox")
										.append(
											$("<label>")
												.html("Update bug <span class='bugId'>" + bugId + "</span> with pull request URL")
												.append(
													$("<input>")
														.addClass("updateBug")
														.attr({
															type: "checkbox",
															checked: "checked"
														})
														.prop('checked', true)
												)
										)
										.append(
											$("<p>")
												.addClass("note")
												.html("Set the pull request URL of the bug in Bugzilla.")
										)
								)
						)
						.before(
							$("<div>")
								.addClass("bugOptions pl-3")
								.html(
									$("<div>")
										.addClass("form-checkbox")
										.append(
											$("<label>")
												.html("Post comment to bug <span class='bugId'>" + bugId + "</span>")
												.append(
													$("<input>")
														.addClass("syncComment")
														.attr({
															type: "checkbox",
															checked: "checked"
														})
														.prop('checked', true)
												)
										)
										.append(
											$("<p>")
												.addClass("note")
												.html("Add the comment to the bug in Bugzilla.")
										)
								)
						);
				}
			}
			else {
				$form.find(".bugOptions").remove();
			}
		}
		else if ($form.length) {
			// Need this line or else we lose previously applied changes.
			$form.html($form.html());
		}
	};
	
	var injectResolveBugCheckbox = function(contents) {
		if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
		var selector = '#partial-pull-merging div.js-merge-methods';
		var $buttons;
		
		if ($(contents).length === 1 && $(contents).is(selector)) {
			$buttons = $(contents);
		}
		else {
			try {
				$buttons = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}
		
		if ($buttons.length && $buttons.find("input#resolveBug").length === 0) {
			var newCodeStatus = "Merged to ";
			var mergeTarget = $(".current-branch").eq(0).children().html();
			
			if (mergeTarget === "master") {
				newCodeStatus += "master/trunk";
			}
			else {
				newCodeStatus += "parent branch";
			}
			
			$buttons
				.append(
					$("<div>")
						.addClass("form-checkbox")
						.append(
							$("<label>")
								.text("Resolve bug " + bugId)
								.attr({
									for: "resolveBug"
								})
								.append(
									$("<input>")
										.attr({
											name: "resolveBug",
											id: "resolveBug",
											type: "checkbox",
											checked: "checked"
										})
										.prop('checked', true)
								)
						)
						.append(
							$("<p>")
								.addClass("note")
								.html("Set the bug to <strong>RESOLVED TESTED</strong> in Bugzilla.")
						)
				)
				.append(
					$("<div>")
						.addClass("form-checkbox")
						.append(
							$("<label>")
								.text("Update code status of bug " + bugId)
								.attr({
									for: "updateBugCodeStatus"
								})
								.append(
									$("<input>")
										.attr({
											name: "updateBugCodeStatus",
											id: "updateBugCodeStatus",
											type: "checkbox",
											checked: "checked"
										})
										.prop('checked', true)
								)
						)
						.append(
							$("<p>")
								.addClass("note")
								.html("Set the bug's code status to <strong id='newCodeStatus'>" + newCodeStatus + "</strong> in Bugzilla.")
						)
				);
		}
		else if ($buttons.length) {
			// Need this line or else we lose previously applied changes.
			$buttons.html($buttons.html());
		}
	};
	
	/* This will send the bug update to Buzilla after the page loads */
	var updateBugForNewPullRequest = function() {
		var newPullRequest = window.localStorage.getItem("DIT-newPullRequest") === "true";
		
		if (newPullRequest) {
			var updateBug = window.localStorage.getItem("DIT-updateBug") === "true";
			var bugId = window.localStorage.getItem("DIT-bugId");
			var comment = window.localStorage.getItem("DIT-comment");
			var pr = window.location.href.split('/').pop();
			var params = {};
			
			comment = "Created pull request #" + pr + ". (" + window.location.href + ")\r\n\r\n" + comment;
			
			params["comment"] = {"body": $.trim(comment)};

			if (updateBug) {
				params["cf_pull_request_number"] = window.location.href;
			}

			window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
			
			window.localStorage.removeItem("DIT-newPullRequest");
			window.localStorage.removeItem("DIT-updateBug");
			window.localStorage.removeItem("DIT-bugId");
			window.localStorage.removeItem("DIT-comment");
		}
	}
	
	createListeners();
	applyExtension(document);
	updateBugForNewPullRequest();
};

new DITBugzillaGitHub();