const fetchRpcResponse = (url, methodName, params) => {
	return fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: methodName,
			params: params,
			id: methodName
		})
	}).then((res) => res.json());
};
