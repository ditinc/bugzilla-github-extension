'use strict';

var DITBugzillaGitHub = function() {
	var bzUrl = "https://bugzilla.dtec.com"; // TODO: make this dynamic
	var bugUrl = bzUrl + "/show_bug.cgi?id=";
	var bugListUrl = bzUrl + "/buglist.cgi?columnlist=bug_id%2Cbug_severity%2Cpriority%2Cassigned_to%2Cbug_status%2Cresolution%2Ctarget_milestone%2Ccf_codestatus%2Cqa_contact%2Cshort_desc%2Cestimated_time%2Cactual_time&query_format=advanced&order=bug_status%2Cresolution%2Cbug_id";
	var bugId;
	var BUG_REGEX = /^\[(\d+)\]|^(\d+)|^Bug\s*(\d+)/i; // for example, matches [83508], 83508, Bug83508 or Bug 83508
	var $ = require('github/jquery').default;
	var doLabelSync = false;
	var product;
	
	var applyExtension = function(contents) {
		linkifyBugNumber(contents);
		showBugDetailsInSidebar(contents);
		injectProductName(contents);
		injectPageHeadActions(contents);
		injectHoursWorkedInput(contents);
		injectCommentOptions(contents);
		injectNewPullRequestOptions(contents);
		injectResolveBugCheckbox(contents);
		injectReleaseOptions(contents);
		injectMilestoneActions(contents);
		injectNewMilestoneSelect(contents);
		syncLabels(contents);
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
				var reopenBug = $form.find(".reopenBug").prop("checked");
				var comment = (syncComment ? $("#new_comment_field").val() : "");
				var hoursWorked = $("#workTime").val();
				
				if (syncComment && !resolveBug && !reopenBug) {
					if ($.trim(comment).length) {
						window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: hoursWorked}, '*');
					}
				}
				else if (resolveBug || reopenBug) {
					var params = {
						status: (resolveBug ? "RESOLVED" : "REOPENED"),
						resolution: (resolveBug ? "FIXED" : ""),
						"work_time": hoursWorked
					};
					
					if (syncComment) {
						comment += "\r\n\r\n";
					}
					
					comment += (resolveBug ? "Marking as FIXED." : "Setting to REOPENED.");
					
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
			
			/* Make sure we display correct new code status (new release) */
			.off("change.DITBugzillaGitHub", "input#release_prerelease")
			.on("change.DITBugzillaGitHub", "input#release_prerelease", function() {
				var isPreRelease = $("input#release_prerelease").prop("checked");
				var mergeTarget = $(".releases-target-menu span.js-select-button").html();
				var newCodeStatus;
				
				if (!isPreRelease && mergeTarget === "master") {
					newCodeStatus = "In Production";
				}
				else {
					newCodeStatus = "In Staging";
				}

				$(".newCodeStatus").html(newCodeStatus);
			})
			
			/* Make sure we display correct new code status (new release) */
			.off("click.DITBugzillaGitHub", "div.releases-target-menu .select-menu-item")
			.on("click.DITBugzillaGitHub", "div.releases-target-menu .select-menu-item", function(e) {
				var isPreRelease = $("input#release_prerelease").prop("checked");
				var mergeTarget = $(e.currentTarget).find("div").html();
				var newCodeStatus;
				
				if (!isPreRelease && mergeTarget === "master") {
					newCodeStatus = "In Production";
				}
				else {
					newCodeStatus = "In Staging";
				}

				$(".newCodeStatus").html(newCodeStatus);
			})
			
			/* Update bugs in release to In Staging or In Production */
			.off("click.DITBugzillaGitHub", "button.js-publish-release")
			.on("click.DITBugzillaGitHub", "button.js-publish-release", function(e) {
				var $form = $(e.currentTarget).closest("form");
				var tag = $form.find("input#release_tag_name").val();
				var title = $form.find("input#release_name").val();
				var comments = $form.find("textarea").val();
				var updateCodeStatus = $form.find("input#updateCodeStatus").prop("checked");
				var updateRevision = $form.find("input#updateRevision").prop("checked");

				if (comments.length && tag.length && title.length && (updateCodeStatus || updateRevision)) {
					var matches = comments.match(/^(\[(\d+)\]|(\d+)|Bug\s*(\d+))|\n(\[(\d+)\]|(\d+)|Bug\s*(\d+))/ig);
					
					var bugIds = [];
					for (var i = 0; i < matches.length; i++) {
						bugIds.push(matches[i].match(/\d+/)[0]);
					}
					
					if (bugIds.length) {
						var params = {};
						var comment = "";
						
						if (updateRevision) {
							params["cf_revision"] = tag;
							comment += "Bug added to new release: \r\n" + tag + " - " + title;
						}
						
						if (updateCodeStatus) {
							var newCodeStatus = $form.find(".newCodeStatus").html();
							var pushedTo = "Staging.";
							
							if (newCodeStatus === "In Production") {
								pushedTo = "Production.";
							}
							
							comment += (comment.length ? "\r\n\r\n" : "") + "Pushed to " + pushedTo;
							params["cf_codestatus"] = newCodeStatus;
						}
						
						params["comment"] = {"body": comment};
						
						window.postMessage({method: "updateBugs", bugIds: bugIds, params: params}, '*');
					}
				}
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
					
					var labels = $("a.label").map(function() { return $(this).html(); }).toArray().join(' ');
					window.localStorage.setItem("DIT-labels", labels);
				}
			})
			
			.off("click.DITBugzillaGitHub", "div.label-select-menu button.discussion-sidebar-heading")
			.on("click.DITBugzillaGitHub", "div.label-select-menu button.discussion-sidebar-heading", function() {
				var $labels = $("div.label-select-menu");
				
				if (!$labels.is(".active")) {
					// Opened the label menu, so turn on label syncing
					doLabelSync = true;
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
			$sidebar.find(".sidebar-notifications").before(
				$("<div>")
					.addClass("discussion-sidebar-item sidebar-dit-bugzilla")
					.append(
						$("<h3>")
							.addClass("discussion-sidebar-heading")
							.html("Bugzilla Info ")
							.append(
								$("<a>")
									.attr("href", getBugUrl())
									.html("[" + bugId + "]")
							)
					)
					.append(
						$("<div>")
							.addClass("sidebar-dit-bugzilla-details")
							.html(
								$('<p class="reason text-small text-muted">')
									.html("Loading...")
							)
					)
					.append(
						'<h3 class="discussion-sidebar-heading">Attachments</h3>'
					)
					.append(
						$("<div>")
							.addClass("sidebar-dit-bugzilla-attachments")
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
	
	var injectProductName = function(contents) {
		var selector = 'div.repohead-details-container';
		var $el;
		
		if ($(contents).length === 1 && $(contents).is(selector)) {
			$el = $(contents);
		}
		else {
			try {
				$el = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}
		
		$el.find("h6#bzProduct").remove();

		if ($el.length) {
			$el.append(
				$("<h6>")
					.addClass("select-menu js-menu-container js-select-menu product-select-menu")
					.attr({
						id: "bzProduct"
					})
					.css({
						float: "left",
						clear: "both"
					})
					.append(
						$("<a>")
							.attr({
								href: "#"
							})
							.css({
								fill: "currentColor",
								color: "#666"
							})
							.html(product ? product.name : "[Bugzilla product not set]")
							.append('<svg height="16" width="14" class="ml-2" style="vertical-align: bottom;"><path d="M14 8.77V7.17l-1.94-0.64-0.45-1.09 0.88-1.84-1.13-1.13-1.81 0.91-1.09-0.45-0.69-1.92H6.17l-0.63 1.94-1.11 0.45-1.84-0.88-1.13 1.13 0.91 1.81-0.45 1.09L0 7.23v1.59l1.94 0.64 0.45 1.09-0.88 1.84 1.13 1.13 1.81-0.91 1.09 0.45 0.69 1.92h1.59l0.63-1.94 1.11-0.45 1.84 0.88 1.13-1.13-0.92-1.81 0.47-1.09 1.92-0.69zM7 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" /></svg>')
							.click(function(e){
								e.preventDefault();
								$(this).parent().find(".select-menu-modal-holder").show();
								window.postMessage({method: "showProductForm"}, '*');
							})
					)
					.append(
						$("<div>")
							.addClass("select-menu-modal-holder js-menu-content js-navigation-container js-active-navigation-container")
							.html(
								$("<div>")
									.addClass("select-menu-modal")
									.html(
							 			$("<div>")
											.addClass("select-menu-header")
											.append('<svg aria-label="Close" class="octicon octicon-x js-menu-close" height="16" role="img" version="1.1" viewBox="0 0 12 16" width="12"><path d="M7.48 8l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75-1.48-1.48 3.75-3.75L0.77 4.25l1.48-1.48 3.75 3.75 3.75-3.75 1.48 1.48-3.75 3.75z"></path></svg>')
											.append(
												$("<span>")
													.addClass("select-menu-title")
													.html("Select Bugzilla product for this repo")
											)
											.click(function(e) {
												e.stopPropagation();
												
												$(this).closest(".select-menu-modal-holder").hide();
											})
									)
									.append(
										$("<div>")
											.addClass("js-select-menu-deferred-content")
											.html(
												$("<div>")
													.addClass("select-menu-filters")
													.append("<div class='is-loading select-menu-item'>Loading...</div>")
													.append(
														$("<div>")
															.addClass("select-menu-list")
															.append(
																$("<div>")
																	.attr({
																		"data-filterable-for": "products-filter-field",
																		"data-filterable-type": "substring"
																	})
																	.data({
																		"filterable-for": "products-filter-field",
																		"filterable-type": "substring"
																	})
															)
													)
											)
									)
							)
					)
			);
		}
		else if ($el.length) {
			// Need this line or else we lose previously applied changes.
			$el.html($el.html());
		}
	};
	
	var injectPageHeadActions = function(contents) {
		// Don't continue if we aren't mapped to a product
		if (!product) { 
			$("li#bzButtons").remove();
			return;
		}
		var selector = 'ul.pagehead-actions';
		var $ul;
		
		if ($(contents).length === 1 && $(contents).is(selector)) {
			$ul = $(contents);
		}
		else {
			try {
				$ul = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}
		
		$ul.find("li#bzButtons").remove();

		if ($ul.length) {
			$ul.prepend(
				$("<li>")
					.attr({
						id: "bzButtons"
					})
					.addClass("btn-group")
					.html(
						$("<a>")
							.addClass("btn btn-sm")
							.html('<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>')
							.append(" Unresolved")
							.attr({
								href: bugListUrl + "&bug_status=NEW&bug_status=ASSIGNED&bug_status=UNCONFIRMED&bug_status=REOPENED&product=" + encodeURIComponent(product.name),
								target: "_blank"
							})
					)
					.append(
						$("<a>")
							.addClass("btn btn-sm")
							.html('<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>')
							.append(" Resolved")
							.attr({
								href: bugListUrl + "&bug_status=RESOLVED&product=" + encodeURIComponent(product.name),
								target: "_blank"
							})
					)
			);
		}
		else if ($ul.length) {
			// Need this line or else we lose previously applied changes.
			$ul.html($ul.html());
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
														.change(function() {
															var checked = $(this).prop("checked");
															if (checked) {
																$(this.form).find(".reopenBug").prop("checked", false);
															}
														})
												)
										)
										.append(
											$("<p>")
												.addClass("note")
												.html("Set the bug to <strong>RESOLVED FIXED</strong> in Bugzilla.")
										)
								)
						)
						.before(
							$("<div>")
								.addClass("pl-3")
								.html(
									$("<div>")
										.addClass("form-checkbox")
										.append(
											$("<label>")
												.text("Reopen bug " + bugId)
												.append(
													$("<input>")
														.addClass("reopenBug")
														.attr({
															type: "checkbox"
														})
														.prop('checked', false)
														.change(function() {
															var checked = $(this).prop("checked");
															if (checked) {
																$(this.form).find(".resolveBug").prop("checked", false);
															}
														})
												)
										)
										.append(
											$("<p>")
												.addClass("note")
												.html("Set the bug to <strong>REOPENED</strong> in Bugzilla.")
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
	
		var selector = '#partial-pull-merging';
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
		
		if ($div.length && $div.find("input#resolveBug").length === 0) {
			var $buttons = $div.find("div.js-merge-methods");
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
		else if ($div.length) {
			// Need this line or else we lose previously applied changes.
			$div.html($div.html());
		}
	};
	
	var injectReleaseOptions = function(contents) {
		var selector = 'div.new-release';
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
		
		if ($div.length && $div.find("input#updateRevision").length === 0) {
			var mergeTarget = $div.find(".releases-target-menu span.js-select-button").html();
			var $preRelease = $div.find("input#release_prerelease");
			var newCodeStatus = "In Production";

			if ($preRelease.prop("checked") || mergeTarget !== "master") {
				newCodeStatus = "In Staging";
			}
			
			$preRelease.closest("div")
				.after(
					$("<div>")
						.addClass("form-checkbox")
						.append(
							$("<label>")
								.html("Update bugs with release/tag")
								.attr({
									for: "updateRevision"
								})
								.append(
									$("<input>")
										.attr({
											name: "updateRevision",
											id: "updateRevision",
											type: "checkbox",
											checked: "checked"
										})
										.prop('checked', true)
								)
						)
						.append(
							$("<p>")
								.addClass("note")
								.html("Update the bugs referenced in the comments with this release/tag in Bugzilla.")
						)
				)
				.after(
					$("<div>")
						.addClass("form-checkbox")
						.append(
							$("<label>")
								.html("Update bugs to <span  class='newCodeStatus'>" + newCodeStatus + "</span>")
								.attr({
									for: "updateCodeStatus"
								})
								.append(
									$("<input>")
										.attr({
											name: "updateCodeStatus",
											id: "updateCodeStatus",
											type: "checkbox",
											checked: "checked"
										})
										.prop('checked', true)
								)
						)
						.append(
							$("<p>")
								.addClass("note")
								.html("Set the bugs referenced in the comments to <strong class='newCodeStatus'>" + newCodeStatus + "</strong> in Bugzilla.")
						)
				);
		}
		else if ($div.length) {
			// Need this line or else we lose previously applied changes.
			$div.html($div.html());
		}
	};
	
	/* This will send the bug update to Buzilla after the page loads */
	var updateBugForNewPullRequest = function() {
		var newPullRequest = window.localStorage.getItem("DIT-newPullRequest") === "true";
		
		if (newPullRequest) {
			var updateBug = window.localStorage.getItem("DIT-updateBug") === "true";
			var bugId = window.localStorage.getItem("DIT-bugId");
			var comment = window.localStorage.getItem("DIT-comment");
			var labels = window.localStorage.getItem("DIT-labels");
			var pr = window.location.href.split('/').pop();
			var params = {};
			
			comment = "Created pull request #" + pr + ". (" + window.location.href + ")\r\n\r\n" + comment;
			
			params["comment"] = {"body": $.trim(comment)};

			if (updateBug) {
				params["cf_pull_request_number"] = window.location.href;
				params["cf_github_labels"] = labels;
			}

			window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
			
			window.localStorage.removeItem("DIT-newPullRequest");
			window.localStorage.removeItem("DIT-updateBug");
			window.localStorage.removeItem("DIT-bugId");
			window.localStorage.removeItem("DIT-comment");
			window.localStorage.removeItem("DIT-labels");
		}
	}
	
	var injectMilestoneActions = function(contents) {
		// Don't continue if we aren't mapped to a product
		if (!product) { 
			$("div.bzButtons").remove();
			return;
		}
		var selector = 'ul.table-list-milestones';
		var $ul;

		if ($(contents).length === 1 && $(contents).is(selector)) {
			$ul = $(contents);
		}
		else {
			try {
				$ul = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}

		$ul.find("div.bzButtons").remove();

		if ($ul.length) {
			$ul.find("div.milestone-title").each(function() {
				var $this = $(this);
				var milestone = $this.find("h2 a").text();
				
				$this.append(
					$("<span>")
						.addClass("bzButtons")
						.html(
							$("<a>")
								.addClass("btn btn-sm")
								.html('<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>')
								.append(" View in Bugzilla")
								.attr({
									href: bugListUrl + "&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone),
									target: "_blank"
								})
						)
				);
			});
		}
		else if ($ul.length) {
			// Need this line or else we lose previously applied changes.
			$ul.html($ul.html());
		}
	};
	
	var injectNewMilestoneSelect = function(contents) {
		// Don't continue if we aren't mapped to a product
		if (!product) { 
			$("h6.milestone-select-menu").remove();
			return;
		}
		var selector = 'form.new_milestone, form.js-milestone-edit-form';
		var $el;

		if ($(contents).length === 1 && $(contents).is(selector)) {
			$el = $(contents);
		}
		else {
			try {
				$el = $(contents).find(selector);
			}
			catch(e) {
				// I don't know why but sometimes .find() fails if there are nulls
			}
		}

		$el.find("h6.milestone-select-menu").remove();

		if ($el.length) {
			var $input = $el.find("input#milestone_title");
			$input.after(
				$("<h6>")
					.addClass("select-menu js-menu-container js-select-menu milestone-select-menu")
					.attr({
						id: "bzMilestone"
					})
					.append(
						$("<a>")
							.attr({
								href: "#",
								tabindex: $input.attr("tabindex")
							})
							.css({
								fill: "currentColor",
								color: "#666"
							})
							.html("Use Bugzilla milestone...")
							.append('<svg height="16" width="14" class="ml-2" style="vertical-align: bottom;"><path d="M14 8.77V7.17l-1.94-0.64-0.45-1.09 0.88-1.84-1.13-1.13-1.81 0.91-1.09-0.45-0.69-1.92H6.17l-0.63 1.94-1.11 0.45-1.84-0.88-1.13 1.13 0.91 1.81-0.45 1.09L0 7.23v1.59l1.94 0.64 0.45 1.09-0.88 1.84 1.13 1.13 1.81-0.91 1.09 0.45 0.69 1.92h1.59l0.63-1.94 1.11-0.45 1.84 0.88 1.13-1.13-0.92-1.81 0.47-1.09 1.92-0.69zM7 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" /></svg>')
							.click(function(e){
								e.preventDefault();
								$(this).parent().find(".select-menu-modal-holder").show();
								window.postMessage({method: "showMilestoneForm"}, '*');
							})
					)
					.append(
						$("<div>")
							.addClass("select-menu-modal-holder js-menu-content js-navigation-container js-active-navigation-container")
							.html(
								$("<div>")
									.addClass("select-menu-modal")
									.html(
							 			$("<div>")
											.addClass("select-menu-header")
											.append('<svg aria-label="Close" class="octicon octicon-x js-menu-close" height="16" role="img" version="1.1" viewBox="0 0 12 16" width="12"><path d="M7.48 8l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75-1.48-1.48 3.75-3.75L0.77 4.25l1.48-1.48 3.75 3.75 3.75-3.75 1.48 1.48-3.75 3.75z"></path></svg>')
											.append(
												$("<span>")
													.addClass("select-menu-title")
													.html("Select Bugzilla milestone")
											)
											.click(function(e) {
												e.stopPropagation();
												
												$(this).closest(".select-menu-modal-holder").hide();
											})
									)
									.append(
										$("<div>")
											.addClass("js-select-menu-deferred-content")
											.html(
												$("<div>")
													.addClass("select-menu-filters")
													.append("<div class='is-loading select-menu-item'>Loading...</div>")
													.append(
														$("<div>")
															.addClass("select-menu-list")
															.append(
																$("<div>")
																	.attr({
																		"data-filterable-for": "milestones-filter-field",
																		"data-filterable-type": "substring"
																	})
																	.data({
																		"filterable-for": "milestones-filter-field",
																		"filterable-type": "substring"
																	})
															)
													)
											)
									)
							)
					)
			);
		}
		else if ($el.length) {
			// Need this line or else we lose previously applied changes.
			$el.html($el.html());
		}
	};
	
	var syncLabels = function(contents) {
		if (!bugId || !doLabelSync) { return; } // Don't continue if we aren't mapped to a bug or aren't syncing labels
	
		var selector = '.discussion-sidebar-item.sidebar-labels';
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
		
		if ($div.length && $div.find("input#workTime").length === 0) {
			doLabelSync = false;
			
			var labels = $div.find(".labels .label").map(function() { return $(this).html(); });
			
			window.postMessage({method: "updateBug", bugId: bugId, params: {"cf_github_labels": labels.toArray().join(' ')}}, '*');
		}
	};
	
	// We'll accept messages from the content script here
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
			/* Sets the product so we can do product-specific things */
			case "setProduct":
				product = message.product;
				$(".product-select-menu .select-menu-modal-holder").hide();
				
				injectProductName(document);
				injectPageHeadActions(document);
				injectMilestoneActions(document);
				injectNewMilestoneSelect(document);
				break;
		}
	})
	
	createListeners();
	applyExtension(document);
	updateBugForNewPullRequest();
	
	// Plugin is loaded!
	window.postMessage({method: "pluginLoaded"}, '*');
};

new DITBugzillaGitHub();