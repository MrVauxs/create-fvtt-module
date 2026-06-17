import { execSync } from "child_process";

interface SystemDefinition {
	id: string;
	type: string;
	compatibility: {
		minimum: string;
	};
}

export interface PackDefinition {
	label: string;
	name: string;
	path: string;
	system?: string;
	type: "Adventure" | "Actor" | "Item" | "JournalEntry" | "Macro" | "Playlist" | "RollTable" | "Scene" | "ActiveEffect" | "Cards";
	ownership?: {
		PLAYER?: string;
		ASSISTANT?: string;
	};
};

/**
 * Compares two dot-separated version strings numerically.
 * Returns true only when `latest` is strictly greater than `current`,
 * so a local build that is newer than (or equal to) the published version
 * does not trigger an "update available" notice.
 */
export function isNewerVersion(latest: string, current: string): boolean {
	const parse = (v: string) =>
		String(v)
			.split(".")
			.map((part) => Number.parseInt(part, 10) || 0);

	const a = parse(latest);
	const b = parse(current);
	const length = Math.max(a.length, b.length);

	for (let i = 0; i < length; i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x > y) return true;
		if (x < y) return false;
	}

	return false;
}

/** Turns a human title into a default lowercase, hyphenated module id. */
export function slugify(title: string | undefined): string {
	return (
		title
			?.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "") || "my-module"
	);
}

const MODULE_ID_REGEX = /^[a-z0-9-]+$/;

/** Lowercase alphanumeric with hyphens only (e.g. `my-awesome-module`). */
export function isValidModuleId(id: string | undefined): boolean {
	return !!id && MODULE_ID_REGEX.test(id);
}

/**
 * Maps selected system ids to their full definitions, dropping any id that has
 * no matching definition so `undefined` never leaks into module.json.
 */
export function buildSystemRelationships<T extends SystemDefinition>(
	selected: string[],
	systems: readonly T[],
): T[] {
	return selected
		.map((id) => systems.find((s) => s.id === id))
		.filter((s): s is T => s !== undefined);
}

interface BuiltPack extends Omit<PackDefinition, "system"> {
	system: string;
}

/**
 * Expands the chosen pack templates into one concrete pack per selected system,
 * namespacing the pack name and path with the system id.
 */
export function buildPacks(
	selectedPacks: readonly PackDefinition[],
	systems: readonly string[],
): BuiltPack[] {
	return selectedPacks.flatMap((pack) =>
		systems.map((system) => ({
			...pack,
			system,
			name: `${system}-${pack.name}`,
			path: `packs/${system}-${pack.name}`,
		})),
	);
}

/**
 * Returns the name of the first package manager found on PATH.
 * Checks bun → pnpm → yarn → npm, falling back to "npm".
 */
export function detectPackageManager(): "bun" | "pnpm" | "yarn" | "npm" {
	const candidates = ["bun", "pnpm", "yarn", "npm"] as const;
	for (const pm of candidates) {
		try {
			execSync(`${pm} --version`, { stdio: "ignore" });
			return pm;
		} catch {
			// not available
		}
	}
	return "npm";
}

/** Parses JSON, throwing a friendly error that names the offending source. */
export function safeJsonParse<T = unknown>(text: string, source: string): T {
	try {
		return JSON.parse(text) as T;
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse JSON from ${source}: ${reason}`);
	}
}

/**
 * Guards pack names that originate from an external module.json before they are
 * joined into write paths, preventing path-escape (e.g. `../`, slashes).
 */
export function isSafePackName(name: string | undefined): boolean {
	return !!name && /^[a-zA-Z0-9._-]+$/.test(name) && name !== "." && name !== "..";
}
