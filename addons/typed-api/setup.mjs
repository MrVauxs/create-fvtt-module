// Adds a typed API (api.ts + types.d.ts) and package.json exports so other
// modules can import this module's types.

import * as p from "@clack/prompts";
import { cyan } from "kolorist";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const moduleDir = process.env.MODULE_DIR || process.cwd();

const moduleJsonPath = join(moduleDir, "module.json");
if (!existsSync(moduleJsonPath)) {
  p.log.warn("⚠️ module.json not found, skipping Typed API setup");
  process.exit(0);
}

const moduleJson = JSON.parse(await readFile(moduleJsonPath, "utf8"));
const moduleId = moduleJson.id;

// Derive a camelCase global name from the module ID (e.g. "my-module" → "myModule")
const globalName = moduleId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const srcDir = join(moduleDir, "src");
const srcExists = existsSync(srcDir);

if (!srcExists) {
  p.log.warn("⚠️ No src/ directory found, skipping Typed API setup");
  process.exit(0);
}

// ── api.ts ─────────────────────────────────────────────────────────────────

const apiContent = `export class API {
\tdoSomething(): void {
\t\tconsole.log("${moduleId} | doSomething called");
\t}
}
`;

const apiPath = join(srcDir, "api.ts");
await writeFile(apiPath, apiContent);
p.log.success(`Created ${cyan("src/api.ts")}`);

// ── types.d.ts ─────────────────────────────────────────────────────────────

const typesContent = `import type { API } from "./api";

declare global {
\tnamespace ${globalName} {
\t\tconst api: API;
\t}
}

export type { API };
`;

const typesPath = join(srcDir, "types.d.ts");
await writeFile(typesPath, typesContent);
p.log.success(`Created ${cyan("src/types.d.ts")}`);

// ── src/index.ts — register api on the global ──────────────────────────────

const indexTs = join(srcDir, "index.ts");
const indexJs = join(srcDir, "index.js");

const apiImport = `import { API } from "./api";\n`;
const apiRegister = `\n// Expose the API on the module's global namespace\nglobalThis.${globalName} = {\n\tapi: new API()\n};\n`;

if (existsSync(indexTs)) {
  let indexContent = await readFile(indexTs, "utf8");
  if (!indexContent.includes("./api")) {
    indexContent = apiImport + indexContent + apiRegister;
    await writeFile(indexTs, indexContent);
    p.log.success(`Updated ${cyan("src/index.ts")} to register the API`);
  } else {
    p.log.info(`API import already present in ${cyan("src/index.ts")}`);
  }
} else if (existsSync(indexJs)) {
  let indexContent = await readFile(indexJs, "utf8");
  if (!indexContent.includes("./api")) {
    indexContent = `import { API } from "./api";\n` + indexContent + apiRegister;
    await writeFile(indexJs, indexContent);
    p.log.success(`Updated ${cyan("src/index.js")} to register the API`);
  } else {
    p.log.info(`API import already present in ${cyan("src/index.js")}`);
  }
} else {
  p.log.warn(`⚠️ No index.ts/index.js found. Manually register the API in your entry point.`);
}

// ── package.json — add exports + typesVersions ─────────────────────────────

const pkgPath = join(moduleDir, "package.json");
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));

  pkg.exports = {
    "./types": {
      types: "./src/types.d.ts",
    },
  };

  pkg.typesVersions = {
    "*": {
      types: ["./src/types.d.ts"],
    },
  };

  await writeFile(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
  p.log.success(`Updated ${cyan("package.json")} with exports and typesVersions`);
} else {
  p.log.warn("⚠️ package.json not found, skipping exports update");
}

// ── README.md — append types & usage section ──────────────────────────────

const readmePath = join(moduleDir, "README.md");
if (existsSync(readmePath)) {
  const readmeSection = `
## Using the API

Other modules can consume \`${moduleId}\`'s typed API by installing it as a GitHub dependency:

\`\`\`sh
npm install github:YOUR_USERNAME/${moduleId}
\`\`\`

Then import the types either directly in the code or tsconfig.json:

\`\`\`ts
# Import types directly
import "${moduleId}/types";

# Or add to tsconfig.json
{
  "compilerOptions": {
    "types": ["${moduleId}/types"]
  }
}
\`\`\`

To call methods at runtime, read from the module's global:

\`\`\`ts
const { doSomething } = globalThis.${globalName}.api;
doSomething();
\`\`\`
`;

  const readmeContent = await readFile(readmePath, "utf8");
  await writeFile(readmePath, readmeContent + readmeSection);
  p.log.success(`Updated ${cyan("README.md")} with types & usage section`);
} else {
  p.log.warn("⚠️ README.md not found, skipping documentation update");
}

p.note(
  `✅ Installed!\nOther modules can now import your types:\n  ${cyan(`import type { API } from "${moduleId}/types";`)}`,
  "Typed Module API"
);
