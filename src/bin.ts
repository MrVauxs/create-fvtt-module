#!/usr/bin/env node
import * as p from "@clack/prompts";
import { cyan } from "kolorist";
import { mkdir, cp } from "fs/promises";
import { packs, systems } from "./options";
import { existsSync, rmSync } from "fs";

p.intro(`Creating a new Foundry VTT module...`);

let deleteFolder = false;
const data = await p.group(
	{
		title: () =>
			p.text({
				message: "Module Title?",
				placeholder: "My New Module",
				defaultValue: "My New Module",
			}),
		id: ({ results }: any) =>
			p.text({
				message: "Module ID?",
				initialValue:
					results.title
						?.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^a-z0-9-]/g, "") ?? "my-module",
				defaultValue:
					results.title
						?.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^a-z0-9-]/g, "") ?? "my-module",
				placeholder:
					results.title
						?.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^a-z0-9-]/g, "") ?? "my-module",
			}),
		exists: async ({ results }: any) => {
			const exists = existsSync(`./${results.id}`);
			if (exists) {
				const confirm = await p.confirm({
					message: "Folder already exists. Overwrite?",
					initialValue: false,
				});
				if (!confirm) {
					p.cancel("Cancelled due to already existing folder.");
					process.exit(0);
				} else {
					deleteFolder = true;
				}
			}
			return Promise.resolve();
		},

		description: () =>
			p.text({ message: "Module Description?", defaultValue: "" }),
		version: () =>
			p.select({
				message: "Foundry Version?",
				initialValue: "13",
				options: [
					// Just V13 and V14
					{ label: "V13", value: "13" },
					{ label: "V14", value: "14" },
				],
			}),
		system: () =>
			p.multiselect({
				message: "What System?",
				initialValues: ["dnd5e"],
				options: systems.map((system) => ({
					label: system.id,
					value: system.id,
				})),
			}),
		packs: () =>
			p.multiselect({
				message: "What Packs?",
				required: false,
				options: packs.map((pack) => ({
					label: pack.label,
					value: pack,
				})),
			}),
		containPacks: ({ results }: any) =>
			results.packs?.length > 0
				? p.confirm({
						message: "Put Packs in a Folder?",
						initialValue: true,
					})
				: Promise.resolve(false),
		containPacksFolder: ({ results }: any) =>
			results.containPacks
				? p.text({
						message: "Folder Name?",
						placeholder: results.title,
						defaultValue: results.title,
					})
				: Promise.resolve(),
	},
	{ onCancel: () => process.exit(0) },
);

await p.tasks([
	{
		title: "Deleting existing directory",
		enabled: deleteFolder,
		task: async () => {
			if (deleteFolder) rmSync(data.id, { recursive: true });
			return "Existing directory deleted";
		},
	},
	{
		title: "Making directory",
		task: async () => {
			await mkdir(data.id, { recursive: true });
			return "Directory created";
		},
	},
	{
		title: "Copying template",
		task: async () => {
			await cp(new URL("templates/default", import.meta.url), data.id, {
				recursive: true,
			});
			return "Template copied";
		},
	},
	{
		title: "Writing module.json",
		task: async () => {
			const modPath = `${data.id}/module.json`;
			const mod = (await Bun.file(modPath).json()) as Record<string, any>;

			// inject user data
			mod.id = data.id;
			mod.title = data.title;
			mod.description = data.description;
			mod.version = {
				minimum: data.version,
				verified: data.version,
				maximum: data.version + 1,
			};
			mod.relationships.system = data.system.map((system) =>
				systems.find((s) => s.id === system),
			);
			mod.esmodules = [`dist/${data.id}.js`];
			mod.styles = [`dist/${data.id}.css`];
			mod.packs = data.packs;
			if (data.containPacks) {
				mod.packFolders = [
					{
						name: data.containPacksFolder,
						sorting: "m",
						color: "#00000f",
						packs: data.packs.map((x) => x.name),
					},
				];
			}
			if (data.system.includes("dnd5e")) {
				mod.flags.dnd5e = {
					sourceBooks: {
						[data.id]: data.title,
					},
					spellLists: [],
				};
			}

			await Bun.write(modPath, JSON.stringify(mod, null, "\t"));
		},
	},
	{
		title: "Writing README.md",
		task: async () => {
			const readmePath = `${data.id}/README.md`;
			const readme = `# ${data.title}
					${data.description}

					## Installation

					\`\`\`
					cd ${data.id} && bun install
					\`\`\`

					${
						data.system.includes("dnd5e")
							? `
							D&D5e Wiki: https://github.com/foundryvtt/dnd5e/wiki
							D&D5e Specific Module Flags: https://github.com/foundryvtt/dnd5e/wiki/Module-Registration`
							: ""
					}

					${
						data.system.includes("pf2e")
							? `
							PF2e Wiki: https://github.com/foundryvtt/pf2e/wiki
							`
							: ""
					}
			`;

			await Bun.write(readmePath, readme);
		},
	},
]);

p.outro(`cd ${cyan(data.id)} && bun install`);
