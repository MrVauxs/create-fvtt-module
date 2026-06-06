// Creates a .github/workflows/main.yml file.
// Additional options include:
// - Support for prereleases (requires a seperate branch)
// - Supports for uploading via FTP to external servers
// - Discord webhook notifications

import * as p from "@clack/prompts";
import { cyan } from "kolorist";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const data = await p.group(
  {
    features: () =>
      p.multiselect({
        message: "Additional features?",
        initialValues: [],
        required: false,
        options: [
          // { label: "Prereleases", value: "prereleases" },
          { label: "Uploading via FTP", value: "ftp" },
          { label: "Discord webhook on updates", value: "discord" },
        ],
      }),
  },
  { onCancel: () => process.exit(0) },
);

// Grab main.yml template
const mainYmlTemplate = await readFile(`${__dirname}/main.yml`, "utf8");
const extractChangelog = await readFile(`${__dirname}/extract-changelog.mjs`, "utf8");

// Get the module directory from environment variable
const moduleDir = process.env.MODULE_DIR || process.cwd();

let mainYml = mainYmlTemplate;

if (data.features.includes("ftp")) {
  mainYml += `
            - name: Get FTP Path
              id: ftp
              run: echo "ftp=\${{fromJson(steps.set_var.outputs.PACKAGE_JSON).flags.ftpPath}}" >> $GITHUB_OUTPUT

            - name: Put Files into FTP Folder
              env:
                FTP_PASSWORD: \${{ secrets.FTP_PASSWORD }}
              if: \${{ env.FTP_PASSWORD != '' }}
              run: |
                ls
                mkdir _ftp
                cp module.json _ftp/
                cp module.zip _ftp/
                mkdir _ftp/\${{steps.module_id.outputs.module_id}}
                cp module.json _ftp/\${{steps.module_id.outputs.module_id}}/

            - name: Upload FTP
              uses: sebastianpopp/ftp-action@releases/v2
              env:
                FTP_PASSWORD: \${{ secrets.FTP_PASSWORD }}
              if: \${{ env.FTP_PASSWORD != '' }}
              with:
                host: \${{ secrets.FTP_SERVER }}
                user: \${{ secrets.FTP_USERNAME }}
                password: \${{ env.FTP_PASSWORD }}
                localDir: _ftp
                remoteDir: \${{steps.ftp.outputs.ftp}}
`;
}

if (data.features.includes("discord")) {
  mainYml += `
            - name: Send Discord Ping
              uses: Ilshidur/action-discord@0.3.2
              env:
                DISCORD_WEBHOOK: \${{ secrets.DISCORD_WEBHOOK }}
              if: \${{ env.DISCORD_WEBHOOK != '' && !github.event.release.prerelease }}
              with:
                args: "\${{steps.title.outputs.title}} has been updated to version \`\${{github.event.release.tag_name}}\`!"
`;
}

// Create main.yml and extract-changelog.mjs files
const workflowDir = `${moduleDir}/.github`;
await mkdir(workflowDir, { recursive: true });
await mkdir(`${workflowDir}/workflows`, { recursive: true });
await mkdir(`${workflowDir}/scripts`, { recursive: true });
await writeFile(`${workflowDir}/workflows/main.yml`, mainYml);
await writeFile(`${workflowDir}/scripts/extract-changelog.mjs`, extractChangelog);

let note = "✅ Installed!";
note += "\nThe Github workflow is triggered by making a new release. To make a new release go to your repository's Releases page which can be found in the sidebar on the right and press \"Draft a new release.\" Fill in the version number and you're done!"

if (data.features.includes("discord"))
  note +=
    "\n - For the Discord integration, make sure to create a DISCORD_WEBHOOK secret with the webhook url.";
if (data.features.includes("ftp"))
  note += `\n - For the FTP integration, make sure to include the FTP_SERVER, FTP_USERNAME, and FTP_PASSWORD secrets.\n\tThe module JSON also can include a flag stating its subdirectory on the FTP server under ${cyan("flags.ftpPath")}.`;

p.note(note, "Github Workflow");
