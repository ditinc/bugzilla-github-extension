var STORAGE_DEFAULTS = {
	bugzillaURL: "",
	bugInfoFields: [
		{field: "bug_status", label: "Status"},
		{field: "resolution", label: "Resolution"},
		{field: "estimated_time", label: "Estimated Hours"},
		{field: "assigned_to", label: "AssignedTo"},
		{field: "qa_contact", label: "QAContact"}
	],
	bugList: {
		fields: [
			{field: "bug_severity", label: "Severity"},
			{field: "priority", label: "Priority"},
			{field: "assigned_to", label: "AssignedTo"},
			{field: "bug_status", label: "Status"},
			{field: "resolution", label: "Resolution"},
			{field: "target_milestone", label: "Target Milestone"},
			{field: "qa_contact", label: "QAContact"},
			{field: "short_desc", label: "Description"},
			{field: "estimated_time", label: "Estimated Hours"},
			{field: "work_time", label: "Hours Worked"},
			{field: "remaining_time", label: "Remaining Hours"}
		],
		sortOrder: [
			{field: "bug_status", label: "Status"},
			{field: "resolution", label: "Resolution"},
			{field: "bug_id", label: "Bug #"}
		]
	},
	fields: {
		gitHubPullRequestURL: "",
		gitHubLabels: "",
		revision: "",
		codestatus: ""
	},
	gitHubURL: "",
	productMap: {},
	selectedProduct: "",
	terms: {
		bug: "bug",
		bugs: "bugs",
		bugzilla: "Bugzilla"
	},
	values: {
		codestatusMerge: "",
		codestatusMergeParent: "",
		codestatusRelease: "",
		codestatusPreRelease: ""
	}
};