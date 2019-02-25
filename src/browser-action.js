document.addEventListener('DOMContentLoaded', function () {
	"use strict";
	var settings;
	var milestones = [];
	
	chrome.storage.sync.get(
		STORAGE_DEFAULTS, 
		function(data) {
			renderProducts(data.productMap, data.selectedProduct);
			settings = data;
		}
	);
	
	function addOptions(select, options, clear) {
		if (clear) {
			$(select).empty();
		}
		
		for (var i = 0; i < options.length; i++) {
			var field = options[i].field || options[i].name;
			var label = options[i].label || options[i].display_name || options[i].name;
			
			var opt = document.createElement("OPTION");
			opt.value = field;
			opt.text = label;
			opt.dataset.repo = options[i].repo;
			
			if (typeof options[i].is_active !== 'undefined' && !options[i].is_active) {
				opt.className = 'inactive';
			}
			
			select.appendChild(opt);
		}
	}
	
	function renderProducts(productMap, selectedProduct) {
		var $product = $('#product');
		var options = Object.keys(productMap).map(function(repo) {
			return {name: productMap[repo].name, label: productMap[repo].name + ' [' + repo + ']', repo: repo};
		}).sort(function(left, right) {
			return left.name.localeCompare(right.name);
		});
		addOptions($product.get(0), options, true);
		$product.val(selectedProduct);
	}
	
	function getFieldListForUrl(fields) {
		return encodeURIComponent(fields.map(function(el) {
			var field = el.field;
			
			// work_time is actual_time here
			field = field.replace(/^work_time$/, "actual_time");
			
			return field;
		}));
	}
	
	function newModal(html) {
		$(".options")
			.append(
				$("<div>")
					.addClass("modalBackground")
			)
			.append(
				$("<div>")
					.addClass("modal")
					.html(html)
			);
		
		var $modal = $(".modal");
		var $modalBackground = $(".modalBackground");
		
		return {
			getBody: function() {
				return $modal;
			},
			remove: function() {
				$modalBackground.remove();
				$modal.remove();
			}
		};
	}
	
	function showMilestonesModal(product) {
		var modal = newModal("Loading milestones for " + product + " from " + settings.bugzillaURL + "...");		
		var $modal = modal.getBody();
		
		var populateMilestoneSelect = function() {
			var values = $.map(milestones, function(milestone) {
				if ($.inArray(product, milestone.visibility_values) < 0) {
					return;
				}
				else {
					return {name: milestone.name, sortkey: milestone.sortkey, is_active: milestone.is_active};
				}
			});
			
			values.sort(function(a, b) {
				if (a.is_active === b.is_active)  {
					return (a.sortkey < b.sortkey ? -1 : (a.sortkey > b.sortkey ? 1 : 0));
				} else {
					return a.is_active ? -1 : 1;
				}
			});

			$modal
				.html(
					$("<select>")
						.attr({
							id: "milestone",
							name: "milestone"
						})
				)
				.append(
					$("<div>")
						.append(
							$("<button>")
								.html("View All")
								.click(function() {
									var milestone = $("#milestone option:selected").val();
									
									var bugListUrl = settings.bugzillaURL + "/buglist.cgi?human=1&columnlist=" + getFieldListForUrl(settings.bugList.fields) + "&query_format=advanced&order=" + getFieldListForUrl(settings.bugList.sortOrder) + "&list_id=" + Math.floor(Math.random() * 1E10);
									var url = bugListUrl + "&target_milestone=" + encodeURIComponent(milestone) + "&product=" + encodeURIComponent(product);
									chrome.tabs.create({url: url}, function(tab) {
									    // Tab opened.
									});
								
									modal.remove();
								})
						)
						.append(
								$("<button>")
									.html("View Unresolved Only")
									.click(function() {
										var milestone = $("#milestone option:selected").val();
										
										var bugListUrl = settings.bugzillaURL + "/buglist.cgi?human=1&columnlist=" + getFieldListForUrl(settings.bugList.fields) + "&query_format=advanced&order=" + getFieldListForUrl(settings.bugList.sortOrder) + "&list_id=" + Math.floor(Math.random() * 1E10);
										var url = bugListUrl + "&target_milestone=" + encodeURIComponent(milestone) + "&product=" + encodeURIComponent(product) + "&bug_status=NEW&bug_status=ASSIGNED&bug_status=UNCONFIRMED&bug_status=REOPENED";
										chrome.tabs.create({url: url}, function(tab) {
										    // Tab opened.
										});
									
										modal.remove();
									})
							)
						.append(
							$("<button>")
								.html("Cancel")
								.click(function() {
									modal.remove();
								})
						)
				);
			
			addOptions(document.getElementById("milestone"), values);
		};
			
		if (milestones.length === 0) {
			var bugzilla = new Bugzilla({bugzillaURL: settings.bugzillaURL});
			bugzilla.getFieldInfo(["target_milestone"])
				.fail(function(response) {
					var faultString = $(response.responseXML).find("fault").find("member").first().find("string").html();
					
					$modal
						.html(
							$("<p>").html("There was an error connecting to Bugzilla" + (faultString && faultString.length > 0 ? ":" : "."))
						)
						.append(
							$("<p>").html(faultString)
						)
						.append(
							$("<button>")
								.html("OK")
								.click(function() {
									modal.remove();
								})
						);
				})
				.done(function(response) {					
					milestones = response[0].fields[0].values;
	
					populateMilestoneSelect();
				});
		} else {
			populateMilestoneSelect();
		}
	}
	
	$('button.bugzilla-list-link').on('click', function(e) {
		var bugListUrl = settings.bugzillaURL + "/buglist.cgi?human=1&columnlist=" + getFieldListForUrl(settings.bugList.fields) + "&query_format=advanced&order=" + getFieldListForUrl(settings.bugList.sortOrder) + "&list_id=" + Math.floor(Math.random() * 1E10);
		var url = bugListUrl + "&" + this.dataset.filter + "&product=" + encodeURIComponent($('#product').val());
		chrome.tabs.create({url: url}, function(tab) {
		    // Tab opened.
		});
	});
	
	$('#milestoneModalLauncher').on('click', function() {
		showMilestonesModal($('#product').val());
	});
	
	$('button#github').on('click', function() {
		var repo = $('#product option:selected').data('repo');
		if (repo) {
			var url = settings.gitHubURL + "/" + repo;
			chrome.tabs.create({url: url}, function(tab) {
			    // Tab opened.
			});
		}
	});
	
	$('#product').on('change', function() {
		chrome.storage.sync.set({selectedProduct: $(this).val()});
	});
});