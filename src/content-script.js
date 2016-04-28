'use strict';

// Make the icon active when we're on our GitHub or Bugzilla pages
chrome.runtime.sendMessage({}, function(response) {});

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
	// This injects the script that requires access to the window object into the DOM.
	var s = document.createElement('script');
	s.src = chrome.extension.getURL('src/injected.js');
	s.onload = function() {
		this.parentNode.removeChild(this);
	};
	(document.head || document.documentElement).appendChild(s);
	
	// This object will be used to interact with Bugzilla.
	var bugzilla = new Bugzilla();
	
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
		}
	});
	
	function loadBugDetails(message) {
		bugzilla.getBug(message.bugId).done(function(response) {
			var bugInfo = response[0].bugs[0];
			
			$('.sidebar-dit-bugzilla div')
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
	}
}