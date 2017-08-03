'use strict';

ghImport('jquery').then(function($) {
	var DITBugzillaGitHub = function(settings, product) {
		var bzUrl = settings.bugzillaURL;
		var bugUrl = bzUrl + "/show_bug.cgi?id=";
		var bugListUrl = bzUrl + "/buglist.cgi?human=1&columnlist=" + getFieldListForUrl(settings.bugList.fields) + "&query_format=advanced&order=" + getFieldListForUrl(settings.bugList.sortOrder) + "&list_id=" + Math.floor(Math.random() * 1E10);
		var bugId;
		var BUG_REGEX = new RegExp("^\\[(\\d+)\\]|^(\\d+)|^(Bug|" + settings.terms.bug + ")\\s*(\\d+)", "i"); // for example, matches [83508], 83508, Bug83508 or Bug 83508
		var doLabelSync = false;
		
		var applyExtension = function(contents) {
			linkifyBugNumber(contents);
			showBugDetailsInSidebar(contents);
			injectProductName(contents);
			injectPageHeadActions(contents);
			injectRepoNavLinks(contents);
			injectPullRequestTitleOptions(contents);
			injectHoursWorkedInput(contents);
			injectCommentOptions(contents);
			injectNewPullRequestOptions(contents);
			injectMergeOptions(contents);
			injectReleaseOptions(contents);
			injectMilestoneActions(contents);
			injectNewMilestoneSelect(contents);
			syncLabels(contents);
		};
		
		function getFieldListForUrl(fields) {
			return encodeURIComponent($.map(fields, function(el) {
				var field = el.field;
				
				// work_time is actual_time here
				field = field.replace(/^work_time$/, "actual_time");
				
				return field;
			}));
		}
		
		function editSection(contents, selector, callback) {
			var $el;
			
			if ($(contents).length === 1 && $(contents).is(selector)) {
				$el = $(contents);
			}
			else {
				try {
					$el = $(contents).find(selector);
					if (selector.indexOf(",") < 0) {
						$el = $el.last(); // if we're trying to return only one element, let's just return the last one
					}
				}
				catch(e) {
					// I don't know why but sometimes .find() fails if there are nulls
				}
			}
			
			if ($el.length) {
				callback($el);
			}
		};
		
		var getBugUrl = function(theBugId) {
			theBugId = theBugId || bugId;
			return bugUrl + theBugId;
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
					var hoursWorked = $form.find(".workTime").val();
					
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
				.off("click.DITBugzillaGitHub", ".js-inline-comment-form button[name='single_comment']")
				.on("click.DITBugzillaGitHub", ".js-inline-comment-form button[name='single_comment']", function() {
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
								comment = path + " line " + line + ": " + comment;
							}
							
							window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: 0}, '*');
						}
					}
				})
	
				/* Syncs pull request review comments with the bug in Bugzilla */
				.off("click.DITBugzillaGitHub", ".pull-request-review-menu form button.btn-primary[type='submit'], .review-summary-form-wrapper form button.btn-primary[type='submit']")
				.on("click.DITBugzillaGitHub", ".pull-request-review-menu form button.btn-primary[type='submit'], .review-summary-form-wrapper form button.btn-primary[type='submit']", function() {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
					var isFilesTab = $(this).is(".pull-request-review-menu form button.btn-primary[type='submit']");
					var $form = $(this).closest("form");
					var syncComment = $form.find(".syncComment").prop("checked");
					var syncPendingComments = $form.find(".syncPendingComments").prop("checked");
					
					if (syncComment || syncPendingComments) {
						var summary = $.trim($form.find("textarea").val());
						var reviewType = $form.find("[type='radio']:checked").val();
						var hoursWorked = $form.find(".workTime").val();
						var comment = "Reviewed";
						
						if (reviewType === "approve") {
							comment += " and the changes are approved.";
						}
						else if (reviewType === "reject") {
							comment += " and some changes are required.";
						}
						else {
							comment += " and have some comments.";
						}
						
						if (syncComment && summary.length > 0) {
							comment += "\r\n\r\nReview Summary:\r\n\r\n" + summary;
						}
						
						if (syncPendingComments) {
							var $pendingComments = $("div.is-pending").not(".is-writer");
							
							if ($pendingComments.length > 0) {
								comment += "\r\n\r\nLine Comments:";
								
								$pendingComments.each(function() {
									var $form = $(this);
									var pendingComment = $form.find("textarea").val();
									var line = (
										isFilesTab ? 
											$form.closest(".line-comments.js-addition, .line-comments.js-deletion").parent().prev("tr").children("td[data-line-number]").data("line-number")
										:
											$form.closest(".file").find(".blob-num-deletion.js-linkable-line-number:last(), .blob-num-addition.js-linkable-line-number:last()").data("line-number")
									);
									var path = $.trim($form.closest(".file").find(".file-info a, a.file-info").html());
									
									if ($.trim(pendingComment).length) {
										if (!line || line === "false") {
											pendingComment = path + ": " + pendingComment;
										}
										else {
											pendingComment = path + " line " + line + ": " + pendingComment;
										}
									}
									
									comment += "\r\n\r\n" + pendingComment;
								});
							}
						}
						
						if ((syncComment && summary.length > 0) || (syncPendingComments && $pendingComments.length > 0)) {					
							window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: hoursWorked}, '*');
						}
					}
				})
				
				/* Updates the bug title in Bugzilla with the pull request title */
				.off("click.DITBugzillaGitHub", ".js-issue-update button[type='submit']")
				.on("click.DITBugzillaGitHub", ".js-issue-update button[type='submit']", function() {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
					var $container = $(this).closest(".gh-header-edit");
					var syncTitle = $container.find("input.syncTitle").prop("checked");
	
					if (syncTitle) {
						var summary = $container.find("#issue_title").val();
						
						// Need to remove any reference to the bug number
						summary = $.trim(summary.replace(BUG_REGEX, ""));
						
						if ($.trim(summary).length) {
							window.postMessage({method: "updateBug", bugId: bugId, params: {"summary": summary}}, '*');
						}
					}
					
					$container.find("div.syncTitle").remove();
				})
				
				/* Make sure we display correct mergeTarget */
				.off("click.DITBugzillaGitHub", ".btn-group-merge button[type='submit']")
				.on("click.DITBugzillaGitHub", ".btn-group-merge button[type='submit']", function() {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
					var mergeTarget = $(".commit-ref").eq(0).children().html();
					var newCodeStatus;
					
					if (mergeTarget === "master") {
						newCodeStatus = settings.values.codestatusMerge;
					}
					else {
						newCodeStatus = settings.values.codestatusMergeParent;
					}
	
					$("#newCodeStatus").html(newCodeStatus);
				})
				
				/* Make sure we display correct new code status (new release) */
				.off("change.DITBugzillaGitHub", "input#release_prerelease")
				.on("change.DITBugzillaGitHub", "input#release_prerelease", function() {
					var isPreRelease = $("input#release_prerelease").prop("checked");
					var mergeTarget = $(".release-target-wrapper .js-menu-target span").html();
					var newCodeStatus;
	
					if (!isPreRelease && mergeTarget === "master") {
						newCodeStatus = settings.values.codestatusRelease;
						
						// Also make sure the close option is shown
						$("div.closeBugsDiv").removeClass("d-none").find("#closeBugs").prop("disabled", false);
					}
					else {
						newCodeStatus = settings.values.codestatusPreRelease;
						
						// Also make sure the close option is hidden
						$("div.closeBugsDiv").addClass("d-none").find("#closeBugs").prop("disabled", true);
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
						newCodeStatus = settings.values.codestatusRelease;
						
						// Also make sure the close option is shown
						$("div.closeBugsDiv").removeClass("d-none").find("#closeBugs").prop("disabled", false);
					}
					else {
						newCodeStatus = settings.values.codestatusPreRelease;
						
						// Also make sure the close option is hidden
						$("div.closeBugsDiv").addClass("d-none").find("#closeBugs").prop("disabled", true);
					}
	
					$(".newCodeStatus").html(newCodeStatus);
				})
				
				/* Update bugs in release to new code status */
				.off("click.DITBugzillaGitHub", "button.js-publish-release")
				.on("click.DITBugzillaGitHub", "button.js-publish-release", function(e) {
					var $form = $(e.currentTarget).closest("form");
					var tag = $form.find("input#release_tag_name").val();
					var title = $form.find("input#release_name").val();
					var comments = $form.find("textarea").val();
					var updateCodeStatus = $form.find("input#updateCodeStatus").prop("checked");
					var updateRevision = $form.find("input#updateRevision").prop("checked");
					var $closeBugs = $form.find("input#closeBugs");
					var closeBugs = $closeBugs.prop("checked") && !$closeBugs.prop("disabled");
	
					if (comments.length && tag.length && title.length && (updateCodeStatus || updateRevision || closeBugs)) {
						var matches = comments.match(new RegExp("^(\\[(\\d+)\\]|(\\d+)|(Bug|" + settings.terms.bug + ")\\s*(\\d+))|\\n(\\[(\\d+)\\]|(\\d+)|(Bug|" + settings.terms.bug + ")\\s*(\\d+))", "ig"));
						
						var bugIds = [];
						for (var i = 0; i < matches.length; i++) {
							bugIds.push(matches[i].match(/\d+/)[0]);
						}
						
						if (bugIds.length) {
							var params = {};
							var comment = "";
							
							if (updateRevision) {
								if (settings.fields.revision.length > 0) {
									params[settings.fields.revision] = tag;
								}
								comment += "Added to new release: \r\n" + tag + " - " + title;
							}
							
							if (updateCodeStatus) {
								var newCodeStatus = $form.find(".newCodeStatus").html();
								
								if (newCodeStatus.indexOf("In ") === 0) {
									comment += (comment.length ? "\r\n\r\n" : "") + "Pushed to " + newCodeStatus.replace(/^In\s/, "") + ".";
								}
								
								if (settings.fields.codestatus.length > 0) {
									params[settings.fields.codestatus] = newCodeStatus;
								}
							}
							
							if (closeBugs) {
								params["status"] = "CLOSED";
								comment += (comment.length ? "\r\n\r\n" : "") + "Marking as CLOSED.";
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
					var hoursWorked = $("#workTimeMerge").val();
					var mergeTarget = $(".commit-ref").eq(0).children().html();
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
						newCodeStatus = settings.values.codestatusMerge;
						comment += " to master.";
					}
					else {
						newCodeStatus = settings.values.codestatusMergeParent;
						comment += " to parent branch " + mergeTarget + ".";
					}
					comment += " (" + window.location.href + ")";
						
					/* Update code status is we chose to */
					if (updateBugCodeStatus && settings.fields.codestatus.length > 0) {
						params[settings.fields.codestatus] = newCodeStatus;
					}
					
					params["comment"] = {"body": $.trim(comment)};
					params["work_time"] = hoursWorked;
					
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
						// Opened the label menu, so turn on label syncing (if there is a Bugzilla field defined)
						doLabelSync = true && (settings.fields.gitHubLabels.length > 0);
					}
				});
		};
	
		var linkifyBugNumber = function(contents) {
			var $issueTitle = $(contents).find('.js-issue-title').last();
			var $comments = $(contents).find('.markdown-body p, .markdown-body li, .markdown-body table');
			
			// Issue titles need changing
			if ($issueTitle.length) {
				var newHtml = $.trim($issueTitle.html());
				
				if ($issueTitle.children('a').length === 0) {
					var matches = newHtml.match(BUG_REGEX);
	
					if (matches && matches.length) {
						bugId = matches[0].match(/\d+/)[0];
						
						/* This will turn the bug number into a link to the bug */
						newHtml = newHtml.replace(BUG_REGEX, '<a class="bzLink" name="' + bugId + '" href="' + getBugUrl() + '">[' + bugId + ']</a>');
					}
					else {
						var branch = $(contents).find(".commit-ref").eq(1).children().html() || "";
						matches = branch.match(new RegExp("^(Bug|" + settings.terms.bug + ")[-|_]?\\d+", "i"));
						
						if (matches && matches.length) {
							bugId = matches[0].match(/\d+/)[0];
						
							/* This will add the bug number as a link to the bug */
							newHtml = '<a class="bzLink" name="' + bugId + '" href="' + getBugUrl() + '">[' + bugId + ']</a> ' + newHtml;
						}
						else {
							bugId = null;
						}
					}
				}
	
				$issueTitle.html(newHtml);
			}
			if ($comments.length) {
				$comments.each(function() {
					var $this = $(this);
					var newHtml = $this.html();
					var regex = new RegExp("(\\[(\\d+)\\]|(Bug|" + settings.terms.bug + ")\\s*(\\d+))|\\n(\\[(\\d+)\\]|(Bug|" + settings.terms.bug + ")\\s*(\\d+))", "ig");
					var matches = newHtml.match(regex);
	
					if (matches && matches.length) {
						for (var i = 0; i < matches.length; i++) {
							var theBugId = matches[i].match(/\d+/)[0];
	
							/* This will turn the bug number into a link to the bug */
							newHtml = newHtml.replace(matches[i], '<a class="bzLink" name="' + theBugId + '" href="' + getBugUrl(theBugId) + '">[' + theBugId + ']</a>');
						}
					}
					
					$this.html(newHtml);
				});
			}
			
			var bugIds = $(contents).find("a.bzLink").map(function() {
				return this.name;
			});
			// Remove duplicates
			bugIds = new Set(bugIds);
			bugIds = [...bugIds];
			
			window.postMessage({method: "loadBugLinkTitles", bugIds: bugIds}, '*');
		};
		
		var showBugDetailsInSidebar = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
		
			editSection(contents, '#partial-discussion-sidebar', function($sidebar) {
				if ($sidebar.find("div.sidebar-dit-bugzilla").length === 0) {
					$sidebar.find(".sidebar-notifications").before(
						$("<div>")
							.addClass("discussion-sidebar-item sidebar-dit-bugzilla")
							.append(
								$("<h3>")
									.addClass("discussion-sidebar-heading")
									.html(settings.terms.bugzilla + " Info ")
									.append(
										$("<a>")
											.addClass("bzLink")
											.attr({
												href: getBugUrl(),
												name: bugId
											})
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
				else {
					// Need this line or else we lose previously applied changes.
					$sidebar.html($sidebar.html());
				}
			});
		};
		
		var injectProductName = function(contents) {
			editSection(contents, 'div.repohead-details-container', function($el) {
				$el.find("h6#bzProduct").remove();
	
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
								.html(product ? product.name : "[" + settings.terms.bugzilla + " product not set]")
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
														.html("Select " + settings.terms.bugzilla + " product for this repo")
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
														.append(
															$("<div>")
																.addClass("is-loading p-5")
																.append(
																	$("<img>")
																		.addClass("column centered")
																		.attr({
																			"src": "https://assets-cdn.github.com/images/spinners/octocat-spinner-128.gif",
																			"width": "64px"
																		})
																)
														)
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
			});
		};
		
		var injectPageHeadActions = function(contents) {
			// Don't continue if we aren't mapped to a product
			if (!product) { 
				$("li#bzButtons").remove();
				return;
			}
			
			editSection(contents, 'ul.pagehead-actions', function($ul) {
				$ul.find("li#bzButtons").remove();
	
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
			});
		};
		
		var injectRepoNavLinks = function(contents) {
			editSection(contents, 'nav.reponav', function($nav) {
				$nav.find("a#bzMilestonesButton").remove();
				
				var $a = $nav.children("a").first();
				var href = $a.attr('href');
				href = href.substr(0, href.lastIndexOf('/')) + '/milestones';
				
				// Remove the selected styling from the Issues link when Milestones is selected
				var $issuesLink = $nav.find("a[data-selected-links*=repo_milestones]");
				if ($issuesLink.length === 1) {
					$issuesLink.attr('data-selected-links', $issuesLink.attr('data-selected-links').replace('repo_milestones', ''));
				}
	
				$a.before(
					$("<a>")
						.attr({
							id: 'bzMilestonesButton',
							href: href,
							'data-selected-links': 'repo_milestones new_repo_milestone repo_milestone ' + href,
							'data-hotkey': 'g m'
						})
						.addClass('js-selected-navigation-item reponav-item')
						.html('<svg aria-hidden="true" class="octicon octicon-milestone" height="16" version="1.1" viewBox="0 0 14 16" width="14"><path fill-rule="evenodd" d="M8 2H6V0h2v2zm4 5H2c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h10l2 2-2 2zM8 4H6v2h2V4zM6 16h2V8H6v8z"></path></svg>')
						.append(" Milestones")
				);
			});
		};
		
		var injectPullRequestTitleOptions = function(contents) {
			// Don't continue if we aren't mapped to a bug
			if (!bugId) { 
				$("div.syncTitle").remove();
				return;
			}
			
			editSection(contents, 'div.gh-header-edit', function($div) {
				if ($div.find("div.syncTitle").length === 0) {
					$div.append(
						$("<div>")
							.addClass("pl-3 d-inline-block syncTitle")
							.html(
								$("<div>")
									.addClass("form-checkbox")
									.append(
										$("<label>")
											.text("Update title for " + settings.terms.bug + " " + bugId)
											.append(
												$("<input>")
													.addClass("syncTitle")
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
											.html("Update the title of the " + settings.terms.bug + " in " + settings.terms.bugzilla + ".")
									)
							)
					);
				}
				else {
					// Need this line or else we lose previously applied changes.
					$div.html($div.html());
				}
			});
		};
		
		var injectCommentOptions = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
			editSection(contents, '.js-previewable-comment-form, .pull-request-review-menu, .review-summary-form-wrapper', function($div) {
				$div.each(function(i) {
					var $this = $(this);
					var $form = $this.closest("form"); 
	
					// Don't do anything if we've already updated previously or if it's an update to an existing comment
					if ($this.find("input.syncComment").length > 0 || $form.is(".js-comment-update") || $form.is(".new-pr-form")) { return; }
					
					var showResolveInput = $form.is(".js-new-comment-form");
					
					if (showResolveInput) {
						$this.find("div.preview-content").next()
							.before(
								$("<div>")
									.addClass("pl-3")
									.html(
										$("<div>")
											.addClass("form-checkbox")
											.append(
												$("<label>")
													.text("Resolve " + settings.terms.bug + " " + bugId)
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
													.html("Set the " + settings.terms.bug + " to <strong>RESOLVED FIXED</strong> in " + settings.terms.bugzilla + ".")
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
													.text("Reopen " + settings.terms.bug + " " + bugId)
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
													.html("Set the " + settings.terms.bug + " to <strong>REOPENED</strong> in " + settings.terms.bugzilla + ".")
											)
									)
							);
					}
					
					var isReview = $this.is(".pull-request-review-menu") || $this.is(".review-summary-form-wrapper");
					var toFind = (isReview ? "div.form-checkbox" : "div.float-left");
				
					$this.find(toFind).first()
						.before(
							$("<div>")
								.addClass("pl-3")
								.html(
									$("<div>")
										.addClass("form-checkbox")
										.append(
											$("<label>")
												.text("Post "+ (isReview ? "summary" : "comment") + " to " + settings.terms.bug + " " + bugId)
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
												.html("Add the "+ (isReview ? "summary" : "comment") + " to the " + settings.terms.bug + " in " + settings.terms.bugzilla + (isReview ? "." : " when you click Add Single Comment."))
										)
								),
							(isReview ? 
								$("<div>")
									.addClass("pl-3")
									.html(
										$("<div>")
											.addClass("form-checkbox")
											.append(
												$("<label>")
													.text("Post all pending comments to " + settings.terms.bug + " " + bugId)
													.append(
														$("<input>")
															.addClass("syncPendingComments")
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
													.html("Add the pending comments to the " + settings.terms.bug + " in " + settings.terms.bugzilla + ".")
											)
									)
								: null)
						);
				});
			});
		};
		
		var injectHoursWorkedInput = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
			
			editSection(contents, '#partial-new-comment-form-actions, .pull-request-review-menu .form-actions, .review-summary-form-wrapper .form-actions', function($buttonsArray) {
				$buttonsArray.each(function() {
					var $buttons = $(this);
					if ($buttons.find("input.workTime").length === 0) {
						var isPRComment = $buttons.is('#partial-new-comment-form-actions');
						var id = "workTime" + (new Date()).getTime();
						$buttons
							.append(
								$("<input>")
									.addClass("workTime")
									.attr({
										id: id,
										name: id,
										type: "number",
										step: "0.5"
									})
									.css({
										width: "2.5em",
										float: "right",
										margin: (isPRComment ? "5px" : "3px 5px")
									})
							)
							.append(
								$("<label>")
									.text("Hours Worked")
									.attr({
										for: id
									})
									.css({
										float: "right",
										padding: (isPRComment ? "7px 0" : "6px 0")
									})
							);
					}
					else if (isPRComment) {
						// Need this line or else we lose previously applied changes.
						$buttons.html($buttons.html());
					}
				});
			});
		};
		
		var injectNewPullRequestOptions = function(contents, ignoreBranch) {
			editSection(contents, 'form#new_pull_request', function($form) {
				// Figure out the bug number
				var $title = $form.find("input#pull_request_title");
				var matches;
				
				if (!ignoreBranch) {
					var action = $form.get(0).action;
					var branch = action.substr(action.lastIndexOf("%3A") + 3);
					matches = branch.match(new RegExp("^(Bug|" + settings.terms.bug + "|" + settings.terms.bug.charAt(0) + ")[-|_]?\\d+", "i"));
					
					if (matches && matches.length) {
						bugId = matches[0].match(/\d+/)[0];
						$title.val("[" + bugId + "] Getting " + settings.terms.bug + " title from " + settings.terms.bugzilla + "...");
						window.postMessage({method: "setPullRequestTitleToBugTitle", bugId: bugId}, '*');
					}	
				}
				
				matches = $title.val().match(BUG_REGEX);
				
				// Update things if title changes, and stop trying to use the branch to get the bug number
				$title.off("change.DITBugzillaGitHub");
				$title.on("change.DITBugzillaGitHub", function() {
					$title.off("change.DITBugzillaGitHub");
					injectNewPullRequestOptions(contents, true);
				});
	
				if (matches && matches.length) {
					bugId = matches[0].match(/\d+/)[0];
					
					if ($form.find(".bugOptions").length) {
						$form.find(".bugId").html(bugId);
					}
					else {
						var $div = $form.find("div.preview-content").next();
						
						if (settings.fields.gitHubPullRequestURL.length > 0) {
							$div.before(
								$("<div>")
									.addClass("bugOptions pl-3")
									.html(
										$("<div>")
											.addClass("form-checkbox")
											.append(
												$("<label>")
													.html("Update " + settings.terms.bug + " <span class='bugId'>" + bugId + "</span> with pull request URL")
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
													.html("Set the pull request URL of the " + settings.terms.bug + " in " + settings.terms.bugzilla + ".")
											)
									)
							);
						}
						
						$div.before(
							$("<div>")
								.addClass("bugOptions pl-3")
								.html(
									$("<div>")
										.addClass("form-checkbox")
										.append(
											$("<label>")
												.html("Post comment to " + settings.terms.bug + " <span class='bugId'>" + bugId + "</span>")
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
												.html("Add the comment to the " + settings.terms.bug + " in " + settings.terms.bugzilla + ".")
										)
								)
						);
					}
				}
				else {
					$form.find(".bugOptions").remove();
				}
			});
		};
		
		var injectMergeOptions = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
			editSection(contents, '#partial-pull-merging', function($div) {
				if ($div.find("input#resolveBug").length === 0) {
					var $buttons = $div.find("div.commit-form-actions");
					var mergeTarget = $(".commit-ref").eq(0).children().html();
	
					if (mergeTarget === "master") {
						var newCodeStatus = settings.values.codestatusMerge;
					}
					else {
						var newCodeStatus = settings.values.codestatusMergeParent;
					}
					
					$buttons
						.append(
							$("<label>")
								.addClass("ml-2")
								.text("Hours Worked")
								.attr({
									for: "workTimeMerge"
								})
								.css({
									"vertical-align": "middle"
								})
						)
						.append(
							$("<input>")
								.addClass("ml-1")
								.attr({
									name: "workTimeMerge",
									id: "workTimeMerge",
									type: "number",
									step: "0.5"
								})
								.css({
									width: "2.5em",
									"vertical-align": "middle"
								})
						)
						.append(
							$("<div>")
								.addClass("form-checkbox")
								.append(
									$("<label>")
										.text("Resolve " + settings.terms.bug + " " + bugId)
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
										.html("Set the " + settings.terms.bug + " to <strong>RESOLVED TESTED</strong> in " + settings.terms.bugzilla + ".")
								)
						);
					
					if (settings.fields.codestatus.length > 0) {
						$buttons.append(
							$("<div>")
								.addClass("form-checkbox")
								.append(
									$("<label>")
										.text("Update code status of " + settings.terms.bug + " " + bugId)
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
										.html("Set the " + settings.terms.bug + "'s code status to <strong id='newCodeStatus'>" + newCodeStatus + "</strong> in " + settings.terms.bugzilla + ".")
								)
						);
					}
				}
				else {
					// Need this line or else we lose previously applied changes.
					$div.html($div.html());
				}
			});
		};
		
		var injectReleaseOptions = function(contents) {
			editSection(contents, 'div.new-release', function($div) {
				if ($div.find("input#updateRevision").length === 0) {
					var mergeTarget = $div.find(".release-target-wrapper .js-menu-target span").html();
					var $preRelease = $div.find("input#release_prerelease");
					var newCodeStatus = settings.values.codestatusRelease;
					var showCloseOption = false;
		
					if ($preRelease.prop("checked") || mergeTarget !== "master") {
						newCodeStatus = settings.values.codestatusPreRelease;
					}
					else {
						showCloseOption = true;
					}
	
					var $div = $preRelease.closest("div");
					$div.after(
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
									.html("Update the bugs referenced in the comments with this release/tag in " + settings.terms.bugzilla + ".")
							)
					);
						
					if (settings.fields.codestatus.length > 0) {
						$div.after(
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
										.html("Set the bugs referenced in the comments to <strong class='newCodeStatus'>" + newCodeStatus + "</strong> in " + settings.terms.bugzilla + ".")
								)
						);
					}
						
					$div.after(
						$("<div>")
							.addClass("form-checkbox closeBugsDiv" + (showCloseOption ? "" : " d-none"))
							.append(
								$("<label>")
									.html("Close bugs")
									.attr({
										for: "closeBugs"
									})
									.append(
										$("<input>")
											.attr({
												name: "closeBugs",
												id: "closeBugs",
												type: "checkbox"
											})
											.prop("disabled", !showCloseOption)
									)
							)
							.append(
								$("<p>")
									.addClass("note")
									.html("Set the bugs referenced in the comments to <strong>CLOSED</strong> in " + settings.terms.bugzilla + ".")
							)
					);
				}
				else {
					// Need this line or else we lose previously applied changes.
					$div.html($div.html());
				}
			});
			
			/* Add button to bugs in release when viewing releases */
			if (settings.fields.revision.length) {
				editSection(contents, 'div.release-timeline, div.release-show', function($div) {
					$div.find("span.bzButtons").remove();
		
					$div.find("div.release-header").each(function() {
						var $this = $(this);
						var release = $this.closest("div.release").find("ul.tag-references li a span").text();
						
						$this.prepend(
							$("<span>")
								.addClass("bzButtons")
								.css("float", "right")
								.html(
									$("<a>")
										.addClass("btn btn-sm ml-2")
										.html('<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>')
										.append(" View in " + settings.terms.bugzilla + "")
										.attr({
											href: bugListUrl + "&product=" + encodeURIComponent(product.name) + "&" + settings.fields.revision + "=" + encodeURIComponent(release),
											target: "_blank"
										})
								)
						);
					});
				});
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
					if (settings.fields.gitHubPullRequestURL.length > 0) {
						params[settings.fields.gitHubPullRequestURL] = window.location.href;
					}
					if (settings.fields.gitHubLabels.length > 0) {
						params[settings.fields.gitHubLabels] = labels;
					}
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
			
			/* Add button to milestone when viewing milestones */
			editSection(contents, 'ul.table-list-milestones', function($ul) {
				$ul.find("span.bzButtons").remove();
	
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
									.append(" View in " + settings.terms.bugzilla + "")
									.attr({
										href: bugListUrl + "&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone),
										target: "_blank"
									})
							)
					);
				});
			});
			
			/* Add button to milestone in sidebar */
			editSection(contents, '#partial-discussion-sidebar', function($sidebar) {
				$sidebar.find("#bzButtonMilestone").remove();
				var $a = $sidebar.find("a.milestone-name");
				var milestone = $a.attr("title");
					
				$a.after(
					$("<a>")
						.addClass("btn btn-sm")
						.html('<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>')
						.append(" View in " + settings.terms.bugzilla + "")
						.css({
							width: "100%",
							"text-align": "center",
							"margin-top": "5px"
						})
						.attr({
							id: "bzButtonMilestone",
							href: bugListUrl + "&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone),
							target: "_blank"
						})
				);
			});
			
			/* Add button to milestone when viewing milestone */
			editSection(contents, '.TableObject-item .d-block', function($buttons) {
				$buttons.find("#bzButtonMilestone").remove();
				var $a = $buttons.find("a").filter(function() {
					return $(this).html() === "Edit milestone";
				});
				var milestone = $buttons.closest(".TableObject").find(".text-normal").first().text();
					
				$a.before(
					$("<a>")
						.addClass("btn btn-sm mr-2")
						.html('<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>')
						.append(" View in " + settings.terms.bugzilla + "")
						.attr({
							id: "bzButtonMilestone",
							href: bugListUrl + "&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone),
							target: "_blank"
						})
				);
			});
		};
		
		var injectNewMilestoneSelect = function(contents) {
			// Don't continue if we aren't mapped to a product
			if (!product) { 
				$("h6.milestone-select-menu").remove();
				return;
			}
			
			editSection(contents, 'form.new_milestone, form.js-milestone-edit-form', function($el) {
				$el.find("h6.milestone-select-menu").remove();
	
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
								.html("Use " + settings.terms.bugzilla + " milestone...")
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
														.html("Select " + settings.terms.bugzilla + " milestone")
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
														.append(
															$("<div>")
																.addClass("is-loading p-5")
																.append(
																	$("<img>")
																		.addClass("column centered")
																		.attr({
																			"src": "https://assets-cdn.github.com/images/spinners/octocat-spinner-128.gif",
																			"width": "64px"
																		})
																)
														)
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
			});
		};
		
		var syncLabels = function(contents) {
			if (!bugId || !doLabelSync) { return; } // Don't continue if we aren't mapped to a bug or aren't syncing labels
	
			editSection(contents, '.discussion-sidebar-item.sidebar-labels', function($div) {
				doLabelSync = false;
				
				var labels = $div.find(".labels .label").map(function() { return $(this).html(); });
				var params = {};
				params[settings.fields.gitHubLabels] = labels.toArray().join(' ');
				
				window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
			});
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
	};

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
			case "init":
				new DITBugzillaGitHub(message.settings, message.product);
				break;
		}
	});
});