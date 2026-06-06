import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Filesystem-heavy scaffolding tests can be slow on Windows runners.
		testTimeout: 20000,
		hookTimeout: 20000,
	},
});
