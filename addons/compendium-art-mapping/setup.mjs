import * as p from "@clack/prompts";
import { cyan } from "kolorist";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const moduleDir = process.env.MODULE_DIR || process.cwd();

const moduleJsonPath = join(moduleDir, "module.json");
if (!existsSync(moduleJsonPath)) {
  p.log.warn("⚠️ module.json not found, skipping Compendium Art Mapping setup");
  process.exit(0);
}

const moduleJson = JSON.parse(await readFile(moduleJsonPath, "utf8"));
const moduleId = moduleJson.id;
const moduleTitle = moduleJson.title ?? moduleId;

const mappingContent = JSON.stringify(
  {
    "pf2e.pack-name": {
      "ActorUUID": {
        actor: `modules/${moduleId}/assets/portraits/example-character.webp`,
        token: {
          texture: {
            src: `modules/${moduleId}/assets/tokens/example-character.webp`,
            scaleX: 1,
            scaleY: 1,
          },
          ring: {
            enabled: true,
            subject: {
              texture: `modules/${moduleId}/assets/subjects/example-character.webp`,
              scale: 1,
            },
          },
        },
      },
    },
  },
  null,
  "\t",
);

const assetsDir = join(moduleDir, "assets");
if (!existsSync(assetsDir)) await mkdir(assetsDir, { recursive: true });

const mappingPath = join(moduleDir, "image-mapping.json");
await writeFile(mappingPath, mappingContent + "\n");
p.log.success(`Created ${cyan("image-mapping.json")}`);

moduleJson.flags ??= {};

moduleJson.flags.compendiumArtMappings = {
  pf2e: {
    mapping: `modules/${moduleId}/image-mapping.json`,
    credit: `<em>Artwork by AUTHOR.</em>`,
  },
};

moduleJson.flags.tokenRingSubjectMappings = {
  [`modules/${moduleId}/assets/tokens/`]: `modules/${moduleId}/assets/subjects/`,
};

await writeFile(moduleJsonPath, JSON.stringify(moduleJson, null, "\t") + "\n");
p.log.success(`Updated ${cyan("module.json")} with compendiumArtMappings and tokenRingSubjectMappings`);

p.note(
  `✅ Installed!\nEdit ${cyan("image-mapping.json")} to map actor UUIDs to portrait/token/subject art.\nReplace ${cyan("AUTHOR")} in the credit string inside ${cyan("module.json")}.`,
  "Compendium Art Mapping",
);
