"use strict";

(function() {
	var DITBugzillaGitHub = function(settings, product) {
		var bzUrl = settings.bugzillaURL;
		var bugUrl = bzUrl + "/show_bug.cgi?id=";
		var bugListUrl = bzUrl + "/buglist.cgi?human=1&columnlist=" + getFieldListForUrl(settings.bugList.fields) + "&query_format=advanced&order=" + getFieldListForUrl(settings.bugList.sortOrder) + "&list_id=" + Math.floor(Math.random() * 1E10);
		var bugId;
		var BUG_REGEX = new RegExp("^\\[(\\d+)\\]|^(\\d+)|^(Bug|" + settings.terms.bug + ")\\s*(\\d+)", "i"); // for example, matches [83508], 83508, Bug83508 or Bug 83508
		var doLabelSync = false;
		
		var matches = function(el, selector) {
			if (!el) {
				return null;
			}
			return (el.matches || el.matchesSelector || el.msMatchesSelector || el.mozMatchesSelector || el.webkitMatchesSelector || el.oMatchesSelector || function (selector) {
		        var node = el, nodes = (node.parentNode || node.document || node).querySelectorAll(selector), i = -1;
		        while (nodes[++i] && nodes[i] !== node);
		        return !!nodes[i];
		    }).call(el, selector);
		};
		
		var closest = function closest(el, selector) {
	        while (el && el.nodeType === 1) {
	            if (matches(el, selector)) {
	                return el;
	            }

	            el = el.parentNode;
	        }

	        return null;
	    };
		
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
			return encodeURIComponent(fields.map(function(el) {
				var field = el.field;
				
				// work_time is actual_time here
				field = field.replace(/^work_time$/, "actual_time");
				
				return field;
			}));
		}
		
		function editSection(contents, selector, callback) {
			if (!contents) { return; }
			var $el;
			
			if (!contents.length && matches(contents, selector)) {
				$el = contents;
			}
			else {
				try {
					if (contents.querySelectorAll) {
						$el = contents.querySelectorAll(selector);
					} else {
						Array.prototype.forEach.call(contents, function(el) {
							if (el && el.querySelectorAll) {
								var $elsFound = el.querySelectorAll(selector);
								if ($elsFound.length) {
									$el = ($el || []).concat(Array.prototype.slice.call($elsFound));
								}
							}
						});
					}
					if (selector.indexOf(",") < 0) {
						$el = $el[$el.length - 1]; // if we're trying to return only one element, let's just return the last one
					}
				}
				catch(e) {
					// I don't know why but sometimes .querySelectorAll() fails if there are nulls
				}
			}
			
			if ($el) {
				callback($el);
			}
		};
		
		var getBugUrl = function(theBugId) {
			theBugId = theBugId || bugId;
			return bugUrl + theBugId;
		}
	
		var createListeners = function() {
			// proxy the html replaceWith instead of jQuery's replaceWith
			var proxiedReplace = HTMLDivElement.prototype.replaceWith;
			
			HTMLDivElement.prototype.replaceWith = function(newNode) {
				var element = newNode.querySelector('div');
				applyExtension(element);
				proxiedReplace.apply(this, arguments);
			}

			var pjaxBeforeReplaceHandler = function(e) {
				applyExtension(e.detail.contents);
			};
			
			/* Allows us to modify content before GitHub renders it... this handles PJAX */
			document.removeEventListener("pjax:beforeReplace", pjaxBeforeReplaceHandler);
			document.addEventListener("pjax:beforeReplace", pjaxBeforeReplaceHandler);

			// proxy the Turbo FrameRenderer's loadFrameElement function to catch navigation
			var proxiedLoadFrameElement = Turbo.FrameRenderer.prototype.loadFrameElement;
			
			Turbo.FrameRenderer.prototype.loadFrameElement = function() {
				proxiedLoadFrameElement.apply(this, arguments);
				applyExtension(this.currentSnapshot.element);
			}

			// proxy the Turbo navigator's visitCompleted function to catch navigation
			var proxiedVisitCompleted = Turbo.navigator.visitCompleted;
			
			Turbo.navigator.visitCompleted = function() {
				proxiedVisitCompleted.apply(this, arguments);
				applyExtension(this.view.element);
			}
				
			var clickHandler = function(event) {
				/* Syncs comments with the bug in Bugzilla */
				if (matches(event.target, "#partial-new-comment-form-actions button")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
				
					var $form = closest(event.target, "form");
					var syncComment = $form.querySelectorAll(".syncComment")[0].checked;
					var resolveBug = $form.querySelectorAll(".resolveBug")[0].checked;
					var reopenBug = $form.querySelectorAll(".reopenBug")[0].checked;
					var comment = (syncComment ? document.querySelectorAll("#new_comment_field")[0].value : "");
					var hoursWorked = $form.querySelectorAll(".workTime")[0].value;
					
					if (syncComment && !resolveBug && !reopenBug) {
						if (comment.trim().length) {
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
						
						params["comment"] = {"body": comment.trim()};
					
						window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
					}
				}
				
				/* Syncs line comments with the bug in Bugzilla */
				if (matches(event.target, ".js-inline-comment-form button[name='single_comment']")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
					var $form = closest(event.target, "form");
					var syncComment = $form.querySelectorAll(".syncComment")[0].checked;
					
					if (syncComment) {
						var comment = $form.querySelectorAll("textarea")[0].value;
						var line = $form.querySelectorAll("[name='line']")[0].value;
						var path = $form.querySelectorAll("[name='path']")[0].value;
						
						if (comment.trim().length) {
							if (!line || line === "false") {
								comment = path + ": " + comment;
							}
							else {
								comment = path + " line " + line + ": " + comment;
							}
							
							window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: 0}, '*');
						}
					}
				}
	
				/* Syncs pull request review comments with the bug in Bugzilla */
				if (matches(event.target, "#review-changes-modal form button.btn-primary[type='submit'], .review-summary-form-wrapper form button.btn-primary[type='submit']")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
					var isFilesTab = matches(event.target, "#review-changes-modal form button.btn-primary[type='submit']");
					var $form = closest(event.target, "form");
					var syncComment = $form.querySelectorAll(".syncComment")[0].checked;
					var syncPendingComments = $form.querySelectorAll(".syncPendingComments")[0].checked;
					
					if (syncComment || syncPendingComments) {
						var summary = $form.querySelectorAll("textarea")[0].value.trim();
						var reviewType = $form.querySelectorAll("[type='radio']:checked")[0].value;
						var hoursWorked = $form.querySelectorAll(".workTime")[0].value;
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
							var $pendingComments = document.querySelectorAll("div.is-pending:not(.is-writer)");
							
							if ($pendingComments.length > 0) {
								comment += "\r\n\r\nLine Comments:";
								
								Array.prototype.forEach.call($pendingComments, function(el, i) {
									var $form = el;
									var pendingComment = $form.querySelectorAll("textarea")[0].value;
									var line = (
										isFilesTab ? 
											closest($form, ".line-comments.js-addition, .line-comments.js-deletion, .line-comments").parentNode.previousElementSibling.querySelectorAll("td[data-line-number]")[0].getAttribute("data-line-number")
										:
											closest($form, ".file").querySelectorAll(".blob-num-deletion.js-linkable-line-number:last(), .blob-num-addition.js-linkable-line-number:last()")[0].getAttribute("data-line-number")
									);
									var path = $form.closest(".file").querySelectorAll(".file-info a, a.file-info")[0].innerHTML.trim();
									
									if (pendingComment.trim().length) {
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
							// Always submit the comment, just in case reopening fails
							window.postMessage({method: "addComment", bugId: bugId, comment: comment, hoursWorked: hoursWorked}, '*');
							
							// If rejecting, try to reopen... this could fail, like when the quark isn't RESOLVED/VERIFIED/CLOSED.
							if (reviewType === "reject") {
								var params = {
									status: "REOPENED",
									resolution: "",
									"comment": {"body": "Setting to REOPENED."}
								};

								window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
							}
						}
					}
				}
				
				/* Updates the bug title in Bugzilla with the pull request title */
				if (matches(event.target, ".js-issue-update button[type='submit']")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
					var $container = closest(event.target, ".gh-header-edit");
					var syncTitle = $container.querySelectorAll("input.syncTitle")[0].checked;
	
					if (syncTitle) {
						var summary = $container.querySelectorAll("#issue_title")[0].value;
						
						// Need to remove any reference to the bug number
						summary = summary.replace(BUG_REGEX, "").trim();
						
						if (summary.trim().length) {
							window.postMessage({method: "updateBug", bugId: bugId, params: {"summary": summary}}, '*');
						}
					}
					
					$container.removeChild($container.querySelector("div.syncTitle"));
				}
				
				/* Make sure we display correct mergeTarget */
				if (matches(event.target, ".btn-group-merge button[type='submit']")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
					var mergeTarget = document.querySelectorAll(".commit-ref")[0].title.split(':')[1];
					var newCodeStatus;
					
					if (mergeTarget === "master") {
						newCodeStatus = settings.values.codestatusMerge;
					}
					else {
						newCodeStatus = settings.values.codestatusMergeParent;
					}
	
					document.querySelectorAll("#newCodeStatus")[0].innerHTML = newCodeStatus;
				}
				
				/* Make sure we display correct new code status (new release) */
				if (matches(event.target, "input#release_prerelease")) {
					var isPreRelease = document.querySelectorAll("input#release_prerelease")[0].checked;
					var mergeTarget = decodeURI(document.querySelectorAll(".js-previewable-comment-form")[0].dataset.previewUrl).split('[target_commitish]=')[1].split('&')[0];
					var newCodeStatus;
	
					if (!isPreRelease && mergeTarget === "master") {
						newCodeStatus = settings.values.codestatusRelease;
						
						// Also make sure the close option is shown
						var $closeBugsDiv = document.querySelectorAll("div.closeBugsDiv")[0]
						$closeBugsDiv.classList.remove("d-none");
						$closeBugsDiv.querySelectorAll("#closeBugs")[0].disabled = false;
					}
					else {
						newCodeStatus = settings.values.codestatusPreRelease;
						
						// Also make sure the close option is hidden
						var $closeBugsDiv = document.querySelectorAll("div.closeBugsDiv")[0]
						$closeBugsDiv.classList.add("d-none");
						$closeBugsDiv.querySelectorAll("#closeBugs")[0].disabled = true;
					}

					document.querySelectorAll(".newCodeStatus")[0].innerHTML = newCodeStatus;
					document.querySelectorAll(".newCodeStatus")[1].innerHTML = newCodeStatus;
				}
				
				/* Make sure we display correct new code status (new release) */
				if (matches(event.target, "div.releases-target-menu .select-menu-item")) {
					var isPreRelease = document.querySelectorAll("input#release_prerelease")[0].checked;
					var mergeTarget = event.target.querySelectorAll("div")[0].innerHTML;
					var newCodeStatus;
	
					if (!isPreRelease && mergeTarget === "master") {
						newCodeStatus = settings.values.codestatusRelease;
						
						// Also make sure the close option is shown
						var $closeBugsDiv = document.querySelectorAll("div.closeBugsDiv")[0]
						$closeBugsDiv.classList.remove("d-none");
						$closeBugsDiv.querySelectorAll("#closeBugs")[0].disabled = false;
					}
					else {
						newCodeStatus = settings.values.codestatusPreRelease;
						
						// Also make sure the close option is hidden
						var $closeBugsDiv = document.querySelectorAll("div.closeBugsDiv")[0]
						$closeBugsDiv.classList.add("d-none");
						$closeBugsDiv.querySelectorAll("#closeBugs")[0].disabled = true;
					}
	
					document.querySelectorAll(".newCodeStatus")[0].innerHTML = newCodeStatus;
				}
				
				/* Update bugs in release to new code status */
				if (matches(event.target, "button.js-publish-release")) {
					var $form = closest(event.target, "form");
					var tag;
					if ($form.id !== 'new_release') {
						tag = $form.action.split('/')[$form.action.split('/').length-1];
					} else {
						tag = $form.querySelectorAll("[name='release[tag_name]']")[0].value;
					}
					var title = $form.querySelectorAll("input#release_name")[0].value;
					var comments = $form.querySelectorAll("textarea")[0].value;
					var updateCodeStatus = $form.querySelectorAll("input#updateCodeStatus")[0].checked;
					var updateRevision = $form.querySelectorAll("input#updateRevision")[0].checked;
					var $closeBugs = $form.querySelectorAll("input#closeBugs")[0];
					var closeBugs = $closeBugs.checked && !$closeBugs.disabled;

					if (comments.length && tag.length && title.length && (updateCodeStatus || updateRevision || closeBugs)) {
						var matched = comments.match(new RegExp("^(\\[(\\d+)\\]|(\\d+)|(Bug|" + settings.terms.bug + ")\\s*(\\d+))|\\n(\\[(\\d+)\\]|(\\d+)|(Bug|" + settings.terms.bug + ")\\s*(\\d+))", "ig"));
						
						var bugIds = [];
						for (var i = 0; i < matched.length; i++) {
							bugIds.push(matched[i].match(/\d+/)[0]);
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
								var newCodeStatus = $form.querySelectorAll(".newCodeStatus")[0].innerHTML;
								
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
				}
				
				/* Makes sure the merge options are loaded before merging */
				if (matches(event.target, "button[type='button'].merge-box-button")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug

					injectMergeOptions(closest(event.target, "div#partial-pull-merging"));
				}
				
				/* Updates the bug in Bugzilla when merging a pull request */
				if (matches(event.target, "button[type='submit'].js-merge-commit-button")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
				
					var resolveBug = document.querySelectorAll("#resolveBug")[0].checked;
					var updateBugCodeStatus = document.querySelectorAll("#updateBugCodeStatus")[0].checked;
					var hoursWorked = document.querySelectorAll("#workTimeMerge")[0].value;
					var mergeTarget = document.querySelectorAll(".commit-ref")[0].title.split(':')[1];
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
					comment += "Merged pull request " + document.querySelectorAll(".gh-header-number")[0].innerHTML;
					
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
					
					params["comment"] = {"body": comment.trim()};
					params["work_time"] = hoursWorked;
					
					window.postMessage({method: "updateBug", bugId: bugId, params: params}, '*');
				}
					
				/* Updates the bug in Bugzilla when creating a pull request */
				if (matches(event.target, "#new_pull_request button[type='submit']")) {
					if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
				
					var updateBug = document.querySelectorAll("#new_pull_request .updateBug")[0].checked;
					var syncComment = document.querySelectorAll("#new_pull_request .syncComment")[0].checked;
					var comment = "";
					
					if (syncComment) {	
						comment = document.querySelectorAll("#pull_request_body")[0].value;
					}
					
					if (updateBug || syncComment) {
						/* We want to update the bug when the page is done reloading because the URL should have changed then */
						window.localStorage.setItem("DIT-newPullRequest", true);
						window.localStorage.setItem("DIT-updateBug", updateBug);
						window.localStorage.setItem("DIT-bugId", bugId);
						window.localStorage.setItem("DIT-comment", comment);
						
						var labelArray = Array.prototype.slice.call(document.querySelectorAll("a.label"));
						var labels = labelArray.map(function(label) { return label.innerHTML; }).join(' ');
						window.localStorage.setItem("DIT-labels", labels);
					}
				}
				
				if ((matches(event.target, ".discussion-sidebar-heading") && event.target.innerText === "Labels")
						|| (matches(event.target.parentNode, ".discussion-sidebar-heading") && event.target.parentNode.innerText === "Labels")) {
					var $labels = document.querySelectorAll("details.label-select-menu")[0];
					
					if (!matches($labels, ".active")) {
						// Opened the label menu, so turn on label syncing (if there is a Bugzilla field defined)
						doLabelSync = true && (settings.fields.gitHubLabels.length > 0);
					}
				}
			}
			
			var boundClickHandler = clickHandler.bind(DITBugzillaGitHub);
			document.removeEventListener("click", boundClickHandler);
			document.addEventListener("click", boundClickHandler);
		}
	
		var linkifyBugNumber = function(contents) {
			if (!contents) { return; }
			var $issueTitle = [];
			var $comments = [];
			
			if (contents.querySelectorAll) {
				$issueTitle = contents.querySelectorAll('.js-issue-title');
				$comments = contents.querySelectorAll('.markdown-body p, .markdown-body li, .markdown-body table');
			} else {
				Array.prototype.forEach.call(contents, function(el) {
					if (el && el.querySelectorAll) {
						var $issueTitles = el.querySelectorAll('.js-issue-title');
						if ($issueTitles.length) {
							$issueTitle = $issueTitle.concat(Array.prototype.slice.call($issueTitles));
						}
					}
				});
				Array.prototype.forEach.call(contents, function(el) {
					if (el && el.querySelectorAll) {
						var $commentsFound = el.querySelectorAll('.markdown-body p, .markdown-body li, .markdown-body table');
						if ($commentsFound.length) {
							$comments = $comments.concat(Array.prototype.slice.call($commentsFound));
						}
					}
				});
			}
			
			// Issue titles need changing
			Array.prototype.forEach.call($issueTitle, function($title) {
				if ($title) {
					var newHtml = $title.innerHTML.trim();
					
					if ($title.querySelectorAll('a').length === 0) {
						var matches = newHtml.match(BUG_REGEX);
		
						if (matches && matches.length) {
							bugId = matches[0].match(/\d+/)[0];
							
							/* This will turn the bug number into a link to the bug */
							newHtml = newHtml.replace(BUG_REGEX, '<a class="bzLink" name="' + bugId + '" href="' + getBugUrl() + '">[' + bugId + ']</a>');
						}
						else {
							var branch = contents.querySelectorAll(".commit-ref")[1].children[0].innerHTML || "";
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
		
					$title.innerHTML = newHtml;
				}
			});

			if ($comments.length) {
				Array.prototype.forEach.call($comments, function(el, i) {
					var $this = el;
					var newHtml = $this.innerHTML;
					var regex = new RegExp("(\\[(\\d+)\\]|(Bug|" + settings.terms.bug + ")\\s*(\\d+))|\\n(\\[(\\d+)\\]|(Bug|" + settings.terms.bug + ")\\s*(\\d+))", "ig");
					var matches = newHtml.match(regex);
	
					if (matches && matches.length) {
						for (var i = 0; i < matches.length; i++) {
							var theBugId = matches[i].match(/\d+/)[0];
	
							/* This will turn the bug number into a link to the bug */
							newHtml = newHtml.replace(matches[i], '<a class="bzLink" name="' + theBugId + '" href="' + getBugUrl(theBugId) + '">[' + theBugId + ']</a>');
						}
					}
					
					$this.innerHTML = newHtml;
				});
			}
			
			var $bzLinks = [];
			if (contents.querySelectorAll) {
				$bzLinks = contents.querySelectorAll("a.bzLink");
				
			} else {
				Array.prototype.forEach.call(contents, function(el) {
					if (el && el.querySelectorAll) {
						var $bzLinksFound = el.querySelectorAll('a.bzLink');
						if ($bzLinksFound.length) {
							$bzLinks = $bzLinks.concat(Array.prototype.slice.call($bzLinksFound));
						}
					}
				});
			}
			
			var bugIds= Array.prototype.slice.call($bzLinks).map(function(link) {
				return link.name;
			});
			
			// Remove duplicates
			bugIds = new Set(bugIds);
			bugIds = [...bugIds];
			
			window.postMessage({method: "loadBugLinkTitles", bugIds: bugIds}, '*');
		};
		
		var showBugDetailsInSidebar = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
		
			editSection(contents, '#partial-discussion-sidebar', function($sidebar) {
				if ($sidebar.querySelectorAll("div.sidebar-dit-bugzilla").length === 0) {
					$sidebar.querySelectorAll(".sidebar-notifications")[0].insertAdjacentHTML('beforebegin',
						`<div class="discussion-sidebar-item sidebar-dit-bugzilla">`
							+ `<h3 class="discussion-sidebar-heading">`
								+ `${settings.terms.bugzilla} Info`
									+ `<a class="bzLink" href=${getBugUrl()} name="${bugId}">`
										+ `[${bugId}]`
									+ `</a>`
							+ `</h3>`
							+ `<div class="sidebar-dit-bugzilla-details">`
								+ `<p class="reason text-small text-muted">Loading...</p>`
							+ `</div>`
							+ `<h3 class="discussion-sidebar-heading">Attachments</h3>`
							+ `<div class="sidebar-dit-bugzilla-attachments">`
								+ `<p class="reason text-small text-muted">Loading...</p>`
							+ `</div>`
						+ `</div>`
					);
					
					window.postMessage({method: "loadBugDetails", bugId: bugId}, '*');
				}
				else {
					// Need this line or else we lose previously applied changes.
					$sidebar.innerHTML = $sidebar.innerHTML;
				}
			});
		};
		
		var injectProductName = function(contents) {
			editSection(contents, 'main#js-repo-pjax-container>div>div>div.flex-auto', function($el) {
				var existingNode = $el.querySelectorAll("h6#bzProduct");
				if (existingNode.length) {
					$el.removeChild(existingNode[0]);	
				}
	
				$el.insertAdjacentHTML('beforeend',
					`<h6 class="select-menu js-menu-container js-select-menu product-select-menu" id="bzProduct" style="float: left; clear: both;">`
						+ `<a href="#" style="fill: currentColor; color: #666;">`
							+ (product ? product.name : "[" + settings.terms.bugzilla + " product not set]")
							+ '<svg height="16" width="14" class="ml-2" style="vertical-align: bottom;"><path d="M14 8.77V7.17l-1.94-0.64-0.45-1.09 0.88-1.84-1.13-1.13-1.81 0.91-1.09-0.45-0.69-1.92H6.17l-0.63 1.94-1.11 0.45-1.84-0.88-1.13 1.13 0.91 1.81-0.45 1.09L0 7.23v1.59l1.94 0.64 0.45 1.09-0.88 1.84 1.13 1.13 1.81-0.91 1.09 0.45 0.69 1.92h1.59l0.63-1.94 1.11-0.45 1.84 0.88 1.13-1.13-0.92-1.81 0.47-1.09 1.92-0.69zM7 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" /></svg>'
						+ `</a>`
						+ `<div class="select-menu-modal-holder js-menu-content js-navigation-container js-active-navigation-container">`
							+ `<div class="select-menu-modal">`
								+ `<div class="select-menu-header">`
									+ '<svg aria-label="Close" class="octicon octicon-x js-menu-close" height="16" role="img" version="1.1" viewBox="0 0 12 16" width="12"><path d="M7.48 8l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75-1.48-1.48 3.75-3.75L0.77 4.25l1.48-1.48 3.75 3.75 3.75-3.75 1.48 1.48-3.75 3.75z"></path></svg>'
									+ `<span class="select-menu-title">`
										+ "Select " + settings.terms.bugzilla + " product for this repo"
									+ `</span>`
								+ `</div>`
								+ `<div class="js-select-menu-deferred-content">`
									+ `<div class="select-menu-filters">`
										+ `<div class="is-loading p-5 text-center">`
											+ `<img class="column" src="https://github.githubassets.com/images/spinners/octocat-spinner-128.gif" width="64px" />`
										+ `</div>`
										+ `<div class="select-menu-list">`
											+ `<div data-filterable-for="products-filter-field" data-filterable-type="substring"></div>`
										+ `</div>`
									+ `</div>`
								+ `</div>`
							+ `</div>`
						+ `</div>`
					+ `</h6>`
				);
				
				$el.querySelectorAll("h6.select-menu a")[0].onclick = function(e) {
					e.preventDefault();
					this.parentNode.querySelectorAll('.select-menu-modal-holder')[0].style.display='block';
					window.postMessage({method: 'showProductForm'}, '*');
				};
				
				$el.querySelectorAll("h6.select-menu div.select-menu-modal-holder div.select-menu-modal div.select-menu-header")[0].onclick = function(e) {
					e.stopPropagation(); 
					closest(this, ".select-menu-modal-holder").style.display = 'none';
				};
			});
		};
		
		var injectPageHeadActions = function(contents) {
			// Don't continue if we aren't mapped to a product
			if (!product) { 
				var nodeToRemove = document.querySelectorAll("li#bzButtons")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				return;
			}
			
			editSection(contents, 'ul.pagehead-actions', function($ul) {
				var nodeToRemove = $ul.querySelectorAll("li#bzButtons")[0];
				if (nodeToRemove) {
					$ul.removeChild(nodeToRemove);
				}
	
				$ul.firstElementChild.insertAdjacentHTML('beforeBegin',
					`<li id="bzButtons" class="btn-group">`
						+ `<a class="btn btn-sm" href="` + bugListUrl + "&bug_status=NEW&bug_status=ASSIGNED&bug_status=UNCONFIRMED&bug_status=REOPENED&product=" + encodeURIComponent(product.name) + `" target="_blank">`
							+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
							+ " Unresolved"
						+ `</a>`
						+ `<a class="btn btn-sm" href="` + bugListUrl + "&bug_status=RESOLVED&product=" + encodeURIComponent(product.name) + `" target="_blank">` 
							+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
							+ " Resolved"
						+ `</a>`
					+ `</li>`
				);
			});
		};
		
		var injectRepoNavLinks = function(contents) {
			editSection(contents, 'nav.js-repo-nav', function($nav) {
				var nodeToRemove = $nav.querySelectorAll("a#bzMilestonesButton")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				
				var $li = $nav.querySelectorAll("li")[1];
				var href = $li.querySelectorAll("a")[0].getAttribute('href');
				href = href.substr(0, href.lastIndexOf('/')) + '/milestones';
				
				// Remove the selected styling from the Issues link when Milestones is selected
				// TODO: No longer works
				//var $issuesLink = $nav.querySelectorAll("a[data-selected-links*=repo_milestones]")[0];
				//if ($issuesLink) {
				//	$issuesLink.setAttribute('data-selected-links', $issuesLink.getAttribute('data-selected-links').replace('repo_milestones', ''));
				//}
	
				$li.insertAdjacentHTML('afterEnd',
					`<li class="d-flex">`
						+ `<a id="bzMilestonesButton" class="js-selected-navigation-item UnderlineNav-item hx_underlinenav-item no-wrap js-responsive-underlinenav-item" data-tab-item="i1issues-tab" data-hotkey="g m" aria-current="false" data-selected-links="repo_milestones ${href}" href="${href}">`
							+ '<svg aria-hidden="true" class="octicon octicon-issue-opened UnderlineNav-octicon d-none d-sm-inline" height="16" version="1.1" viewBox="0 0 14 16" width="14"><path fill-rule="evenodd" d="M8 2H6V0h2v2zm4 5H2c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h10l2 2-2 2zM8 4H6v2h2V4zM6 16h2V8H6v8z"></path></svg>'
							+ `<span data-content="Milestones">Milestones</span>`
							+ `<span title="Not available" class="Counter "></span>`
						+ `</a>`
					+ `</li>`
				);
			});
		};
		
		var injectPullRequestTitleOptions = function(contents) {
			// Don't continue if we aren't mapped to a bug
			if (!bugId) { 
				var nodeToRemove = document.querySelectorAll("div.syncTitle")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				return;
			}
			
			editSection(contents, 'div.gh-header-edit', function($div) {
				if ($div.querySelectorAll("div.syncTitle").length === 0) {
					$div.insertAdjacentHTML('beforeend',
						`<div class="pl-3 d-inline-block syncTitle">`
							+ `<div class="form-checkbox">`
								+ `<label>Update title for ${settings.terms.bug} ${bugId}`
									+ `<input class="syncTitle" type="checkbox" checked />`
								+ `</label>`
								+ `<p class="note">Update the title of the ${settings.terms.bug} in ${settings.terms.bugzilla}.</p>`
							+ `</div>`
						+ `</div>`
					);
				}
				else {
					// Need this line or else we lose previously applied changes.
					$div.innerHTML = $div.innerHTML;
				}
			});
		};
		
		var injectCommentOptions = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
			editSection(contents, '.js-previewable-comment-form, #review-changes-modal, .review-summary-form-wrapper', function($div) {
				Array.prototype.forEach.call($div, function(item, i) {
					var $this = item;
					var $form = closest($this, "form"); 
	
					// Don't do anything if we've already updated previously or if it's an update to an existing comment
					if ($this.querySelectorAll("input.syncComment").length > 0 || matches($form, ".js-comment-update") || matches($form, ".new-pr-form")) { return; }
					
					var showResolveInput = matches($form, ".js-new-comment-form");
					
					if (showResolveInput) {
						$this.insertAdjacentHTML('afterend',
							`<div class="pl-3">`
							+ `<div class="form-checkbox">`
								+ `<label>` + "Resolve " + settings.terms.bug + " " + bugId
									+ `<input class="resolveBug" type="checkbox" />`
								+ `</label>`
								+ `<p class="note">`
									+ "Set the " + settings.terms.bug + " to <strong>RESOLVED FIXED</strong> in " + settings.terms.bugzilla + "."
								+ `</p>`
							+ `</div>`
						+ `</div>`
						+ `<div class="pl-3">`
							+ `<div class="form-checkbox">`
								+ `<label>` + "Reopen " + settings.terms.bug + " " + bugId
									+ `<input class="reopenBug" type="checkbox" />`
								+ `</label>`
								+ `<p class="note">`
									+ "Set the " + settings.terms.bug + " to <strong>REOPENED</strong> in " + settings.terms.bugzilla + "."
								+ `</p>`
							+ `</div>`
						+ `</div>`
						);
						
						$form.querySelectorAll("input.resolveBug")[0].addEventListener("change", function() {
							var checked = this.checked;
							if (checked) {
								this.form.querySelectorAll(".reopenBug")[0].checked = false;
							}
						}, false);
						
						$form.querySelectorAll("input.reopenBug")[0].addEventListener("change", function() {
							var checked = this.checked;
							if (checked) {
								this.form.querySelectorAll(".resolveBug")[0].checked = false;
							}
						}, false);
					}
					
					var isReview = !!(closest($this, '#review-changes-modal') || closest($this, ".review-summary-form-wrapper"));
					var toFind = (isReview ? "div.form-checkbox" : "div.comment-form-error.mb-2");
				
					var target = $this.querySelectorAll(toFind)[0];
					
					if (target) {
						target.insertAdjacentHTML('beforebegin',
							`<div class="pl-3">`
								+ `<div class="form-checkbox">`
									+ `<label>` + "Post "+ (isReview ? "summary" : "comment") + " to " + settings.terms.bug + " " + bugId
										+ `<input class="syncComment" type="checkbox" checked />`
									+ `</label>`
									+ `<p class="note">`
										+ "Add the "+ (isReview ? "summary" : "comment") + " to the " + settings.terms.bug + " in " + settings.terms.bugzilla + (isReview ? "." : " when you click Add Single Comment.")
									+ `</p>`
								+ `</div>`
							+ `</div>`
							+ (isReview ? 
								`<div class="pl-3">`
									+ `<div class="form-checkbox">`
										+ `<label>` + "Post all pending comments to " + settings.terms.bug + " " + bugId
											+ `<input class="syncPendingComments" type="checkbox" checked />`
										+ `</label>`
										+ `<p class="note">`
											+ "Add the pending comments to the " + settings.terms.bug + " in " + settings.terms.bugzilla + "."
										+ `</p>`
									+ `</div>`
								+ `</div>`
								: "")
						);
					}
				});
			});
		};
		
		var injectHoursWorkedInput = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
			
			editSection(contents, '#partial-new-comment-form-actions, #review-changes-modal .form-actions, .review-summary-form-wrapper .form-actions', function($buttonsArray) {
				if (!$buttonsArray) { return; }
				Array.prototype.forEach.call($buttonsArray, function(item, i) {
					var $buttons = item;
					if ($buttons.querySelectorAll("input.workTime").length === 0) {
						var isPRComment = matches($buttons, '#partial-new-comment-form-actions');
						var id = "workTime" + (new Date()).getTime();
						$buttons.insertAdjacentHTML('beforeend',
							`<input class="workTime" id="${id}" name="${id}" type="number" step="0.25" style="-moz-appearance: textfield; width: 2.5em; float: right; margin: ` + (isPRComment ? "5px" : "3px 5px") + `;" />`
							+ `<label for="${id}" style="float: right; padding: ` + (isPRComment ? "7px 0" : "6px 0") + `">Hours Worked</label>`
						);
					}
					else if (isPRComment) {
						// Need this line or else we lose previously applied changes.
						$buttons.innerHTML = $buttons.innerHTML;
					}
				});
			});
		};
		
		var injectNewPullRequestOptions = function(contents, ignoreBranch) {
			editSection(contents, 'form#new_pull_request', function($form) {
				// Figure out the bug number
				var $title = $form.querySelectorAll("input#pull_request_title")[0];
				var matches;
				
				if (!ignoreBranch) {
					var action = $form.action;
					var branch = action.substr(action.lastIndexOf("%3A") + 3);
					matches = branch.match(new RegExp("^(Bug|" + settings.terms.bug + "|" + settings.terms.bug.charAt(0) + ")[-|_]?\\d+", "i"));
					
					if (matches && matches.length) {
						bugId = matches[0].match(/\d+/)[0];
						$title.value = "[" + bugId + "] Getting " + settings.terms.bug + " title from " + settings.terms.bugzilla + "...";
						window.postMessage({method: "setPullRequestTitleToBugTitle", bugId: bugId}, '*');
					}	
				}
				
				matches = $title.value.match(BUG_REGEX);
				
				// Update things if title changes, and stop trying to use the branch to get the bug number
				var titleChangeHandler = function() {
					$title.removeEventListener("change.DITBugzillaGitHub", titleChangeHandler);
					injectNewPullRequestOptions(contents, true);
				};
				$title.removeEventListener("change", titleChangeHandler);
				$title.addEventListener("change", titleChangeHandler);
	
				if (matches && matches.length) {
					bugId = matches[0].match(/\d+/)[0];
					
					if ($form.querySelectorAll(".bugOptions").length) {
						var $bugIds = $form.querySelectorAll(".bugId");
						Array.prototype.forEach.call($bugIds, function(el, i) {
							el.innerHTML = bugId;
						});
					}
					else {
						var $div = $form.querySelectorAll("tab-container")[0];
						
						$div.insertAdjacentHTML("afterend",
							`<div class="bugOptions pl-3">`
								+ `<div class="form-checkbox">`
									+ `<label>`
										+ "Post comment to " + settings.terms.bug + " <span class='bugId'>" + bugId + "</span>"
										+ `<input class="syncComment" type="checkbox" checked />`
									+ `</label>`
									+ `<p class="note">`
										+ "Add the comment to the " + settings.terms.bug + " in " + settings.terms.bugzilla + "."
									+ `</p>`
								+ `</div>`
							+ `</div>`
						);
						
						if (settings.fields.gitHubPullRequestURL.length > 0) {
							$div.insertAdjacentHTML("afterend",
								`<div class="bugOptions pl-3">`
									+ `<div class="form-checkbox">`
										+ `<label>`
											+ "Update " + settings.terms.bug + " <span class='bugId'>" + bugId + "</span> with pull request URL"
											+ `<input class="updateBug" type="checkbox" checked />`
										+ `</label>`
										+ `<p class="note">`
											+ "Set the pull request URL of the " + settings.terms.bug + " in " + settings.terms.bugzilla + "."
										+ `</p>`
									+ `</div>`
								+ `</div>`
							);
						}
					}
				}
				else {
					var $nodesToRemove = $form.querySelectorAll(".bugOptions");
					Array.prototype.forEach.call($nodesToRemove, function(node) {
						node.parentNode.removeChild(node);
					});
				}
			});
		};
		
		var injectMergeOptions = function(contents) {
			if (!bugId) { return; } // Don't continue if we aren't mapped to a bug
	
			editSection(contents, '#partial-pull-merging', function($div) {
				if ($div.querySelectorAll("input#resolveBug").length === 0) {
					var $buttons = $div.querySelectorAll("div.commit-form-actions")[0];
					if (!$buttons) { return; }

					try {
						var mergeTarget = document.querySelectorAll(".commit-ref")[0].title.split(':')[1];
					} catch (err) {
						var mergeTarget = $div.getAttribute('data-channel').match(/ .*branch:([^ ]*) /g)[0].replace(/ .*branch:([^ ]*) /g, "$1");
					}
	
					if (mergeTarget === "master") {
						var newCodeStatus = settings.values.codestatusMerge;
					}
					else {
						var newCodeStatus = settings.values.codestatusMergeParent;
					}
					
					$buttons.insertAdjacentHTML("beforeend",
						`<label class="ml-2" for="workTimeMerge" style="vertical-align: middle;">Hours Worked</label>`
						+ `<input class="ml-1" name="workTimeMerge" id="workTimeMerge" type="number" step="0.25" style="-moz-appearance: textfield; width: 2.5em; vertical-align: middle;" />`
						+ `<div class="form-checkbox">`
							+ `<label for="resolveBug">`
								+ "Resolve " + settings.terms.bug + " " + bugId
								+ `<input name="resolveBug" id="resolveBug" type="checkbox" checked />`
							+ `</label>`
							+ `<p class="note">`
								+ "Set the " + settings.terms.bug + " to <strong>RESOLVED TESTED</strong> in " + settings.terms.bugzilla + "."
							+ `</p>`
						+ `</div>`
					);
					
					if (settings.fields.codestatus.length > 0) {
						$buttons.insertAdjacentHTML("beforeend",
							`<div class="form-checkbox">`
								+ `<label for="updateBugCodeStatus">`
									+ "Update code status of " + settings.terms.bug + " " + bugId
									+ `<input name="updateBugCodeStatus" id="updateBugCodeStatus" type="checkbox" checked />`
								+ `</label>`
								+ `<p class="note">`
									+ "Set the " + settings.terms.bug + "'s code status to <strong id='newCodeStatus'>" + newCodeStatus + "</strong> in " + settings.terms.bugzilla + "."
								+ `</p>`
							+ `</div>`
						);
					}
				}
				else {
					// Need this line or else we lose previously applied changes.
					$div.innerHTML = $div.innerHTML;
				}
			});
		};
		
		var injectReleaseOptions = function(contents) {
			editSection(contents, 'form.js-release-form', function($div) {
				if ($div.querySelectorAll("input#updateRevision").length === 0) {
					var mergeTarget = decodeURI($div.querySelectorAll(".js-previewable-comment-form")[0].dataset.previewUrl).split('[target_commitish]=')[1].split('&')[0];
					var $preRelease = $div.querySelectorAll("input#release_prerelease")[0];
					var newCodeStatus = settings.values.codestatusRelease;
					var showCloseOption = false;
		
					if ($preRelease.checked || mergeTarget !== "master") {
						newCodeStatus = settings.values.codestatusPreRelease;
					}
					else {
						showCloseOption = true;
					}
	
					var $div = closest($preRelease, "div");
					$div.insertAdjacentHTML("afterend",
						`<div class="form-checkbox">`
							+ `<label for="updateRevision">`
								+ "Update " + settings.terms.bugs + " with release/tag"
								+ `<input name="updateRevision" id="updateRevision" type="checkbox" checked />`
							+ `</label>`
							+ `<p class="note">`
								+ "Update the " + settings.terms.bugs + " referenced in the comments with this release/tag in " + settings.terms.bugzilla + "."
							+ `</p>`
						+ `</div>`
					);
						
					if (settings.fields.codestatus.length > 0) {
						$div.insertAdjacentHTML("afterend",
							`<div class="form-checkbox">`
								+ `<label for="updateCodeStatus">`
									+ "Update " + settings.terms.bugs + " to <span  class='newCodeStatus'>" + newCodeStatus + "</span>"
									+ `<input name="updateCodeStatus" id="updateCodeStatus" type="checkbox" checked />`
								+ `</label>`
								+ `<p class="note">`
									+ "Set the " + settings.terms.bugs + " referenced in the comments to <strong class='newCodeStatus'>" + newCodeStatus + "</strong> in " + settings.terms.bugzilla + "."
								+ `</p>`
							+ `</div>`
						);
					}
						
					$div.insertAdjacentHTML("afterend",
						`<div class="form-checkbox closeBugsDiv` + (showCloseOption ? "" : " d-none") + `">`
							+ `<label for="closeBugs">`
								+ "Close " + settings.terms.bugs
								+ `<input name="closeBugs" id="closeBugs" type="checkbox"` + (showCloseOption ? "" : " disabled") + ` />`
							+ `</label>`
							+ `<p class="note">`
								+ "Set the " + settings.terms.bugs + " referenced in the comments to <strong>CLOSED</strong> in " + settings.terms.bugzilla + "."
							+ `</p>`
						+ `</div>`
					);
				}
				else {
					// Need this line or else we lose previously applied changes.
					$div.innerHTML = $div.innerHTML;
				}
			});
			
			/* Add button to bugs in release when viewing releases */
			if (settings.fields.revision.length) {
				editSection(contents, 'div.new-discussion-timeline, div.release-show', function($div) {
					if (!$div.length) { return; }
					
					var $nodesToRemove = $div[0].querySelectorAll("span.bzButtons");
					Array.prototype.forEach.call($nodesToRemove, function(node) {
						node.parentNode.removeChild(node);
					});
		
					var $headers = $div[0].querySelectorAll("div.release-header");
					Array.prototype.forEach.call($headers, function(el, i) {
						var $this = el;
						var releaseHolder = closest($this, "div.release").querySelectorAll("ul li a span")[0]; 
						
						if (releaseHolder) {
							var release = releaseHolder.textContent;
							
							$this.insertAdjacentHTML("afterbegin",
								`<span class="bzButtons" style="float: right;">`
									+ `<a class="btn btn-sm ml-2" href="` + bugListUrl + "&product=" + encodeURIComponent(product.name) + "&" + settings.fields.revision + "=" + encodeURIComponent(release) + `" target="_blank">`
										+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
										+ " View in " + settings.terms.bugzilla + ""
									+ `</a>`
								+ `</span>`
							);
						}
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
				
				params["comment"] = {"body": comment.trim()};
	
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
				var $nodesToRemove = document.querySelectorAll("span.bzButtons");
				Array.prototype.forEach.call($nodesToRemove, function(node) {
					node.parentNode.removeChild(node);
				});
				return;
			}
			
			/* Add button to milestone when viewing milestones */
			editSection(contents, 'ul.table-list-milestones', function($ul) {
				var $nodesToRemove = $ul.querySelectorAll("span.bzButtons");
				Array.prototype.forEach.call($nodesToRemove, function(node) {
					node.parentNode.removeChild(node);
				});
	
				var $milestones = $ul.querySelectorAll("div.milestone-title");
				Array.prototype.forEach.call($milestones, function(el, i) {
					var $this = el;
					var milestone = $this.querySelectorAll("h2 a")[0].textContent;

					$this.insertAdjacentHTML('beforeend',
						`<span class="bzButtons">`
							+ `<a class="btn btn-sm" href="` + bugListUrl + "&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone) + `" target="_blank">`
								+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
								+ " View all in " + settings.terms.bugzilla
							+ `</a>`
						+ `</span>`
						+ `<span class="bzButtons">`
							+ `<a class="btn btn-sm" href="` + bugListUrl + "&resolution=---&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone) + `" target="_blank">`
								+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
								+ " View unresolved only"
							+ `</a>`
						+ `</span>`
					);
				});
			});
			
			/* Add button to milestone in button bar */
			editSection(contents, '.milestones-flexbox-gap', function($buttonbar) {
				var nodeToRemove = $buttonbar.querySelectorAll("#bzButtonMilestone")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				nodeToRemove = $buttonbar.querySelectorAll("#bzButtonMilestoneUnresolved")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				var $a = $buttonbar.querySelectorAll("a.btn.mr-1")[0];
				
				if ($a) {
					var milestone = $buttonbar.querySelectorAll("a.btn.btn-primary")[0].getAttribute("href").split("=")[1];
					$a.insertAdjacentHTML("beforebegin",
						`<a class="btn" style="text-align: center;" id="bzButtonMilestoneUnresolved" href="` + bugListUrl + "&resolution=---&product=" + encodeURIComponent(product.name) + "&target_milestone=" + milestone + `" target="_blank">`
							+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
							+ " View unresolved only"
						+ `</a>`
						+ `<a class="btn mr-2" style="text-align: center;" id="bzButtonMilestone" href="` + bugListUrl + "&product=" + encodeURIComponent(product.name) + "&target_milestone=" + milestone + `" target="_blank">`
							+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
							+ " View all in " + settings.terms.bugzilla + ""
						+ `</a>`
					);
				}
			});
			
			/* Add button to milestone when viewing milestone */
			editSection(contents, '.TableObject-item .d-block', function($buttons) {
				var nodeToRemove = $buttons.querySelectorAll("#bzButtonMilestone")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				nodeToRemove = $buttons.querySelectorAll("#bzButtonMilestoneUnresolved")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				var $a = Array.prototype.filter.call($buttons.querySelectorAll("a"), function(el) {
					return el.innerHTML === "Edit milestone";
				})[0];
				var milestone = closest($buttons, ".TableObject").querySelectorAll(".text-normal")[0].textContent;
					
				$a.insertAdjacentHTML("beforebegin",
					`<a class="btn btn-sm mr-2" id="bzButtonMilestone" href="` + bugListUrl + "&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone) + `" target="_blank">`
						+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
						+ " View all in " + settings.terms.bugzilla + ""
					+ `</a>`
				);
				$a.insertAdjacentHTML("beforebegin",
					`<a class="btn btn-sm mr-2" id="bzButtonMilestoneUnresolved" href="` + bugListUrl + "&resolution=---&product=" + encodeURIComponent(product.name) + "&target_milestone=" + encodeURIComponent(milestone) + `" target="_blank">`
						+ '<svg height="16" width="16" class="octicon octicon-bug"><path d="M11 10h3v-1H11v-1l3.17-1.03-0.34-0.94-2.83 0.97v-1c0-0.55-0.45-1-1-1v-1c0-0.48-0.36-0.88-0.83-0.97l1.03-1.03h1.8V1H9.8L7.8 3h-0.59L5.2 1H3v1h1.8l1.03 1.03c-0.47 0.09-0.83 0.48-0.83 0.97v1c-0.55 0-1 0.45-1 1v1L1.17 6.03l-0.34 0.94 3.17 1.03v1H1v1h3v1L0.83 12.03l0.34 0.94 2.83-0.97v1c0 0.55 0.45 1 1 1h1l1-1V6h1v7l1 1h1c0.55 0 1-0.45 1-1v-1l2.83 0.97 0.34-0.94-3.17-1.03v-1zM9 5H6v-1h3v1z" /></svg>'
						+ " View unresolved only"
					+ `</a>`
				);
			});
		};
		
		var injectNewMilestoneSelect = function(contents) {
			// Don't continue if we aren't mapped to a product
			if (!product) { 
				var nodeToRemove = document.querySelectorAll("h6.milestone-select-menu")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
				return;
			}
			
			editSection(contents, 'form.new_milestone, form.js-milestone-edit-form', function($el) {
				if (!$el.length) { return; }
				var nodeToRemove = $el[0].querySelectorAll("h6.milestone-select-menu")[0];
				if (nodeToRemove) {
					nodeToRemove.parentNode.removeChild(nodeToRemove);
				}
	
				var $input = $el[0].querySelectorAll("input#milestone_title")[0];
				$input.insertAdjacentHTML("afterend",
					`<h6 class="select-menu js-menu-container js-select-menu milestone-select-menu" id="bzMilestone">`
						+ `<a href="#" tabindex="` + $input.getAttribute("tabindex") + `" style="fill: currentColor; color: #666;">`
							+ "Use " + settings.terms.bugzilla + " milestone..."
							+ '<svg height="16" width="14" class="ml-2" style="vertical-align: bottom;"><path d="M14 8.77V7.17l-1.94-0.64-0.45-1.09 0.88-1.84-1.13-1.13-1.81 0.91-1.09-0.45-0.69-1.92H6.17l-0.63 1.94-1.11 0.45-1.84-0.88-1.13 1.13 0.91 1.81-0.45 1.09L0 7.23v1.59l1.94 0.64 0.45 1.09-0.88 1.84 1.13 1.13 1.81-0.91 1.09 0.45 0.69 1.92h1.59l0.63-1.94 1.11-0.45 1.84 0.88 1.13-1.13-0.92-1.81 0.47-1.09 1.92-0.69zM7 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" /></svg>'
						+ `</a>`
						+ `<div class="select-menu-modal-holder js-menu-content js-navigation-container js-active-navigation-container">`
							+ `<div class="select-menu-modal">`
								+ `<div class="select-menu-header">`
									+ '<svg aria-label="Close" class="octicon octicon-x js-menu-close" height="16" role="img" version="1.1" viewBox="0 0 12 16" width="12"><path d="M7.48 8l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75-1.48-1.48 3.75-3.75L0.77 4.25l1.48-1.48 3.75 3.75 3.75-3.75 1.48 1.48-3.75 3.75z"></path></svg>'
									+ `<span class="select-menu-title">`
										+ "Select " + settings.terms.bugzilla + " milestone"
									+ `</span>`
								+ `</div>`
								+ `<div class="js-select-menu-deferred-content">`
									+ `<div class="select-menu-filters">`
										+ `<div class="is-loading p-5 text-center">`
											+ `<img class="column" src="https://github.githubassets.com/images/spinners/octocat-spinner-128.gif" width="64px" />`
										+ `</div>`
										+ `<div class="select-menu-list">`
											+ `<div data-filterable-for="milestones-filter-field" data-filterable-type="substring"></div>`
										+ `</div>`
									+ `</div>`
								+ `</div>`
							+ `</div>`
						+ `</div>`
					+ `</h6>`
				);
			
				$input.parentNode.querySelectorAll("h6#bzMilestone a")[0].onclick = function(e) {
					e.preventDefault();
					this.parentNode.querySelectorAll(".select-menu-modal-holder")[0].style.display = "block";
					window.postMessage({method: "showMilestoneForm"}, '*');
				};
				
				$input.parentNode.querySelectorAll("h6#bzMilestone div.select-menu-header")[0].onclick = function(e) {
					e.stopPropagation();
					closest(this, ".select-menu-modal-holder").style.display = "none";
				};
			});
		};
		
		var syncLabels = function(contents) {
			if (!bugId || !doLabelSync) { return; } // Don't continue if we aren't mapped to a bug or aren't syncing labels
	
			editSection(contents, '.discussion-sidebar-item.sidebar-labels', function($div) {
				doLabelSync = false;
				
				var $labels = $div.querySelectorAll(".labels .IssueLabel span");
				var labels = Array.prototype.map.call($labels, function(label) { return label.innerText; });
				var params = {};
				params[settings.fields.gitHubLabels] = labels.join(' ');
				
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
					document.querySelectorAll(".product-select-menu .select-menu-modal-holder")[0].style.display = 'none';
					
					injectProductName(document);
					injectPageHeadActions(document);
					injectMilestoneActions(document);
					injectNewMilestoneSelect(document);
					break;
			}
		});

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
})();
