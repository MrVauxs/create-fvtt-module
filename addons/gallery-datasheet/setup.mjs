import * as p from "@clack/prompts";
import { cyan } from "kolorist";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const moduleDir = process.env.MODULE_DIR || process.cwd();

const moduleJsonPath = join(moduleDir, "module.json");
if (!existsSync(moduleJsonPath)) {
  p.log.warn("⚠️ module.json not found, skipping Gallery Datasheet setup");
  process.exit(0);
}

const moduleJson = JSON.parse(await readFile(moduleJsonPath, "utf8"));
const moduleId = moduleJson.id;
const moduleTitle = moduleJson.title ?? moduleId;

// ── assets/datasheet/datasheet.json ──────────────────────────────────────────

const datasheetContent = JSON.stringify(
  [
    {
      label: "Example Character",
      key: `${moduleId}_example-character`,
      source: "SOURCE_NAME",
      art: {
        portrait: `modules/${moduleId}/assets/portraits/example-character.webp`,
        thumb: `modules/${moduleId}/assets/thumb/example-character.webp`,
        token: `modules/${moduleId}/assets/tokens/example-character.webp`,
        subject: `modules/${moduleId}/assets/subjects/example-character.webp`,
        scale: 1,
      },
      tags: {
        ancestry: [],
        category: [],
        equipment: [],
        features: [],
        family: [],
      },
    },
  ],
  null,
  "\t",
);

const datasheetDir = join(moduleDir, "assets", "datasheet");
if (!existsSync(datasheetDir)) await mkdir(datasheetDir, { recursive: true });

const datasheetPath = join(datasheetDir, "datasheet.json");
await writeFile(datasheetPath, datasheetContent + "\n");
p.log.success(`Created ${cyan("assets/datasheet/datasheet.json")}`);

moduleJson.flags ??= {};

moduleJson.flags.galleryDatasheets = {
  [moduleId]: {
    label: `${moduleTitle} Artwork`,
    hint: `Artwork from ${moduleTitle}.`,
    sheet: `modules/${moduleId}/assets/datasheet/datasheet.json`,
  },
};

await writeFile(moduleJsonPath, JSON.stringify(moduleJson, null, "\t") + "\n");
p.log.success(`Updated ${cyan("module.json")} with galleryDatasheets flag`);

p.note(
  `✅ Installed!\nEdit ${cyan("assets/datasheet/datasheet.json")} to list your artwork entries.\nReplace ${cyan("SOURCE_NAME")} with your source book or origin name.`,
  "Gallery Datasheet",
);
