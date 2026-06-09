# create-fvtt-module

![NPM Version](https://img.shields.io/npm/v/create-fvtt-module)![NPM Downloads](https://img.shields.io/npm/dt/create-fvtt-module)

A CLI scaffolding tool for creating Foundry VTT modules.

## Installation

### Global Installation (for end users)

Once published to npm, you can run the script:

```bash
bunx create-fvtt-module
npx create-fvtt-module
```

Updating the package:

```bash
bun i create-fvtt-module@latest -g
npm install -g create-fvtt-module@latest
```

### Development Installation

For development purposes:

```bash
git clone https://github.com/MrVauxs/create-fvtt-module
cd create-fvtt-module
bun install
bun run dev
```
### Development

```bash
# Install dependencies
bun install

# Run in development mode (requires Bun)
bun run dev

# Watch for TypeScript changes
bun run build:watch
```

## Scripts

- `bun run build` - Compile TypeScript to JavaScript
- `bun run build:watch` - Watch TypeScript files and rebuild on changes
- `bun run dev` - Run the CLI in development mode (requires Bun)
- `bun run prepublishOnly` - Automatically run before publishing

## System Support

Currently supports:
- **dnd5e** - Dungeons & Dragons 5th Edition
- **pf2e** - Pathfinder 2nd Edition

Additional systems can be added in `src/options.ts`.

## Resources

### Foundry VTT Documentation
- [dnd5e System Wiki](https://github.com/foundryvtt/dnd5e/wiki)
- [dnd5e Module Registration](https://github.com/foundryvtt/dnd5e/wiki/Module-Registration)
- [PF2e Wiki](https://github.com/foundryvtt/pf2e/wiki)

### Module Development
- [Foundry VTT Module Development](https://foundryvtt.com/article/modules/)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit pull requests.

## Issues

Found a bug? Please open an issue on [GitHub](https://github.com/MrVauxs/create-fvtt-module/issues).
