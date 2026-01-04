import type { Plugin, UserConfig } from "vite";
import path from "node:path";
import vttSync from "foundryvtt-sync";
import { defineConfig } from "vite";
import moduleJSON from "./module.json" with { type: "json" };
import postcssPresetEnv from "postcss-preset-env";

const target = "es2022"; // Build target for the vinal bundle.
const foundryPort = 30000; // Which port your FoundryVTT instance is hosted at.
const devPort = 30001; // Which port you want to use for development.
const libEntry = "/index.ts"; // The main entry file to begin crawling from (root being `src/`).

const postcss = {
	inject: false,
	sourceMap: true,
	extensions: [".css"],
	plugins: [postcssPresetEnv],
};

const PACKAGE_ID = `modules/${moduleJSON.id}`;

export default defineConfig(({ mode: _mode }) => {
	return {
		root: "src/", // Source location / esbuild root.
		base: `/${PACKAGE_ID}/dist`, // Base module path.
		publicDir: false, // No public resources to copy.
		cacheDir: "../.vite-cache", // Relative from root directory.

		resolve: {
			conditions: ["browser", "import", "default"], // Only use browser-compatible exports from node modules.
			alias: {
				$lib: path.resolve(__dirname, "./src/lib"),
				moduleJSON: path.resolve(__dirname, "./module.json"),
			},
		},

		esbuild: { target }, // https://esbuild.github.io/api/#transform

		css: { postcss }, // https://vite.dev/config/shared-options#css-postcss

		server: {
			port: devPort,
			open: "/game",
			proxy: {
				// Serves static files from main Foundry server.
				[`^(/${PACKAGE_ID}/(assets|lang|packs))`]: `http://localhost:${foundryPort}`,

				// All other paths besides package ID path are served from main Foundry server.
				[`^(?!/${PACKAGE_ID}/)`]: `http://localhost:${foundryPort}`,

				// Rewrite incoming `module-id.js` request from Foundry to the dev server libEntry.
				[`/${PACKAGE_ID}/dist/${moduleJSON.id}.js`]: {
					target: `http://localhost:${devPort}/${PACKAGE_ID}/dist`,
					rewrite: () => libEntry,
				},

				// Enable socket.io from main Foundry server.
				"/socket.io": { target: `ws://localhost:${foundryPort}`, ws: true },
			},
		},
		build: {
			outDir: "../dist", // The output directory.
			emptyOutDir: false,
			sourcemap: true, // Provide a publicly available sourcemap for debuggin purposes.
			target,
			lib: {
				entry: libEntry,
				formats: ["es"],
				fileName: moduleJSON.id,
			},
			rollupOptions: {
				output: {
					// Rewrite the default style.css to a more recognizable file name.
					assetFileNames: assetInfo =>
						assetInfo.name === "style.css" ? `${moduleJSON.id}.css` : assetInfo.name as string,
				},
			},
		},

		plugins: [
			vttSync(moduleJSON, {}) as Plugin[],
		],
	} satisfies UserConfig;
});