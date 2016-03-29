chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.message) {
		/* This will reinitialize the plugin when the extension button is pressed */
		case "clicked_browser_action":
			init();
			break;
		/* This will reinitialize the plugin when the tab is updated */
		case "tab_updated":
			init();
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
		
		var REGEX = /^\[(\d+)\]|^(\d+)|^Bug (\d+)/; // for example, matches [83508], 83508 or Bug 83508
		var $issueTitle = $('.js-issue-title');
		
		if ($issueTitle.length) {
			var matches = $issueTitle.html().match(REGEX);
			
			if (matches && matches.length) {
				var bugId = matches[0].match(/\d+/)[0];
				
				/* This will turn the bug number into a link to the bug */
				$issueTitle.html(
					$issueTitle.html().replace(REGEX, '<a href="https://bugzilla.dtec.com/show_bug.cgi?id=' + bugId + '">[' + bugId + ']</a>')
				);
				
				/* This will modify the comment form to allow entering Hours Worked and update Bugzilla with the comment */
				$("#partial-new-comment-form-actions button")
					.off("click")
					.on("click", function() {
						bugzilla.addComment(bugId, $("#new_comment_field").val(), $("#workTime").val());
					})
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
				
				/* This will put a section on the side of the page for displaying info from Bugzilla */
				bugzilla.getBug(bugId).success(function(response) {
					var bugInfo = response[0].bugs[0];
					console.log(bugInfo);
					
					$("#partial-discussion-sidebar").prepend(
						$("<div>")
							.addClass("discussion-sidebar-item sidebar-dit-bugzilla")
							.append(
								$("<h3>")
									.addClass("discussion-sidebar-heading")
									.html("Bugzilla")
							)
							.append(
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
							)
					);
				});
			}
		}
	}
}