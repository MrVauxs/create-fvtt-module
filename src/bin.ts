#!/usr/bin/env node
import * as p from "@clack/prompts";
import { cyan, lightGreen } from "kolorist";
import { mkdir, cp, readFile, writeFile } from "fs/promises";
import { existsSync, readdirSync, rmSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { parseArgs } from "util";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

import { packs, systems, foundryVersions } from "./options.js";
import { migrateFrom } from "./migrate.js";

const cliArgs = process.argv.slice(2);

const { values: flags, positionals } = parseArgs({
	args: cliArgs,
	options: {
		help: { type: "boolean", short: "h", default: false },
		version: { type: "boolean", short: "v", default: false },
		"auto-id": { type: "boolean", default: false },
		template: { type: "string", default: "" },
		"migrate-from": { type: "string", default: "" },
		override: { type: "boolean", default: false },
	},
	strict: false,
	allowPositionals: true,
});

if (flags.help) {
	console.log(`Usage: create-fvtt-module [title] [options]

Scaffold a new Foundry VTT module.

Arguments:
  title                  Module title (optional, prompted if not provided)

Options:
  --help, -h             Show this help message
  --version, -v          Show version number
  --auto-id              Auto-generate module ID from title
  --template <name>      Specify template to use (e.g., vite, basic)
  --migrate-from <path>  Migrate compendium packs from an existing module (filepath or URL to module.json)
  --override             Skip confirmation and overwrite existing folder without prompt

Examples:
  create-fvtt-module "My Module" --auto-id
  create-fvtt-module --template vite
  create-fvtt-module "My Module" --auto-id --template vite
  create-fvtt-module "My Module" --migrate-from ./existing-module/module.json
  create-fvtt-module "My Module" --migrate-from https://example.com/module.json`);
	process.exit(0);
}

if (flags.version) {
	console.log(pkg.version);
	process.exit(0);
}

const cliTitle: string | undefined = positionals[0] as string | undefined;
const autoId = flags["auto-id"] as boolean;
const templateFlag = flags.template as string;
const migrateFromFlag = flags["migrate-from"] as string;
const overrideFlag = flags.override as boolean;

const moduleIdRegex = /^[a-z0-9-]+$/;

interface PackEntry {
	label: string;
	name: string;
	path: string;
	system: string;
	type: string;
	ownership: Record<string, string>;
}

interface Results {
	template: string;
	title: string;
	id: string;
	description: string;
	version: string;
	system: string[];
	packs: PackEntry[];
	containPacks: boolean;
	containPacksFolder?: string;
	enabledAddons: string[];
}

p.intro(`${lightGreen(pkg.name)} v${pkg.version}`);
p.log.step(`Creating a new Foundry VTT module...`);

const packageDir = (d: string) => resolve(__dirname, d);

let deleteFolder = false;
const templates = readdirSync(packageDir("../templates"));
const addonDirs = readdirSync(packageDir("../addons")).filter((item) => {
	const stat = statSync(packageDir(`../addons/${item}`));
	return stat.isDirectory();
});

interface Addon {
	name: string;
	description: string;
	default: boolean;
}

const addons: (Addon & { id: string })[] = await Promise.all(
	addonDirs.map(async (dir) => {
		const addonJson = JSON.parse(await readFile(packageDir(`../addons/${dir}/addon.json`), "utf8")) as Addon;
		return {
			...addonJson,
			id: dir,
		};
	}),
);

const data = await p.group(
	{
		template: async () => {
			if (templateFlag && templates.includes(templateFlag)) {
				return templateFlag;
			}
			if (templates.length === 1) {
				return templates[0]!;
			}
			const template = await p.select({
				message: "Select a template",
				options: templates.map((template) => ({
					label: template,
					value: template,
				})),
			});
			if (p.isCancel(template)) process.exit(1);
			return template;
		},
		title: () => {
			if (cliTitle) return Promise.resolve(cliTitle);
			return p.text({
				message: "Module Title?",
				placeholder: "My New Module",
				defaultValue: "My New Module",
			});
		},
		id: (opts) => {
			const defaultId =
				(opts.results.title as string | undefined)
					?.toLowerCase()
					.replace(/\s+/g, "-")
					.replace(/[^a-z0-9-]/g, "") ?? "my-module";
			if (autoId) return Promise.resolve(defaultId);
			return p.text({
				message: "Module ID?",
				initialValue: defaultId,
				defaultValue: defaultId,
				placeholder: defaultId,
				validate: (value: string | undefined) => {
					if (!value) {
						return "Module ID is required";
					}
					if (!moduleIdRegex.test(value)) {
						return "Module ID must be lowercase alphanumeric with hyphens only (e.g., my-awesome-module)";
					}
				},
			});
		},
		exists: async (opts) => {
			const id = opts.results.id as string;
			const fullPath = resolve(process.cwd(), id);
			const exists = existsSync(fullPath);
			if (exists) {
				if (overrideFlag) {
					deleteFolder = true;
					return;
				}
				const confirm = await p.confirm({
					message: `Folder already exists at ${fullPath}. Overwrite?`,
					initialValue: false,
				});
				if (p.isCancel(confirm) || !confirm) {
					p.cancel("Cancelled due to already existing folder.");
					process.exit(1);
				} else {
					deleteFolder = true;
				}
			}
		},
		description: () =>
			p.text({ message: "Module Description?", defaultValue: "" }),
		version: () =>
			p.select({
				message: "Foundry Version?",
				initialValue: "13",
				options: foundryVersions,
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
				initialValues: [],
				options: packs.map((pack) => ({
					label: pack.label,
					value: pack,
				})),
			}),
		containPacks: (opts) => {
			const packResults = opts.results.packs as PackEntry[] | undefined;
			return (packResults?.length ?? 0) > 0
				? p.confirm({
					message: "Put Packs in a Folder?",
					initialValue: true,
				})
				: Promise.resolve(false);
		},
		containPacksFolder: (opts) => {
			const containPacks = opts.results.containPacks as boolean;
			const title = opts.results.title as string;
			return containPacks
				? p.text({
					message: "Folder Name?",
					placeholder: title,
					defaultValue: title,
				})
				: undefined;
		},
		enabledAddons: () => {
			if (addons.length > 0) {
				return p.multiselect({
					message: "Enable addons?",
					required: false,
					options: addons.map((addon) => ({
						label: `${addon.name} - ${addon.description}`,
						value: addon.id,
					})),
				});
			}
			return Promise.resolve([]);
		},
	},
	{ onCancel: () => process.exit(1) },
) as Results;

const modulePath = resolve(process.cwd(), data.id);

function hasPackageJSON(): boolean {
	return existsSync(join(modulePath, "package.json"));
}

await p.tasks([
	{
		title: "[Task] Deleting existing directory",
		enabled: deleteFolder,
		task: async () => {
			if (deleteFolder) rmSync(modulePath, { recursive: true, force: true });
			return "Existing directory deleted";
		},
	},
	{
		title: "[Task] Making directory",
		task: async () => {
			await mkdir(modulePath, { recursive: true });
			return `${modulePath} directory created`;
		},
	},
	{
		title: "[Task] Copying template",
		task: async () => {
			await cp(
				join(__dirname, `../templates/${data.template}`),
				modulePath,
				{
					recursive: true,
				},
			);
			return "Template copied";
		},
	},
	{
		title: "[Task] Writing module.json",
		task: async (m) => {
			const modPath = join(modulePath, "module.json");
			m(`Reading template module.json from ${modPath}...`);
			const mod = JSON.parse(await readFile(modPath, "utf8")) as Record<string, unknown>;
			m(`Populating module.json with provided data...`);

			mod.id = data.id;
			mod.title = data.title;
			mod.description = data.description;
			mod.compatibility = {
				minimum: data.version,
				verified: data.version,
			};
			mod.relationships = {
				systems: data.system.map((system) =>
					systems.find((s) => s.id === system),
				),
			};
			mod.packs = data.packs.flatMap((pack) =>
				data.system.map((system) => ({
					...pack,
					system,
					name: `${system}-${pack.name}`,
					path: `packs/${system}-${pack.name}`
				})),
			);
			if (data.containPacks) {
				mod.packFolders = [
					{
						name: data.containPacksFolder,
						sorting: "m",
						color: "#00000f",
						packs: (mod.packs as Array<{ name: string }>).map((x) => x.name),
					},
				];
			}
			if (data.system.includes("dnd5e")) {
				(mod.flags as Record<string, unknown>) ??= {};
				(mod.flags as Record<string, unknown>).dnd5e = {
					sourceBooks: {
						[data.id]: data.title,
					},
					spellLists: [],
				};
			}
			if (data.system.includes("pf2e")) {
				(mod.flags as Record<string, unknown>) ??= {};
				(mod.flags as Record<string, Record<string, unknown>>)[data.id] = {
					'pf2e-homebrew': {
						classTraits: {},
						creatureTraits: {},
						damageTypes: {},
						featTraits: {},
						languages: {},
						magicSchools: {},
						skills: {},
						spellTraits: {},
						weaponCategories: {},
						weaponGroups: {},
						baseWeapons: {},
						weaponTraits: {},
						equipmentTraits: {},
						shieldTraits: {},
					},
				};
			}

			await writeFile(modPath, JSON.stringify(mod, null, "\t"));

			return "module.json populated";
		},
	},
	{
		title: "[Task] Writing README.md",
		task: async () => {
			const readmeParts: string[] = [];
			readmeParts.push(`# ${data.title}`);
			readmeParts.push(data.description);
			readmeParts.push("");
			readmeParts.push("## Installation");
			readmeParts.push("");
			readmeParts.push("```");
			readmeParts.push(`cd ${data.id} ${hasPackageJSON() ? "&& bun install" : "and get to making stuff!"}`);
			readmeParts.push("```");

			if (data.template === "vite") {
				readmeParts.push("");
				readmeParts.push("## Scripts");
				readmeParts.push("");
				readmeParts.push("| Script | Description |");
				readmeParts.push("|--------|-------------|");
				readmeParts.push("| `dev` | Start the development server with HMR |");
				readmeParts.push("| `build` | Build the module for production |");
				readmeParts.push("| `symlink` | Symlink the module to your Foundry data directory |");
				readmeParts.push("| `extract` | Extract Foundry compendium packs |");
			}

			readmeParts.push("");
			readmeParts.push("## Resources");
			readmeParts.push("");

			if (data.system.includes("dnd5e")) {
				readmeParts.push("D&D5e Wiki: https://github.com/foundryvtt/dnd5e/wiki");
				readmeParts.push("D&D5e Specific Module Flags: https://github.com/foundryvtt/dnd5e/wiki/Module-Registration");
				readmeParts.push("");
			}

			if (data.system.includes("pf2e")) {
				readmeParts.push("PF2e Wiki: https://github.com/foundryvtt/pf2e/wiki");
				readmeParts.push("");
			}

			if (data.system.includes("sf2e")) {
				readmeParts.push("SF2e Wiki: https://github.com/schultzcole/sf2e/wiki");
				readmeParts.push("");
			}

			const readme = readmeParts.join("\n");

			await writeFile(join(modulePath, "README.md"), readme);

			return "README.md created";
		},
	},
]);

if (migrateFromFlag) {
	const spin = p.spinner();
	spin.start(`Migrating packs from ${cyan(migrateFromFlag)}...`);
	try {
		await migrateFrom(migrateFromFlag, modulePath, spin);
		spin.stop("Migration completed successfully");
	} catch (err) {
		spin.stop(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
		p.log.error(err instanceof Error ? err.message : String(err));
	}
}

if (data.enabledAddons && data.enabledAddons.length > 0) {
	for (const addonId of data.enabledAddons) {
		p.note(`[Addon] Running ${addonId} setup...`);

		const setupScript = packageDir(`../addons/${addonId}/setup.mjs`);

		const addonProcess = spawn(process.execPath, [setupScript], {
			stdio: "inherit",
			env: {
				...process.env,
				MODULE_DIR: modulePath,
				ADDON_ID: addonId,
			},
		});

		await new Promise<void>((resolve, reject) => {
			addonProcess.on("close", (code) => {
				if (code === 0) {
					resolve();
					return;
				}

				reject(
					new Error(`Addon ${addonId} setup failed with exit code ${code}`),
				);
			});

			addonProcess.on("error", reject);
		});
	}
}

const onCreatePath = join(modulePath, "scripts", "onCreate.mjs");
if (existsSync(onCreatePath)) {
	const runOnCreate = await p.confirm({
		message: "Run onCreate script?",
		initialValue: true,
	});
	if (p.isCancel(runOnCreate)) process.exit(1);

	if (runOnCreate) {
		p.note("[Task] Running onCreate script...");

		const onCreateProcess = spawn(process.execPath, [onCreatePath], {
			cwd: join(modulePath, "scripts"),
			stdio: "inherit",
			env: {
				...process.env,
				MODULE_DIR: modulePath,
			},
		});

		await new Promise<void>((resolve, reject) => {
			onCreateProcess.on("close", (code) => {
				if (code === 0) {
					resolve();
					return;
				}

				reject(new Error(`onCreate script failed with exit code ${code}`));
			});

			onCreateProcess.on("error", reject);
		});

		p.log.success("onCreate script completed");
	}
}

p.outro(`cd ${cyan(data.id)} ${hasPackageJSON() ? "&& bun install" : "and get to making stuff!"}`);