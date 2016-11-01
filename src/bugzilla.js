/**
 * Constructs a Bugzilla object.
 * @class
 * @classdesc An object that communicates with Bugzilla via XML-RPC.
 */
var Bugzilla = function(settings) {
	"use strict";
	
	/**
	 * The URL of the Bugzilla server.
	 * @private
	 * @type {String}
	 */
	this.url = settings.bugzillaURL;
	
	/**
	 * The URL of the Bugzilla server's XMLRPC interface.
	 * @private
	 * @type {String}
	 */
	this.xmlrpcUrl = this.url + '/xmlrpc.cgi';
	
	/**
	 * The URL for Bugzilla attachments.
	 * @private
	 * @type {String}
	 */
	this.attachmentUrl = this.url + '/attachment.cgi';
	
	/**
	 * The token used for logging in in newer versions of Bugzilla.
	 * @private
	 * @type {String}
	 */
	this.token;
}

/**
 * Gets the version of Bugzilla and spits it to the console.
 * Not really useful other than confirming connectivity.
 */
Bugzilla.prototype.getVersion = function() {
	"use strict";
	
	$.xmlrpc({
		url: this.xmlrpcUrl,
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
 * @param {Array} includeFields - An optional array of fields to include.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getBug = function(bugId, includeFields) {
	"use strict";

	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'Bug.get',
		params: [{"Bugzilla_token": this.token, "ids": [bugId], "include_fields": includeFields}]
	});
}

/**
 * Gets a promise that will return bug info for the passed in bug numbers.
 * @param {Array} bugIds - The bug numbers.
 * @param {Array} includeFields - An optional array of fields to include.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getBugs = function(bugIds, includeFields) {
	"use strict";

	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'Bug.get',
		params: [{"Bugzilla_token": this.token, "ids": bugIds, "include_fields": includeFields}]
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
		url: this.xmlrpcUrl,
		methodName: 'Bug.add_comment',
		params: [{"Bugzilla_token": this.token, "id": bugId, "comment": comment, "work_time": hoursWorked}]
	});
}

/**
 * Updates the bugs with the given parameters.
 * @param {Array} bugIds - The bug numbers.
 * @param {Object} params - An key-value object with the fields to be updated (see documentation for details).
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.updateBugs = function(bugIds, params) {
	"use strict";
	params.Bugzilla_token = this.token;
	params.ids = bugIds;
	
	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'Bug.update',
		params: [params]
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
	params.Bugzilla_token = this.token;
	params.ids = [bugId];
	
	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'Bug.update',
		params: [params]
	});
}

/**
 * Gets a promise that will return attachments for the passed in bug number.
 * @param {number} bugId - The bug number.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getAttachments = function(bugId) {
	"use strict";

	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'Bug.attachments',
		params: [{"Bugzilla_token": this.token, "ids": [bugId], "exclude_fields": ["data"]}]
	});
}

/**
 * Logs the user in.
 * @param {string} username - The username of the user to log in.
 * @param {string} password - The password of the user to log in.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.login = function(username, password) {
	"use strict";

	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'User.login',
		params: [{login: username, password: password, remember: true}]
	});
}

/**
 * Logs the user out.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.logout = function(username, password) {
	"use strict";

	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'User.logout',
		params: [{"Bugzilla_token": this.token}]
	});
}

/**
 * Sets the token to be used for future calls to Bugzilla.
 * @param {string} token - The token of the user used to log in.
 */
Bugzilla.prototype.setToken = function(token) {
	"use strict";

	this.token = token;
}

/**
 * Gets a promise that will return bug info for bugs using the passed in criteria.
 * @param {Object} searchCriteria - The search criteria.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.searchBugs = function(searchCriteria) {
	"use strict";
	searchCriteria.Bugzilla_token = this.token;

	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'Bug.search',
		params: [searchCriteria]
	});
}

/**
 * Gets a promise that will return info for the given fields.
 * @param {Array} fieldNames - The field names.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getFieldInfo = function(fieldNames) {
	"use strict";
	var params = [];
	params.push({Bugzilla_token: this.token});
	if (fieldNames) {
		params[0].names = fieldNames;
	}

	return $.xmlrpc({
		url: this.xmlrpcUrl,
		methodName: 'Bug.fields',
		params: params
	});
}

/**
 * Gets a promise that will return all products.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getProducts = function() {
	"use strict";
	var xmlrpcUrl = this.xmlrpcUrl;
	
	return $.xmlrpc({
		url: xmlrpcUrl,
		methodName: 'Product.get_enterable_products',
		params: [{"Bugzilla_token": this.token}]
	})
	.error(function(response) {
		return response;
	})
	.then(function(response) {
		return $.xmlrpc({
			url: xmlrpcUrl,
			methodName: 'Product.get',
			params: [{"Bugzilla_token": this.token, ids: response[0].ids}],
			dataFilter: function(data, type) {
				// this fixes a problem where Bugzilla sends malformed XML
				return data.replace(/<\/methodR.*/, '</methodResponse>');
			}
		});
	});
}

/**
 * Modification to jquery.xmlrpc to handle dates.
 * See https://github.com/timheap/jquery-xmlrpc/issues/5
 */
$.xmlrpc.makeType('dateTime.iso8601', true, function(d) {
	return [
		d.getUTCFullYear(), '-', _pad(d.getUTCMonth()+1), '-',
		_pad(d.getUTCDate()), 'T', _pad(d.getUTCHours()), ':',
		_pad(d.getUTCMinutes()), ':', _pad(d.getUTCSeconds()), 'Z'
	].join('');
}, function(text, node) {
		// ISO 8601 dates can be either YYYY-MM-DD _or_
		// YYYYMMDD. Added check for the latter case, since it's
		// not handled by FireFox's Date constructor. jfuller
		// 2013-05-13
		if (!/-/.test(text)) {
			text = text.replace(/(\d{4})(\d{2})(\d{2})(.+)/, "$1-$2-$3$4");
		}
	return new Date(text);
});