// Creates a .github/workflows/main.yml file.
// Additional options include:
// - Support for prereleases (requires a seperate branch)
// - Supports for uploading via FTP to external servers
// - Discord webhook notifications

import * as p from "@clack/prompts";
import { cyan } from "kolorist";
import { mkdir } from "fs/promises";

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
const addonDir = import.meta.dir;
const mainYmlTemplate = await Bun.file(`${addonDir}/main.yml`).text();

// Get the module directory from environment variable
const moduleDir = process.env.MODULE_DIR || process.cwd();

let mainYml = mainYmlTemplate;

// I should probably just make this a JSON and convert it to accursed YAML at the end step...
if (data.features.includes("discord") || data.features.includes("ftp")) {
	mainYml += `
            # https://stackoverflow.com/questions/61919141/read-json-file-in-github-actions
            - id: set_var
              run: echo "PACKAGE_JSON=$(jq -c . < module.json)" >> $GITHUB_OUTPUT

            - name: Get FTP Path
              id: ftp
              run: echo "ftp=\${{fromJson(steps.set_var.outputs.PACKAGE_JSON).flags.ftpPath}}" >> "$GITHUB_OUTPUT"

            - name: Get Module ID
              id: module_id
              run: echo "module_id=\${{fromJson(steps.set_var.outputs.PACKAGE_JSON).id}}" >> "$GITHUB_OUTPUT"

            - name: Get Module Title
              id: title
              run: echo "title=\${{fromJson(steps.set_var.outputs.PACKAGE_JSON).title}}" >> "$GITHUB_OUTPUT"
`;
}

if (data.features.includes("ftp")) {
	mainYml += `
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

// Create main.yml file
const workflowDir = `${moduleDir}/.github/workflows`;
await mkdir(workflowDir, { recursive: true });
await Bun.write(`${workflowDir}/main.yml`, mainYml);

let note = "✅ Installed!";
if (data.features.includes("discord"))
	note +=
		"\nFor the Discord integration, make sure to create a DISCORD_WEBHOOK secret with the webhook url.";
if (data.features.includes("ftp"))
	note += `\nFor the FTP integration, make sure to include the FTP_SERVER, FTP_USERNAME, and FTP_PASSWORD secrets.\n\tThe module JSON also can include a flag stating its subdirectory on the FTP server under ${cyan("flags.ftpPath")}.`;

p.note(note, "Github Workflow");
