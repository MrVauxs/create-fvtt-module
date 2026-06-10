import { mkdir, readdir, readFile, writeFile, stat, copyFile, cp } from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import AdmZip from "adm-zip";
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { yellow, cyan } from "kolorist";
import { SpinnerResult } from "@clack/prompts";
import { safeJsonParse, isSafePackName } from "./utils.js";

interface PackEntry {
	label: string;
	name: string;
	path: string;
	system?: string;
	type: string;
	ownership?: Record<string, string>;
	[key: string]: unknown;
}

interface ModuleJson {
	id?: string;
	title?: string;
	description?: string;
	download?: string;
	packs?: PackEntry[];
	packFolders?: Array<{ name: string; packs: string[]; sorting?: string; color?: string; folders?: unknown[] }>;
	[key: string]: unknown;
}

export function isUrl(input: string): boolean {
	return input.startsWith("http://") || input.startsWith("https://");
}

async function readModuleJson(source: string, p: SpinnerResult): Promise<ModuleJson> {
	if (isUrl(source)) {
		p.message(`Fetching module.json from ${cyan(source)}...`);
		const response = await fetch(source);
		if (!response.ok) {
			throw new Error(`Failed to fetch module.json: ${response.status} ${response.statusText}`);
		}
		const text = await response.text();
		const parsed = safeJsonParse<ModuleJson>(text, source);
		p.message(`module.json fetched successfully`);
		return parsed;
	}

	if (!existsSync(source)) {
		throw new Error(`Path does not exist: ${source}`);
	}

	const sourceStat = await stat(source);
	const jsonPath = sourceStat.isDirectory() ? join(source, "module.json") : source;

	if (!existsSync(jsonPath)) {
		throw new Error(`module.json not found at ${source}`);
	}

	const content = await readFile(jsonPath, "utf8");
	return safeJsonParse<ModuleJson>(content, jsonPath);
}

