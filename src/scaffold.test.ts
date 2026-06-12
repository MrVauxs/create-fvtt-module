import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { scaffoldModule, type ScaffoldConfig } from "./scaffold.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "..", "templates");

let workDir: string;

beforeEach(async () => {
	workDir = await mkdtemp(join(tmpdir(), "cfm-test-"));
});

afterEach(async () => {
	// Windows can briefly hold file handles open; retry the cleanup.
	await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function makeConfig(overrides: Partial<ScaffoldConfig> = {}): ScaffoldConfig {
	return {
		template: "vite",
		title: "My Test Module",
		id: "my-test-module",
		description: "A test module",
		version: "13",
		system: ["dnd5e"],
		packs: [],
		containPacks: false,
		...overrides,
	};
}

async function readModuleJson(modulePath: string): Promise<Record<string, any>> {
	return JSON.parse(await readFile(join(modulePath, "module.json"), "utf8"));
}

describe("scaffoldModule (end-to-end against real templates)", () => {
	it("copies the vite template and populates module.json", async () => {
		const config = makeConfig();
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		// Template files were copied.
		expect(existsSync(join(modulePath, "package.json"))).toBe(true);
		expect(existsSync(join(modulePath, "vite.config.ts"))).toBe(true);

		const mod = await readModuleJson(modulePath);
		expect(mod.id).toBe("my-test-module");
		expect(mod.title).toBe("My Test Module");
		expect(mod.description).toBe("A test module");
		expect(mod.compatibility).toEqual({ minimum: "13", verified: "13", maximum: "" });
	});

	it("does not copy node_modules/.git from the template", async () => {
		const config = makeConfig();
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		expect(existsSync(join(modulePath, "node_modules"))).toBe(false);
		expect(existsSync(join(modulePath, ".git"))).toBe(false);
	});

	it("scaffolds the basic template too", async () => {
		const config = makeConfig({ template: "basic", id: "basic-mod" });
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		expect(existsSync(join(modulePath, "module.json"))).toBe(true);
		const mod = await readModuleJson(modulePath);
		expect(mod.id).toBe("basic-mod");
	});

	it("writes relationships with no undefined entries when a system is unknown", async () => {
		const config = makeConfig({ system: ["dnd5e", "totally-fake-system"] });
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		const mod = await readModuleJson(modulePath);
		expect(mod.relationships.systems).toHaveLength(1);
		expect(mod.relationships.systems[0].id).toBe("dnd5e");
		expect(mod.relationships.systems).not.toContain(null);
		// JSON.stringify drops undefined, so also assert the raw text is clean.
		const raw = await readFile(join(modulePath, "module.json"), "utf8");
		expect(raw).not.toContain("null");
	});

	it("expands packs once per selected system", async () => {
		const config = makeConfig({
			system: ["dnd5e", "pf2e"],
			packs: [
				{
					label: "Items",
					name: "items",
					path: "packs/items",
					system: "",
					type: "Item",
					ownership: { PLAYER: "OBSERVER" },
				},
			],
		});
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		const mod = await readModuleJson(modulePath);
		expect(mod.packs.map((p: any) => p.name)).toEqual(["dnd5e-items", "pf2e-items"]);
		expect(mod.packs.map((p: any) => p.path)).toEqual([
			"packs/dnd5e-items",
			"packs/pf2e-items",
		]);
	});

	it("adds a pack folder when containPacks is set", async () => {
		const config = makeConfig({
			containPacks: true,
			containPacksFolder: "My Packs",
			packs: [
				{
					label: "Items",
					name: "items",
					path: "packs/items",
					system: "",
					type: "Item",
					ownership: {},
				},
			],
		});
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		const mod = await readModuleJson(modulePath);
		expect(mod.packFolders).toHaveLength(1);
		expect(mod.packFolders[0].name).toBe("My Packs");
		expect(mod.packFolders[0].packs).toEqual(["dnd5e-items"]);
	});

	it("injects system-specific flags for dnd5e and pf2e", async () => {
		const config = makeConfig({ system: ["dnd5e", "pf2e"] });
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		const mod = await readModuleJson(modulePath);
		expect(mod.flags.dnd5e.sourceBooks).toEqual({ "my-test-module": "My Test Module" });
		expect(mod.flags["my-test-module"]["pf2e-homebrew"]).toBeDefined();
	});

	it("adds quickstart field when quickstart is true", async () => {
		const config = makeConfig({ quickstart: true });
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		const mod = await readModuleJson(modulePath);
		expect(mod.quickstart).toEqual({});
	});

	it("does not add quickstart field when quickstart is false", async () => {
		const config = makeConfig({ quickstart: false });
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		const mod = await readModuleJson(modulePath);
		expect(mod.quickstart).toBeUndefined();
	});

	it("generates a README with title, vite scripts, and system links", async () => {
		const config = makeConfig({ system: ["dnd5e"] });
		const modulePath = join(workDir, config.id);

		await scaffoldModule(config, { templatesDir, modulePath });

		const readme = await readFile(join(modulePath, "README.md"), "utf8");
		expect(readme).toContain("# My Test Module");
		expect(readme).toContain("## Scripts"); // vite template has a package.json
		expect(readme).toContain("dnd5e/wiki");
	});

	it("overwrites an existing directory when deleteFolder is set", async () => {
		const config = makeConfig({ id: "reused" });
		const modulePath = join(workDir, config.id);

		// Pre-create the directory with a stale file that should be wiped.
		await mkdir(modulePath, { recursive: true });
		await writeFile(join(modulePath, "stale.txt"), "old");

		await scaffoldModule(config, { templatesDir, modulePath, deleteFolder: true });

		expect(existsSync(join(modulePath, "stale.txt"))).toBe(false);
		expect(existsSync(join(modulePath, "module.json"))).toBe(true);
	});

	it("reports progress through the onProgress callback", async () => {
		const config = makeConfig();
		const modulePath = join(workDir, config.id);
		const messages: string[] = [];

		await scaffoldModule(config, {
			templatesDir,
			modulePath,
			onProgress: (m) => messages.push(m),
		});

		expect(messages.length).toBeGreaterThan(0);
		expect(messages.some((m) => m.includes("module.json"))).toBe(true);
	});
});
