import { lstatSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import * as p from "@clack/prompts";
import moduleJSON from "../module.json" with { type: "json" };

const windowsInstructions = process.platform === "win32" ? " Start with a drive letter (\"C:\\\")." : "";
const promptPath = await p.text({
	message: `Enter the full path to your Foundry data folder.${windowsInstructions}`,
	placeholder: ""
})
let dataPath = promptPath.replace(/\W*$/, "").trim();

if (!dataPath || !/\bData$/.test(dataPath)) {
	console.error(`"${dataPath}" does not look like a Foundry data folder.`);
	process.exit(1);
}

const symlinkPath = resolve(dataPath, "modules", moduleJSON.id);
const symlinkStats = lstatSync(symlinkPath, { throwIfNoEntry: false });
if (symlinkStats) {
	const atPath = symlinkStats.isDirectory() ? "folder" : symlinkStats.isSymbolicLink() ? "symlink" : "file";
	const proceed = (
		await prompts({
			type: "confirm",
			name: "value",
			initial: false,
			message: `A "${moduleJSON.id}" ${atPath} already exists in the "modules" subfolder. Replace with new symlink?`,
		})
	).value;
	if (!proceed) {
		console.log("Aborting.");
		process.exit();
	}
}

try {
	if (symlinkStats?.isDirectory()) {
		rmSync(symlinkPath, { recursive: true, force: true });
	} else if (symlinkStats) {
		unlinkSync(symlinkPath);
	}
	symlinkSync(resolve(process.cwd()), symlinkPath);
} catch (error) {
	if (error instanceof Error) {
		console.error(`An error was encountered trying to create a symlink: ${error.message}`);
		process.exit(1);
	}
}

console.log(`Symlink successfully created at "${symlinkPath}"!`);
