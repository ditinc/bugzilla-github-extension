/**
 * Constructs a Bugzilla object.
 * @class
 * @classdesc An object that communicates with Bugzilla via XML-RPC.
 */
var Bugzilla = function() {
	"use strict";
	
	/**
	 * The URL of the Bugzilla server.  TODO: make as an option when creating the class.
	 * @private
	 * @type {String}
	 */
	this.url = 'https://bugzilla.dtec.com/xmlrpc.cgi';
}

/**
 * Gets the version of Bugzilla and spits it to the console.
 * Not really useful other than confirming connectivity.
 */
Bugzilla.prototype.getVersion = function() {
	"use strict";
	
	$.xmlrpc({
		url: this.url,
		methodName: 'Bugzilla.version',
		success: function(response, status, jqXHR) {
			console.log(response[0].version);
		},
		error: function(jqXHR, status, error) {
			console.log(arguments);
		}
	});
}

/**
 * Gets a promise that will return bug info for the passed in bug number.
 * @param {number} bugId - The bug number.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getBug = function(bugId) {
	"use strict";

	return $.xmlrpc({
		url: this.url,
		methodName: 'Bug.get',
		params: [{"ids": [bugId]}]
	});
}

/**
 * Adds a comment to the bug passed in.
 * @param {number} bugId - The bug number.
 * @param {String} comment - The comment.
 * @param {number} hoursWorked - The number of hours worked. Default: 0
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.addComment = function(bugId, comment, hoursWorked) {
	"use strict";
	hoursWorked = hoursWorked || 0;
	
	return $.xmlrpc({
		url: this.url,
		methodName: 'Bug.add_comment',
		params: [{"id": bugId, "comment": comment, "work_time": hoursWorked}]
	});
}

/**
 * Updates the bug with the given parameters.
 * @param {number} bugId - The bug number.
 * @param {Object} params - An key-value object with the fields to be updated (see documentation for details).
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.updateBug = function(bugId, params) {
	"use strict";
	params.ids = [bugId];
	
	return $.xmlrpc({
		url: this.url,
		methodName: 'Bug.update',
		params: [params]
	});
}