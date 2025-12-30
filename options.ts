const packs = [
	{
		label: "Adventure",
		name: "adventure",
		path: "packs/adventure",
		system: "dnd5e",
		type: "Adventure",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OBSERVER",
		},
	},
	{
		label: "Player Options",
		name: "items",
		path: "packs/items",
		system: "dnd5e",
		type: "Item",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OBSERVER",
		},
	},
	{
		label: "Journals",
		name: "journals",
		path: "packs/journals",
		system: "dnd5e",
		type: "JournalEntry",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OBSERVER",
		},
	},
	{
		label: "Bestiary",
		name: "actors",
		path: "packs/actors",
		system: "dnd5e",
		type: "Actor",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OWNER",
		},
	},
];

const systems = [
	{
		id: "dnd5e",
		type: "system",
		manifest:
			"https://github.com/foundryvtt/dnd5e/releases/latest/download/system.json",
		compatibility: {
			minimum: "5.2",
		},
	},
	{
		id: "pf2e",
		type: "system",
		manifest:
			"https://github.com/foundryvtt/pf2e/releases/latest/download/system.json",
		compatibility: {
			minimum: "7.8",
		},
	},
];

export { packs, systems };
