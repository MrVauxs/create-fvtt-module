import { mkdir, cp, readFile, writeFile } from "fs/promises";
import { existsSync, rmSync } from "fs";
import { join, basename } from "path";
import { systems } from "./options.js";
import { buildSystemRelationships, buildPacks, safeJsonParse, PackDefinition } from "./utils.js";

export interface ScaffoldConfig {
	template: string;
	title: string;
	id: string;
	description: string;
	version: string;
	compatMax?: string;
	socket?: boolean;
	system: string[];
	packs: PackDefinition[];
	containPacks: boolean;
	containPacksFolder?: string;
	quickstart?: boolean;
}

export interface ScaffoldOptions {
	/** Directory that contains the template folders (e.g. `<pkg>/templates`). */
	templatesDir: string;
	/** Destination directory for the generated module. */
	modulePath: string;
	/** Whether to delete an existing destination before creating it. */
	deleteFolder?: boolean;
	/** Optional progress reporter for CLI spinners. */
	onProgress?: (message: string) => void;
}

/**
 * Populates a template module.json with the user's choices. Pure transform —
 * no filesystem access — so its output can be asserted directly.
 */
export function buildModuleJson(
	template: Record<string, unknown>,
	config: ScaffoldConfig,
): Record<string, unknown> {
	const mod = { ...template };

	mod.id = config.id;
	mod.title = config.title;
	mod.description = config.description;
	mod.compatibility = {
		minimum: config.version,
		verified: config.version,
		...(config.compatMax ? { maximum: config.compatMax } : {}),
	};

	if (config.socket) {
		mod.socket = true;
	}

	if (config.template === "vite") {
		mod.languages = [
			{
				lang: "en",
				name: "English",
				path: "lang/en.json",
			},
		];
	}

	mod.relationships = {
		systems: buildSystemRelationships(config.system, systems),
	};
	mod.packs = buildPacks(config.packs, config.system);

	if (config.containPacks) {
		mod.packFolders = [
			{
				name: config.containPacksFolder,
				sorting: "m",
				color: "#00000f",
				packs: (mod.packs as Array<{ name: string }>).map((x) => x.name),
			},
		];
	}

	if (config.quickstart) {
		mod.quickstart = {};
	}

	if (config.system.includes("dnd5e")) {
		(mod.flags as Record<string, unknown>) ??= {};
		(mod.flags as Record<string, unknown>).dnd5e = {
			sourceBooks: {
				[config.id]: config.title,
			},
			spellLists: [],
		};
	}

	if (config.system.includes("pf2e")) {
		(mod.flags as Record<string, unknown>) ??= {};
		(mod.flags as Record<string, Record<string, unknown>>)[config.id] = {
			"pf2e-homebrew": {
				languages: {},
				armorGroups: {},
				baseArmors: {},
				classTraits: {},
				weaponCategories: {},
				weaponGroups: {},
				baseWeapons: {},
				creatureTraits: {},
				featTraits: {},
				spellTraits: {},
				weaponTraits: {},
				shieldTraits: {},
				equipmentTraits: {},
			},
		};
	}

	return mod;
}

/** Builds the generated module's README. Pure transform. */
export function buildReadme(config: ScaffoldConfig, hasPackageJSON: boolean): string {
	const parts: string[] = [];
	parts.push(`# ${config.title}`);
	parts.push(config.description);
	parts.push("");
	parts.push("## Installation");
	parts.push("");
	parts.push("```");
	parts.push(`cd ${config.id} ${hasPackageJSON ? "&& bun install" : "and get to making stuff!"}`);
	parts.push("```");

	if (config.template === "vite") {
		parts.push("");
		parts.push("## Scripts");
		parts.push("");
		parts.push("| Script | Description |");
		parts.push("|--------|-------------|");
		parts.push("| `dev` | Start the development server with HMR |");
		parts.push("| `build` | Build the module for production (includes compendiums) |");
		parts.push("| `build:no-packs` | Build without recompiling compendium packs |");
		parts.push("| `watch` | Watch mode — rebuilds on file change, skips compendiums |");
		parts.push("| `symlink` | Symlink the module to your Foundry data directory |");
		parts.push("| `extract` | Extract Foundry compendium packs to JSON |");
	}

	parts.push("");
	parts.push("## Resources");
	parts.push("");

	if (config.system.includes("dnd5e")) {
		parts.push("D&D5e Wiki: https://github.com/foundryvtt/dnd5e/wiki");
		parts.push("D&D5e Specific Module Flags: https://github.com/foundryvtt/dnd5e/wiki/Module-Registration");
		parts.push("");
	}

	if (config.system.includes("pf2e")) {
		parts.push("PF2e Wiki: https://github.com/foundryvtt/pf2e/wiki");
		parts.push("");
	}

	if (config.system.includes("sf2e")) {
		parts.push("SF2e Wiki: https://github.com/schultzcole/sf2e/wiki");
		parts.push("");
	}

	return parts.join("\n");
}

/**
 * End-to-end scaffolding pipeline used by the CLI: copies the chosen template,
 * writes the populated module.json, and generates the README. This is the
 * single source of truth for what `create-fvtt-module` produces on disk.
 */
export async function scaffoldModule(config: ScaffoldConfig, options: ScaffoldOptions): Promise<void> {
	const { templatesDir, modulePath, deleteFolder, onProgress } = options;
	const report = (msg: string) => onProgress?.(msg);

	if (deleteFolder) {
		report("Deleting existing directory...");
		rmSync(modulePath, { recursive: true, force: true });
	}

	report("Creating directory...");
	await mkdir(modulePath, { recursive: true });

	report("Copying template...");
	// Never carry a template's local dev artifacts into the new module.
	const skipCopy = new Set(["node_modules", ".git"]);
	await cp(join(templatesDir, config.template), modulePath, {
		recursive: true,
		filter: (source) => !skipCopy.has(basename(source)),
	});

	report("Writing module.json...");
	const modPath = join(modulePath, "module.json");
	const template = safeJsonParse<Record<string, unknown>>(await readFile(modPath, "utf8"), modPath);
	const mod = buildModuleJson(template, config);
	await writeFile(modPath, JSON.stringify(mod, null, "\t"));

	report("Writing README.md...");
	const hasPackageJSON = existsSync(join(modulePath, "package.json"));
	await writeFile(join(modulePath, "README.md"), buildReadme(config, hasPackageJSON));
}
