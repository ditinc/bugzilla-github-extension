document.addEventListener('DOMContentLoaded', function () {
	"use strict";
	var fields;
	
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
			
			select.appendChild(opt);
		}
	}
	
	function addSelected(select, options) {
		var values = $(select).children().map(function() { return this.value; });
		
		for (var i = 0; i < options.length; i++) {
			var field = options[i].field || options[i].value;
			var label = options[i].label;
			
			if ($.inArray(field, values) < 0) {
				var opt = document.createElement("OPTION");
				opt.value = field;
				opt.text = label;
				
				select.appendChild(opt);
			}
		}
	}
	
	function flashStatus(msg) {
		var status = document.getElementById('status');
		status.textContent = msg;
		setTimeout(function() {
			status.textContent = '';
		}, 1750);
	}
	
	function updateForm(items) {
		document.getElementById('bugzillaURL').value = items.bugzillaURL;
		document.getElementById('gitHubURL').value = items.gitHubURL;
		document.getElementById('gitHubPullRequestURL').value = items.fields.gitHubPullRequestURL;
		document.getElementById('gitHubLabels').value = items.fields.gitHubLabels;
		document.getElementById('revision').value = items.fields.revision;
		document.getElementById('codestatus').value = items.fields.codestatus;
		document.getElementById('codestatusMerge').value = items.values.codestatusMerge;
		document.getElementById('codestatusMergeParent').value = items.values.codestatusMergeParent;
		document.getElementById('codestatusRelease').value = items.values.codestatusRelease;
		document.getElementById('codestatusPreRelease').value = items.values.codestatusPreRelease;
		updateCodeStatusSelects();
		
		addOptions(document.getElementById('bugInfoFields'), items.bugInfoFields, true);
		addOptions(document.getElementById('bugListFields'), items.bugList.fields, true);
		addOptions(document.getElementById('bugListSortOrder'), items.bugList.sortOrder, true);
	}
	
	function updateCodeStatusSelects() {
		var field = $('#codestatus').val();
		$('[data-field]').data("field", field);
	}
	
	// Restores options using the preferences stored in chrome.storage.
	chrome.storage.sync.get(
		STORAGE_DEFAULTS, 
		function(items) {
			updateForm(items);
		}
	);
	
	// Saves options to chrome.storage.sync.
	document.getElementById('save').addEventListener('click', function() {
		var bugzillaURL = document.getElementById('bugzillaURL').value;
		var gitHubURL = document.getElementById('gitHubURL').value;
		var gitHubPullRequestURL = document.getElementById('gitHubPullRequestURL').value;
		var gitHubLabels = document.getElementById('gitHubLabels').value;
		var revision = document.getElementById('revision').value;
		var codestatus = document.getElementById('codestatus').value;
		var codestatusMerge = document.getElementById('codestatusMerge').value;
		var codestatusMergeParent = document.getElementById('codestatusMergeParent').value;
		var codestatusRelease = document.getElementById('codestatusRelease').value;
		var codestatusPreRelease = document.getElementById('codestatusPreRelease').value;
		
		var bugInfoFields = $.map(document.getElementById('bugInfoFields').options, function(el) { return {field: el.value, label: el.text}; });
		var bugListFields = $.map(document.getElementById('bugListFields').options, function(el) { return {field: el.value, label: el.text}; });
		var bugListSortOrder = $.map(document.getElementById('bugListSortOrder').options, function(el) { return {field: el.value, label: el.text}; });
		
		chrome.storage.sync.set(
			{
				bugzillaURL: bugzillaURL,
				gitHubURL: gitHubURL,
				fields: {
					gitHubPullRequestURL: gitHubPullRequestURL,
					gitHubLabels: gitHubLabels,
					revision: revision,
					codestatus: codestatus
				},
				bugInfoFields: bugInfoFields,
				bugList: {
					fields: bugListFields,
					sortOrder: bugListSortOrder
				},
				values: {
					codestatusMerge: codestatusMerge,
					codestatusMergeParent: codestatusMergeParent,
					codestatusRelease: codestatusRelease,
					codestatusPreRelease: codestatusPreRelease
				}
			}, 
			function() {
				// Update status to let user know options were saved.
				flashStatus('Options saved.');
			}
		);
	});
	
	// Resets to defaults and saves to chrome.storage.sync.
	document.getElementById('defaults').addEventListener('click', function() {
		var modal = newModal();
		modal.getBody()
			.html(
				"<p>This will clear all currently saved options. "
				+ "Are you sure you want reset to defaults?</p>"
			)
			.append(
				$("<button>")
					.html("Yes")
					.click(function() {
						chrome.storage.sync.set(
							STORAGE_DEFAULTS, 
							function(items) {
								updateForm(STORAGE_DEFAULTS);
								modal.remove();
								
								// Update status to let user know options were saved.
								flashStatus('Options reset.');
							}
						);
					})
			)
			.append(
				$("<button>")
					.html("No")
					.click(function() {
						modal.remove();
					})
			);
	});
	
	// Shows modal for exporting/importing settings as JSON.
	document.getElementById('imexport').addEventListener('click', function() {
		var modal = newModal();
		modal.getBody()
			.html(
				"<p>All options can be exported and imported as JSON. "
				+ "Below, the current options are displayed by default or by clicking Reset to Current. "
				+ "Make any changes and click Import to import the settings.</p>"
			)
			.append(
				$("<textarea>")
					.attr({
						id: "optionsJSON"
					})
			)
			.append(
				$("<button>")
					.html("Reset to Current")
					.click(function() {
						$(this).parent().find(".status").html("");
						chrome.storage.sync.get(
							STORAGE_DEFAULTS, 
							function(items) {
								$("#optionsJSON").val(JSON.stringify(items));
							}
						);
					})
			)
			.append(
				$("<button>")
					.html("Import")
					.click(function() {
						var $status = $(this).parent().find(".status");
						$status.html("");
						try {
							var options = JSON.parse($("#optionsJSON").val());
							chrome.storage.sync.set(
								options, 
								function() {
									updateForm(options);
									$status.html("Import successful!"); 
								}
							);
						}
						catch (e) {
							$(this).parent().find(".status").html(e);
						}
					})
			)
			.append(
				$("<button>")
					.html("Cancel")
					.click(function() {
						modal.remove();
					})
			)
			.append(
				$("<div>")
					.addClass("status")
			);
		
		chrome.storage.sync.get(
			STORAGE_DEFAULTS, 
			function(items) {
				$("#optionsJSON").val(JSON.stringify(items));
			}
		);
	});

	// Manipulates options in a select control
	$('.selectButtons').on('click', function (e) {
		var $select = $("#" + e.target.dataset.select);

		switch(e.target.className) {
			case "moveTop":
				var $first;
				var $options = $select.children();
				
				for (var i = 0; i < $options.length; i++) {
					var $option = $options.eq(i);
					if (!$first) {
						if (!$option.is(":selected")) {
							$first = $option;
						}
					}
					else if ($option.is(":selected")) {
						$first.before($option);
					}
				}
				
				break;
			case "moveUp":
				var $options = $select.children();
				
				for (var i = 0; i < $options.length; i++) {
					var $option = $options.eq(i);
					
					if ($option.is(":selected") && i > 0) {
						var $prev = $option.prev();
						if (!$prev.is(":selected")) {
							$prev.before($option);
						}
					}
				}
				
				break;
			case "moveDown":
				var $options = $select.children();
				
				for (var i = $options.length - 1; i > -1; i--) {
					var $option = $options.eq(i);

					if ($option.is(":selected") && i < $options.length - 1) {
						var $next = $option.next();
						if (!$next.is(":selected")) {
							$next.after($option);
						}
					}
				}
				
				break;
			case "moveBottom":
				var $last;
				var $options = $select.children();
				
				for (var i = $options.length - 1; i > -1; i--) {
					var $option = $options.eq(i);
					if (!$last) {
						if (!$option.is(":selected")) {
							$last = $option;
						}
					}
					else if ($option.is(":selected")) {
						$last.after($option);
					}
				}
				
				break;
			case "remove":
				$select.find(":selected").remove();
				break;
			case "add":
				showBugzillaFieldModal($select);
				break;
		}
	});
	
	$('.fieldSelect').on('click', function (e) {
		var $el = $("#" + e.target.dataset.target);
		showBugzillaFieldModal($el);
	});
	
	$('.valueSelect').on('click', function (e) {
		var $el = $("#" + e.target.dataset.target);
		var field = $(e.target).data("field");
		
		if (field.length > 0) {
			showBugzillaValueModal($el, field);
		}
		else {
			var modal = newModal();
			modal.getBody()
				.html(
					"<p>You must provide a valid field for Code Status.</p>"
				)
				.append(
					$("<button>")
						.html("OK")
						.click(function() {
							modal.remove();
						})
				);
		}
	});
	
	//
	$("#bugzillaURL").change(function() {
		fields = false;
	});
	
	//
	$("#codestatus").change(function() {
		updateCodeStatusSelects();
	});
	
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
	
	function showBugzillaFieldModal($el) {
		var multiple = $el.is("[multiple]");
		var bugzillaURL = $("#bugzillaURL").val();
		
		var modal = newModal("Loading fields from " + bugzillaURL + "...");		
		var $modal = modal.getBody();
		
		var showSelectForm = function() {
			$modal
				.html(
					$("<select>")
						.attr({
							id: "fieldSelect",
							name: "fieldSelect"
						})
						.prop({
							multiple: multiple
						})
				)
				.append(
					$("<div>")
						.append(
							$("<button>")
								.html((multiple ? "Add Selected" : "OK"))
								.click(function() {
									if ($el.is("select")) {
										addSelected($el.get(0), $("#fieldSelect option:selected").get());
									}
									else {
										$el.val($("#fieldSelect option:selected").val());
									}
								
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
			
			addOptions(document.getElementById("fieldSelect"), fields);
		}
			
		if (!fields) {
			var bugzilla = new Bugzilla({bugzillaURL: bugzillaURL});
			bugzilla.getFieldInfo()
				.error(function(response) {
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
				.success(function(response) {					
					fields = response[0].fields;
					fields.sort(function(a, b) {
						return (a.display_name < b.display_name ? -1 : (a.display_name > b.display_name ? 1 : 0));
					});
					
					showSelectForm();
				});
		}
		else {
			showSelectForm();
		}
	}
	
	function showBugzillaValueModal($el, field) {
		var multiple = $el.is("[multiple]");
		var bugzillaURL = $("#bugzillaURL").val();
		
		var modal = newModal("Loading values for " + field + " from " + bugzillaURL + "...");		
		var $modal = modal.getBody();
		
		var showSelectForm = function(values) {
			$modal
				.html(
					$("<select>")
						.attr({
							id: "valueSelect",
							name: "valueSelect"
						})
						.prop({
							multiple: multiple
						})
				)
				.append(
					$("<div>")
						.append(
							$("<button>")
								.html((multiple ? "Add Selected" : "OK"))
								.click(function() {
									if ($el.is("select")) {
										addSelected($el.get(0), $("#valueSelect option:selected").get());
									}
									else {
										$el.val($("#valueSelect option:selected").val());
									}
								
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
			
			addOptions(document.getElementById("valueSelect"), values);
		}
			
		var bugzilla = new Bugzilla({bugzillaURL: bugzillaURL});
		bugzilla.getFieldInfo(field)
			.error(function(response) {
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
			.success(function(response) {					
				var values = response[0].fields[0].values;				
				showSelectForm(values);
			});
	}
	
});