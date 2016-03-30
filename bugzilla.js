var Bugzilla = function() {
	"use strict";
	this.url = 'https://bugzilla.dtec.com/xmlrpc.cgi';
}

Bugzilla.prototype.getVersion = function() {
	"use strict";
	
	$.xmlrpc({
		url: this.url,
		methodName: 'Bugzilla.version',
		success: function(response, status, jqXHR) {
			console.log(response);
		},
		error: function(jqXHR, status, error) {
			console.log(arguments);
		}
	});
}

Bugzilla.prototype.getBug = function(bugId) {
	"use strict";

	return $.xmlrpc({
		url: this.url,
		methodName: 'Bug.get',
		params: [{"ids": [bugId]}]
	});
}

Bugzilla.prototype.addComment = function(bugId, comment, hoursWorked) {
	"use strict";
	hoursWorked = hoursWorked || 0;
	
	return $.xmlrpc({
		url: this.url,
		methodName: 'Bug.add_comment',
		params: [{"id": bugId, "comment": comment, "work_time": hoursWorked}]
	});
}

Bugzilla.prototype.updateBug = function(bugId, params) {
	"use strict";
	params.ids = [bugId];
	console.log(params);
	
	return $.xmlrpc({
		url: this.url,
		methodName: 'Bug.update',
		params: [params]
	});
}