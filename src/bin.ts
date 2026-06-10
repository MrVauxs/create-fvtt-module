#!/usr/bin/env node
import * as p from "@clack/prompts";
import { cyan, lightGreen } from "kolorist";
import { readFile } from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";
import { parseArgs } from "util";
import { isNewerVersion, slugify, isValidModuleId, safeJsonParse, detectPackageManager, PackDefinition } from "./utils.js";
import { scaffoldModule, type ScaffoldConfig } from "./scaffold.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const pm = detectPackageManager();

async function checkForUpdates() {
	try {
		const response = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`);
		if (!response.ok) return;
		const latestPkg = await response.json() as typeof pkg;
		if (isNewerVersion(latestPkg.version, pkg.version)) {
			const updateCommands: Record<string, string> = {
				bun: `bun add -g ${pkg.name}@latest --no-cache`,
				pnpm: `pnpm add -g ${pkg.name}@latest`,
				yarn: `yarn global add ${pkg.name}@latest`,
				npm: `npm install -g ${pkg.name}@latest`,
			};
			console.log(`\n${cyan("Update available:")} ${pkg.version} → ${latestPkg.version}`);
			console.log(`Run: ${lightGreen(updateCommands[pm]!)}\n`);
		}
	} catch {
		// silently fail if update check doesn't work
	}
}

await checkForUpdates();

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

interface Results extends ScaffoldConfig {
	enabledAddons: string[];
	installDeps: boolean;
	initGit: boolean;
	quickstart: boolean;
	socket: boolean;
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
		const addonPath = packageDir(`../addons/${dir}/addon.json`);
		const addonJson = safeJsonParse<Addon>(await readFile(addonPath, "utf8"), addonPath);
		return {
			...addonJson,
			id: dir,
		};
	}),
);

const data = await p.group(
	{
		title: () => {
			if (cliTitle) return Promise.resolve(cliTitle);
			return p.text({
				message: "Module Title?",
				placeholder: "My New Module",
				defaultValue: "My New Module",
			});
		},
		id: (opts) => {
			const defaultId = slugify(opts.results.title as string | undefined);
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
					if (!isValidModuleId(value)) {
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
		template: async () => {
			if (templateFlag && templates.includes(templateFlag)) {
				return templateFlag;
			}
			if (templateFlag) {
				p.log.warn(`Unknown template "${templateFlag}". Available: ${templates.join(", ")}`);
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
		description: () =>
			p.text({ message: "Module Description?", defaultValue: "" }),
		version: () =>
			p.select({
				message: "Foundry Version?",
				initialValue: "13",
				options: foundryVersions,
			}),
		socket: () =>
			p.confirm({
				message: "Enable module socket? (game.socket, for GM <=> player messaging)",
				initialValue: false,
			}),
		system: () =>
			p.multiselect({
				message: "What System?",
				initialValues: [],
				required: false,
				options: systems.map((system) => ({
					label: system.id,
					value: system.id,
				})),
			}),
		packs: (o) =>
			(o?.results?.system?.length) ? p.multiselect({
				message: "What Packs?",
				required: false,
				initialValues: [],
				options: packs.map((pack) => ({
					label: pack.label,
					value: pack,
				})),
			}) : Promise.resolve([]),
		containPacks: (opts) => {
			const packResults = opts.results.packs as PackDefinition[] | undefined;
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
		quickstart: (opts) => {
			const packResults = opts.results.packs as PackDefinition[] | undefined;
			const hasAdventure = packResults?.some((p) => p.type === "Adventure") ?? false;
			if (!hasAdventure) return Promise.resolve(false);
			return p.confirm({
				message: "Add quickstart? (https://foundryvtt.com/article/adventure/)",
				initialValue: true,
			});
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
		installDeps: (opts) => {
			const template = opts.results.template as string | undefined;
			if (!template) return Promise.resolve(false);
			const templateHasPackageJson = existsSync(join(packageDir("../templates"), template, "package.json"));
			if (!templateHasPackageJson) return Promise.resolve(false);
			return p.confirm({
				message: "Install dependencies?",
				initialValue: true,
			});
		},
		initGit: () =>
			p.confirm({
				message: "Initialize a git repository?",
				initialValue: true,
			}),
	},
	{ onCancel: () => process.exit(1) },
) as unknown as Results;

const modulePath = resolve(process.cwd(), data.id);

function hasPackageJSON(): boolean {
	return existsSync(join(modulePath, "package.json"));
}

const scaffoldSpin = p.spinner();
scaffoldSpin.start(`Scaffolding module...`);
try {
	await scaffoldModule(data, {
		templatesDir: join(__dirname, "../templates"),
		modulePath,
		deleteFolder,
		onProgress: scaffoldSpin.message,
	});
	scaffoldSpin.stop("Scaffolding completed successfully");
} catch (err) {
	scaffoldSpin.stop(`Scaffolding failed: ${err instanceof Error ? err.message : String(err)}`);
	p.log.error(err instanceof Error ? err.message : String(err));
}

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

await p.tasks([
	{
		enabled: data.initGit,
		title: "[Task] Initializing git repository",
		task: async (m) => {
			m("Running git init...");
			execSync("git init", { cwd: modulePath, stdio: "ignore" });
			m("Adding files to git...");
			execSync("git add -A", { cwd: modulePath, stdio: "ignore" });
			m("Committing files...");
			execSync('git commit -m "create-fvtt-module init"', { cwd: modulePath, stdio: "ignore" });
			return "Git repository initialized";
		},
	},
	{
		enabled: data.installDeps,
		title: `[Task] Installing dependencies`,
		task: async (m) => {
			m("Installing dependencies...");
			execSync(`${pm} install`, { cwd: modulePath, stdio: "ignore" });
			return "Dependencies installed";
		},
	},
]);

const nextStep = hasPackageJSON() && !data.installDeps ? `&& ${pm} install` : "and get to making stuff!";
p.outro(`cd ${cyan(data.id)} ${nextStep}`);