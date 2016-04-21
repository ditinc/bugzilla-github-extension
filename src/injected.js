'use strict';

var DITBugzillaGitHub = function() {
	var bugUrl = "https://bugzilla.dtec.com/show_bug.cgi?id="; // TODO: make this dynamic
	var bugId;
	var $ = require('github/jquery').default;
	
	var applyExtension = function(contents) {
		linkifyBugNumber(contents);
		showBugDetailsInSidebar(contents);
		injectHoursWorkedInput(contents);
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
			
				var comment = $("#new_comment_field").val();
				if ($.trim(comment).length) {
					window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: $("#workTime").val()}, '*');
				}
			})
			
			/* Syncs line comments with the bug in Bugzilla */
			.off("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']")
			.on("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']", function() {
				if (!bugId) { return; } // Don't continue if we aren't mapped to a bug

				var $form = $(this).closest("form");
				var comment = $form.find("textarea").val();
				var line = $form.find("[name='line']").val();
				var path = $form.find("[name='path']").val();
				if ($.trim(comment).length) {
					if (!line) {
						comment = path + ": " + comment;
					}
					else {
						comment = path + " line " + line + ": " + comment
					}
					window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: 0}, '*');
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
			});
	};

	var linkifyBugNumber = function(contents) {
		var $issueTitle = $(contents).find('.js-issue-title');
		var newHtml = $issueTitle.html();

		if ($issueTitle.length && $issueTitle.children('a').length === 0) {
			var REGEX = /^\[(\d+)\]|^(\d+)|^Bug\s*(\d+)/; // for example, matches [83508], 83508, Bug83508 or Bug 83508
			var matches = $issueTitle.html().match(REGEX);
			
			if (matches && matches.length) {
				bugId = matches[0].match(/\d+/)[0];
				
				/* This will turn the bug number into a link to the bug */
				newHtml = $issueTitle.html().replace(REGEX, '<a href="' + getBugUrl() + '">[' + bugId + ']</a>');
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
											type: "checkbox"
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
											type: "checkbox"
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
	
	createListeners();
	applyExtension(document);
};

new DITBugzillaGitHub();