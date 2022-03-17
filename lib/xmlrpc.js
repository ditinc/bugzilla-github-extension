const fetchQuantumXML = (url, reqBody, testing) => {
	return fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "text/xml"
		},
		body: reqBody
	})
		.then((response) => {
			if (response.ok) {
				return response.text();
			} else {
				throw new Error("Failed to fetch data from bugzilla");
			}
		})
		.then((response) => {
			return !testing
				? fromXML(trimXML_RPCResponse(response)).methodResponse
				: fromXML(response);
		});
};

const buildXMLString = (methodName, settings) => {
	// build the xml string from scratch
	// start with the method name, which is required for every call
	let xmlString = `<?xml version="1.0"?>\n<methodCall>\n<methodName>${methodName}</methodName>\n<params>\n<param>\n<value>\n<struct>\n`;

	// we start constructing the body of the method call
	let params = "";
	Object.entries(settings).forEach((entry) => {
		// for each of the setting, obtain the key and value
		const [key, value] = entry;
		// append the key name
		params += `<member>\n<name>${key}</name>\n`;
		if (Array.isArray(value)) {
			// if the value is an array
			// append each element in the <array></array> tag
			params += `<value><array><data>\n`;
			value.forEach((item) => (params += `<value>${item}</value>\n`));
			params += `</data></array></value>\n`;
		} else {
			// if the value is not an array, simply add the value
			params += `<value>${value}</value>\n`;
		}
		// close the param xml string
		params += `</member>\n`;
	});

	xmlString += params;
	// close the xml string
	xmlString += `</struct>\n</value>\n</param>\n</params>\n</methodCall>`;

	return xmlString;
};

const trimXML_RPCResponse = (xmlString) => {
	return xmlString
		.replaceAll("<param>", "")
		.replaceAll("</param>", "")
		.replaceAll("<params>", "")
		.replaceAll("</params>", "")
		.replaceAll("<struct>", "")
		.replaceAll("</struct>", "")
		.replaceAll("<value>", "")
		.replaceAll("</value>", "")
		.replaceAll("<array>", "")
		.replaceAll("</array>", "")
		.replaceAll("<data>", "")
		.replaceAll("</data>", "")
		.replaceAll("<double>", "<value>")
		.replaceAll("</double>", "</value>")
		.replaceAll("<double />", "<value />")
		.replaceAll("<string>", "<value>")
		.replaceAll("</string>", "</value>")
		.replaceAll("<string />", "<value />")
		.replaceAll("<boolean>", "<value>")
		.replaceAll("</boolean>", "</value>")
		.replaceAll("<boolean />", "<value />")
		.replaceAll("<base64>", "<value>")
		.replaceAll("</base64>", "</value>")
		.replaceAll("<base64 />", "<value />")
		.replaceAll("<int>", "<value>")
		.replaceAll("</int>", "</value>")
		.replaceAll("<int />", "<value />");
};

const formatGetProducts = (productsData) => {
	const products = [];
	const template = {
		milestones: [],
		name: "",
		components: [],
		description: "",
		versions: [],
		default_milestone: "---",
		is_active: "1",
		has_unconfirmed: "1",
		classification: "",
		id: ""
	};

	productsData.member.member.forEach((element, index) => {
		template[element.name] = element.value ? element.value : element.member;
		if (index % 10 === 9) {
			products.push({ ...template });
		}
	});

	return products;
};
