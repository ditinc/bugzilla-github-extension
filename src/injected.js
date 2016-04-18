'use strict';

var DITBugzillaGitHub = function() {
	var bugUrl = "https://bugzilla.dtec.com/show_bug.cgi?id="; // TODO: make this dynamic
	var bugId;
	var $ = require('github/jquery').default;
	
	var applyExtension = function(contents) {
		linkifyBugNumber(contents);
		showBugDetailsInSidebar(contents);
		injectHoursWorkedInput(contents);
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
				var comment = $("#new_comment_field").val();
				if ($.trim(comment).length) {
					window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: $("#workTime").val()}, '*');
				}
			})
			
			/* Syncs line comments with the bug in Bugzilla */
			.off("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']")
			.on("click.DITBugzillaGitHub", ".js-inline-comment-form button[type='submit']", function() {
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
				
				window.postMessage({method: "updateBug", bugId: bugId, params: {"cf_codestatus": newCodeStatus, "comment": {"body": comment}}}, '*');
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
		}

		$issueTitle.html(newHtml);
	};
	
	var showBugDetailsInSidebar = function(contents) {
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
	};
	
	var injectHoursWorkedInput = function(contents) {
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
	};
	
	createListeners();
	applyExtension(document);
};

new DITBugzillaGitHub();