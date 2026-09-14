// Adds a Svelte 5 ApplicationV2 mixin to the generated module.

import * as p from "@clack/prompts";
import { cyan } from "kolorist";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const moduleDir = process.env.MODULE_DIR || process.cwd();
const moduleJsonPath = join(moduleDir, "module.json");

if (!existsSync(moduleJsonPath)) {
	p.log.warn("⚠️ module.json not found, skipping Svelte Application Mixin setup");
	process.exit(0);
}

const srcDir = join(moduleDir, "src");
if (!existsSync(srcDir)) {
	p.log.warn("⚠️ No src/ directory found, skipping Svelte Application Mixin setup");
	process.exit(0);
}

const libDir = join(srcDir, "lib");
await mkdir(libDir, { recursive: true });

const mixinContent = `import * as svelte from "svelte";

interface SvelteApplicationRenderContext extends fa.ApplicationRenderContext {
	/**
	 * Render-derived data. The mixin replaces this wholesale on every render, so
	 * it MUST NOT be mutated from TypeScript. Anything user- or peer-mutated
	 * belongs on instance-level $state (declared in a .svelte.ts file) instead.
	 * Optional: omit entirely if all live state lives on the app instance.
	 */
	state?: object;
	/** This application instance */
	foundryApp?: SvelteApplication;
}

/**
 * Mixin-injected props. Combine with the context type at the call site:
 *   const { ... }: MyContext & SvelteAppProps<MyContext> = $props();
 * Don't inline the intersection into this type. That triggers a recursive type cycle
 * through foundryApp: MyApp for every app.
 */
interface SvelteAppProps<TContext extends SvelteApplicationRenderContext = SvelteApplicationRenderContext> {
	/** Returns the current state object. Call inside a $derived to track replacement. */
	getState: () => TContext["state"];
}

// TODO: Figure out this fuckass exported anonymous class type error.
function SvelteApplicationMixin<
	TBase extends AbstractConstructorOf<fa.api.ApplicationV2> & {
		DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration>;
	},
>(Base: TBase) {
	abstract class SvelteApplication extends Base {
		static override DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
			classes: [],
		};

		protected abstract root: svelte.Component<any>;

		/**
		 * Reactive slot for the render-derived state object. $state.raw means the
		 * SLOT is reactive (reassigning it fires signals), but the value inside
		 * is treated as immutable. This enforces the contract: anyone mutating
		 * this.$state.foo = bar will see the write succeed but no reactivity
		 * fire, which is the desired behavior to push that state to a different
		 * surface (component-local $state or instance-level $state).
		 */
		#state: object = $state.raw({});

		protected get $state(): object {
			return this.#state;
		}

		protected set $state(value: object) {
			this.#state = value;
		}

		/** The mounted root component, saved to be unmounted on application close */
		#mount: object = {};

		protected abstract override _prepareContext(
			options: fa.ApplicationRenderOptions,
		): Promise<SvelteApplicationRenderContext>;

		protected override async _renderHTML(
			context: SvelteApplicationRenderContext,
		): Promise<SvelteApplicationRenderContext> {
			return context;
		}

		protected override _replaceHTML(
			result: SvelteApplicationRenderContext,
			content: HTMLElement,
			options: fa.ApplicationRenderOptions,
		): void {
			// Wholesale-replace the state object. Components read it via the
			// getState prop inside a $derived so they pick up the new value.
			this.$state = result.state ?? {};
			if (options.isFirstRender) {
				this.#mount = svelte.mount(this.root, {
					target: content,
					props: { ...result, getState: (): object => this.$state },
				});
			}
		}

		protected override _onClose(options: fa.ApplicationClosingOptions): void {
			super._onClose(options);
			svelte.unmount(this.#mount);
		}
	}

	return SvelteApplication;
}

type SvelteApplication = InstanceType<ReturnType<typeof SvelteApplicationMixin>>;

export { SvelteApplicationMixin };
export type { SvelteApplicationRenderContext, SvelteAppProps };
`;

const mixinPath = join(libDir, "svelte-mixin.svelte.ts");
await writeFile(mixinPath, mixinContent);
p.log.success(`Created ${cyan("src/lib/svelte-mixin.svelte.ts")}`);

// The mixin imports Svelte while the module is being bundled. Add it only when
// the generated module has a package manifest and no Svelte version is present.
const packageJsonPath = join(moduleDir, "package.json");
if (existsSync(packageJsonPath)) {
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
	const hasSvelteDependency = packageJson.dependencies?.svelte || packageJson.devDependencies?.svelte;
	if (!hasSvelteDependency) {
		packageJson.devDependencies ??= {};
		packageJson.devDependencies.svelte = "^5.0.0";
		await writeFile(packageJsonPath, JSON.stringify(packageJson, null, "\t") + "\n");
		p.log.success(`Updated ${cyan("package.json")} with the Svelte dependency`);
	}
}

p.note(
	`✅ Installed!\nYou can import ${cyan("SvelteApplicationMixin")} from ${cyan("$lib/svelte-mixin.svelte.ts")} and provide a Svelte component as the app's ${cyan("root")} property.`,
	"Svelte Application Mixin",
);
