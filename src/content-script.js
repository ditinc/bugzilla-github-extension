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
	
	function getFaultString(response) {
		return $(response.responseXML).find("fault").find("member").first().find("string").html();
	}
	
	function showLoginForm(callback) {
		if ($("#bzLoginForm").length === 0) {
			$(".header").after(
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
							.append("You are not logged into Bugzilla.  Please login:")
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
								$("#bzLoginForm").prev(".is-placeholder").remove();
								$("#bzLoginForm").remove();
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
		// TODO: make fieldsToShow configurable
		var fieldsToShow = ["status", "resolution", "estimated_time", "cf_chargecode", "assigned_to", "qa_contact"];
		var labels = ["Status", "Resolution", "LOE", "Charge Code", "Assignee", "QA Contact"];
		var bugInfoPromise = bugzilla.getBug(message.bugId, fieldsToShow);
		var attachmentPromise = bugzilla.getAttachments(message.bugId);

		bugInfoPromise
			.error(function(response) {
				var faultString = getFaultString(response);
				
				if (faultString === "You must log in before using this part of DER.") {
					showLoginForm(function() {
						loadBugDetails(message);
					});
				}
			})
			.success(function(response) {
				var bugInfo = response[0].bugs[0];
				var $sidebar = $('.sidebar-dit-bugzilla-details');
	
				$sidebar.html('');
				
				for (var i = 0; i < fieldsToShow.length; i++) {
					var field = fieldsToShow[i];
					var label = labels[i];
					
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
}