async function downloadZipBuffer(url: string): Promise<Buffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download zip: ${response.status} ${response.statusText}`);
	}

	return Buffer.from(await response.arrayBuffer());
}

function findModuleRoot(extractDir: string): string {
	const entries = readdirSync(extractDir);
	const moduleJsonCandidates = entries.filter((e) => e === "module.json");
	if (moduleJsonCandidates.length > 0) {
		return extractDir;
	}

	for (const entry of entries) {
		const entryPath = join(extractDir, entry);
		try {
			const entryStat = statSync(entryPath);
			if (entryStat.isDirectory()) {
				const subEntries = readdirSync(entryPath);
				if (subEntries.includes("module.json")) {
					return entryPath;
				}
			}
		} catch {
			// skip
		}
	}

	return extractDir;
}

async function isLevelDBFolder(folderPath: string): Promise<boolean> {
	if (!existsSync(folderPath)) return false;
	const statResult = await stat(folderPath);
	if (!statResult.isDirectory()) return false;
	const entries = await readdir(folderPath);
	const levelDBMarkers = ["CURRENT", "LOCK", "MANIFEST-000001", "MANIFEST-000002"];
	return entries.some((e) => levelDBMarkers.some((m) => e === m || e.endsWith(".ldb") || e.endsWith(".log")));
}

async function findFiles(dir: string, baseDir: string, extensions: string[]): Promise<string[]> {
	const results: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...await findFiles(fullPath, baseDir, extensions));
		} else if (extensions.some((ext) => entry.name.endsWith(ext))) {
			results.push(fullPath);
		}
	}

	return results;
}

async function copyAssetsToMigration(moduleRoot: string): Promise<number> {
	const migrationDir = join("src", "migration");
	await mkdir(migrationDir, { recursive: true });

	const cssJsFiles = await findFiles(moduleRoot, moduleRoot, [".css", ".js"]);
	let copiedCount = 0;

	for (const filePath of cssJsFiles) {
		const relativePath = relative(moduleRoot, filePath);
		const destPath = join(migrationDir, relativePath.replace(/^[\\/]/, ""));
		const destDir = dirname(destPath);

		await mkdir(destDir, { recursive: true });
		await copyFile(filePath, destPath);
		copiedCount++;
	}

	return copiedCount;
}

export async function migrateFrom(source: string, modulePath: string, p: SpinnerResult): Promise<void> {
	const sourceModuleJson = await readModuleJson(source, p);

	if (!sourceModuleJson.packs || sourceModuleJson.packs.length === 0) {
		p.message("No packs found in the source module.json.");
		return;
	}

	const isLocal = !isUrl(source);

	let tempDir: string | null = null;
	let moduleRoot: string;

	if (isLocal) {
		const sourceStat = await stat(source);
		moduleRoot = sourceStat.isDirectory() ? source : dirname(source);
		p.message(`Using local module at ${cyan(moduleRoot)}`);
	} else {
		if (!sourceModuleJson.download) {
			throw new Error("No download URL found in module.json. The source module does not have a download property.");
		}

		p.message(`Downloading module from ${cyan(sourceModuleJson.download)}`);

		tempDir = join(modulePath, "temp", `${sourceModuleJson.id || `module-${Date.now()}`}`);
		await mkdir(tempDir, { recursive: true });
		const zipBuffer = await downloadZipBuffer(sourceModuleJson.download);
		const zip = new AdmZip(zipBuffer);
		zip.extractAllTo(tempDir, true);
		moduleRoot = findModuleRoot(tempDir);
	}

	try {
		p.message(`Found ${sourceModuleJson.packs.length} pack(s) in module.json: ${sourceModuleJson.packs.map((p) => p.name).join(", ")}`);

		const targetPacksDir = join(modulePath, "packs");
		const targetDataDir = join(modulePath, "data");
		await mkdir(targetPacksDir, { recursive: true });
		await mkdir(targetDataDir, { recursive: true });

		const newPacks: PackEntry[] = [];
		const newPackNames: string[] = [];

		for (const pack of sourceModuleJson.packs) {
			if (!isSafePackName(pack.name)) {
				p.message(`Skipping pack with unsafe name: ${pack.name}`);
				continue;
			}
			const sourcePackPath = join(moduleRoot, pack.path);
			const dbFileName = `${pack.name}.db`;
			const sourceDbFile = join(sourcePackPath, dbFileName);

			let sourceInputPath: string | null = null;
			let isFolder = false;

			if (await isLevelDBFolder(sourcePackPath)) {
				sourceInputPath = sourcePackPath;
				isFolder = true;
			} else if (existsSync(join(sourcePackPath, dbFileName))) {
				sourceInputPath = sourceDbFile;
			}

			if (!sourceInputPath) {
				p.message(`Pack not found at ${sourcePackPath} or ${sourceDbFile}. Skipping ${pack.name}.`);
				continue;
			}

			p.message(`Extracting ${yellow(pack.name)}...`);

			if (isFolder) {
				await cp(sourceInputPath, join(targetPacksDir, pack.name), { recursive: true });
			} else {
				await copyFile(sourceInputPath, join(targetPacksDir, dbFileName));
			}

			const targetDataPath = join(targetDataDir, pack.name);
			await mkdir(targetDataPath, { recursive: true });
			const extractInput = isFolder ? join(targetPacksDir, pack.name) : join(targetPacksDir, dbFileName);
			await extractPack(
				extractInput,
				targetDataPath,
				{
					expandAdventures: true,
					omitVolatile: true,
					folders: true,
					clean: true,
					jsonOptions: {
						space: "\t",
					},
				},
			);

			newPacks.push({
				label: pack.label || pack.name.charAt(0).toUpperCase() + pack.name.slice(1).replace(/-/g, " "),
				name: pack.name,
				path: `packs/${pack.name}`,
				system: pack.system || "",
				type: pack.type,
				ownership: pack.ownership || {
					PLAYER: "OBSERVER",
					ASSISTANT: "OBSERVER",
				},
			});
			newPackNames.push(pack.name);
		}

		if (newPacks.length > 0) {
			const targetModuleJsonPath = join(modulePath, "module.json");
			if (existsSync(targetModuleJsonPath)) {
				const content = await readFile(targetModuleJsonPath, "utf8");
				const targetModuleJson = safeJsonParse<ModuleJson>(content, targetModuleJsonPath);

				targetModuleJson.packs = newPacks;
				if (sourceModuleJson.packFolders) {
					targetModuleJson.packFolders = sourceModuleJson.packFolders;
				}

				await writeFile(targetModuleJsonPath, JSON.stringify(targetModuleJson, null, "\t"));
				p.message("Updated module.json with migrated packs");
			}
		}

		p.message("Extracting CSS and JS assets...");
		const assetCount = await copyAssetsToMigration(moduleRoot);
		p.message(`Copied ${assetCount} asset(s) to src/migration/`);

		p.message(`Migration complete! ${newPacks.length} pack(s) processed.${tempDir ? ` Extracted module kept in ${cyan(tempDir)}.` : ""}`);
	} catch (error) {
		p.message(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
}
