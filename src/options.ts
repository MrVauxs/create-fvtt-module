import { PackDefinition } from "./utils.js";

const packs: PackDefinition[] = [
	{
		label: "Adventures",
		name: "adventure",
		path: "packs/adventure",
		system: "REQUIRED",
		type: "Adventure",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OBSERVER",
		},
	},
	{
		label: "Items",
		name: "items",
		path: "packs/items",
		system: "REQUIRED",
		type: "Item",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OBSERVER",
		},
	},
	{
		label: "Actors",
		name: "actors",
		path: "packs/actors",
		system: "REQUIRED",
		type: "Actor",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OWNER",
		},
	},
	{
		label: "Journals",
		name: "journals",
		path: "packs/journals",
		type: "JournalEntry",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OBSERVER",
		},
	},
	{
		label: "Macros",
		name: "macros",
		path: "packs/macros",
		type: "Macro",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OWNER",
		},
	},
	{
		label: "Playlists",
		name: "playlists",
		path: "packs/playlists",
		type: "Playlist",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OWNER",
		},
	},
	{
		label: "Tables",
		name: "rolltables",
		path: "packs/rolltables",
		type: "RollTable",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OWNER",
		},
	},
	{
		label: "Scenes",
		name: "scenes",
		path: "packs/scenes",
		type: "Scene",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OWNER",
		},
	},
	{
		label: "Active Effects",
		name: "activeEffects",
		path: "packs/activeEffects",
		type: "ActiveEffect",
		ownership: {
			PLAYER: "OBSERVER",
			ASSISTANT: "OWNER",
		},
	},
	{
		label: "Cards",
		name: "cards",
		path: "packs/cards",
		type: "Cards",
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
		compatibility: {
			minimum: "5",
		},
	},
	{
		id: "pf2e",
		type: "system",
		compatibility: {
			minimum: "8",
		},
	},
	{
		id: "sf2e",
		type: "system",
		compatibility: {
			minimum: "1",
		},
	},
];

const foundryVersions = [
	{ label: "V13", value: "13" },
	{ label: "V14", value: "14" },
];

export { packs, systems, foundryVersions };
