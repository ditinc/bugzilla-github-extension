/**
 * Constructs a Bugzilla object.
 * @class
 * @classdesc An object that communicates with Bugzilla via XML-RPC.
 */
var Bugzilla = function (settings) {
	'use strict';

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
	this.rpcUrl = this.url + '/jsonrpc.cgi';

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
};

/**
 * Gets the version of Bugzilla and spits it to the console.
 * Not really useful other than confirming connectivity.
 */
Bugzilla.prototype.getVersion = function () {
	'use strict';

	return fetchRpcResponse(this.rpcUrl, 'Bugzilla.version');
};

/**
 * Gets a promise that will return bug info for the passed in bug number.
 * @param {number} bugId - The bug number.
 * @param {Array} includeFields - An optional array of fields to include.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getBug = function (bugId, includeFields) {
	'use strict';

	const methodName = 'Bug.get';
	const params = [
		{
			Bugzilla_token: this.token,
			ids: [bugId],
			include_fields: includeFields
		}
	];
	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Gets a promise that will return bug info for the passed in bug numbers.
 * @param {Array} bugIds - The bug numbers.
 * @param {Array} includeFields - An optional array of fields to include.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getBugs = function (bugIds, includeFields) {
	'use strict';

	const methodName = 'Bug.get';
	const params = [
		{
			Bugzilla_token: this.token,
			ids: bugIds,
			include_fields: includeFields
		}
	];

	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Adds a comment to the bug passed in.
 * @param {number} bugId - The bug number.
 * @param {String} comment - The comment.
 * @param {number} hoursWorked - The number of hours worked. Default: 0
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.addComment = function (bugId, comment, hoursWorked) {
	'use strict';

	hoursWorked = hoursWorked || 0;
	const methodName = 'Bug.add_comment';
	const params = [
		{
			Bugzilla_token: this.token,
			id: bugId,
			comment: comment,
			work_time: hoursWorked
		}
	];
	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Updates the bugs with the given parameters.
 * @param {Array} bugIds - The bug numbers.
 * @param {Object} params - An key-value object with the fields to be updated (see documentation for details).
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.updateBugs = function (bugIds, params) {
	'use strict';

	const methodName = 'Bug.update';
	const body = [
		{
			Bugzilla_token: this.token,
			ids: bugIds,
			...params
		}
	];
	return fetchRpcResponse(this.rpcUrl, methodName, body);
};

/**
 * Updates the bug with the given parameters.
 * @param {number} bugId - The bug number.
 * @param {Object} params - An key-value object with the fields to be updated (see documentation for details).
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.updateBug = function (bugId, params) {
	'use strict';

	const methodName = 'Bug.update';
	const body = [
		{
			Bugzilla_token: this.token,
			ids: [bugId],
			...params
		}
	];
	return fetchRpcResponse(this.rpcUrl, methodName, body);
};

/**
 * Gets a promise that will return attachments for the passed in bug number.
 * @param {number} bugId - The bug number.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getAttachments = function (bugId) {
	'use strict';

	const methodName = 'Bug.attachments';
	const params = [
		{
			Bugzilla_token: this.token,
			ids: [bugId],
			exclude_fields: ['data']
		}
	];
	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Logs the user in.
 * @param {string} username - The username of the user to log in.
 * @param {string} password - The password of the user to log in.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.login = function (username, password) {
	'use strict';

	const methodName = 'User.login';
	const params = [
		{
			login: username,
			password: password,
			remember: true
		}
	];
	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Logs the user out.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.logout = function (username, password) {
	'use strict';

	const methodName = 'User.logout';
	const params = [{ Bugzilla_token: this.token }];
	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Sets the token to be used for future calls to Bugzilla.
 * @param {string} token - The token of the user used to log in.
 */
Bugzilla.prototype.setToken = function (token) {
	'use strict';

	this.token = token;
};

/**
 * Gets a promise that will return bug info for bugs using the passed in criteria.
 * @param {Object} searchCriteria - The search criteria.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.searchBugs = function (searchCriteria) {
	'use strict';

	searchCriteria.Bugzilla_token = this.token;
	const methodName = 'Bug.search';
	const params = [searchCriteria];
	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Gets a promise that will return info for the given fields.
 * @param {Array} fieldNames - The field names.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getFieldInfo = function (fieldNames) {
	'use strict';

	const methodName = 'Bug.fields';
	const params = [
		{
			Bugzilla_token: this.token
		}
	];
	if (fieldNames) params[0].names = fieldNames;

	return fetchRpcResponse(this.rpcUrl, methodName, params);
};

/**
 * Gets a promise that will return all products.
 * @return {Promise} On success, will return the response object from Bugzilla.
 */
Bugzilla.prototype.getProducts = function () {
	'use strict';
	var xmlrpcUrl = this.xmlrpcUrl;

	const methodName = 'Product.get_enterable_products';
	const params = [{ Bugzilla_token: this.token }];
	return fetchRpcResponse(this.rpcUrl, methodName, params).then((response) => {
		return fetchRpcResponse(this.rpcUrl, 'Product.get', [
			{
				Bugzilla_token: this.token,
				ids: response.ids
			}
		]);
	});
};

/**
 * @param {String} url the url to fetch the jsonRPC data from
 * @param {String} methodName the method being used. Reference Bugzilla documentations https://www.bugzilla.org/docs/4.0/en/html/api/Bugzilla/WebService/Bug.html
 * @param {List<Struct>} params an array of param structs representing the params being passed into the method
 * @returns {Promise} On success will return a response object from Bugzilla, on error will return the error message
 */
const fetchRpcResponse = (url, methodName, params) => {
	return fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: methodName,
			params: params,
			id: methodName
		})
	})
		.then((res) => res.json())
		.then((res) => {
			if (res.error) {
				throw res.error;
			}

			return res.result;
		});
};
