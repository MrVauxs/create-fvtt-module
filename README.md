# create-fvtt-module

A CLI scaffolding tool for creating Foundry VTT modules.

## Installation

### Global Installation (for end users)

Once published to npm, you can install this globally:

```bash
npm install -g create-fvtt-module
```

Then run it from anywhere:

```bash
create-fvtt-module
```

### Development Installation

For development purposes:

```bash
git clone https://github.com/MrVauxs/create-fvtt-module
cd create-fvtt-module
npm install
npm run dev
```

## Usage

Run the interactive CLI:

```bash
create-fvtt-module
```

The tool will prompt you for:
- **Module Title**: The display name of your module
- **Module ID**: A unique identifier (auto-generated from title)
- **Description**: What your module does
- **Foundry Version**: Target version (V13 or V14)
- **System**: Compatible systems (dnd5e, pf2e, etc.)
- **Packs**: Optional data packs to include
- **Pack Organization**: Whether to organize packs in folders

## Build & Publishing

### Development

```bash
# Install dependencies
npm install

# Run in development mode (requires Bun)
npm run dev

# Watch for TypeScript changes
npm run build:watch
```

### Building

The project uses TypeScript for type safety. To build:

```bash
npm run build
```

This compiles TypeScript files from `src/` to `dist/` with:
- Declaration files (`.d.ts`)
- Source maps for debugging
- ES2020 target for modern Node.js

### Publishing to npm

1. **Update version** in `package.json`:
   ```bash
   npm version patch|minor|major
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

3. **Verify build output** exists in `dist/` directory

4. **Login to npm** (if not already logged in):
   ```bash
   npm login
   ```

5. **Publish to npm**:
   ```bash
   npm publish
   ```

The `prepublishOnly` script automatically runs `npm run build` before publishing, ensuring the distribution is always up-to-date.

### Pre-publish Checklist

- [ ] Version bumped in `package.json`
- [ ] Changes committed to git
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors: check diagnostics
- [ ] README updated with any new features

## Project Structure

```
create-fvtt-module/
├── src/
│   ├── bin.ts           # CLI entry point
│   ├── index.ts         # Main export file
│   ├── options.ts       # Configuration options
│   └── templates/       # Module templates
├── dist/                # Compiled JavaScript (generated)
├── templates/           # Template files (published)
├── package.json         # Package metadata & scripts
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run build:watch` - Watch TypeScript files and rebuild on changes
- `npm run dev` - Run the CLI in development mode (requires Bun)
- `npm run prepublishOnly` - Automatically run before publishing

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

## Requirements

- **Node.js**: 18.0.0 or higher
- **TypeScript**: 5.0.0 or higher (for development)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit pull requests.

## Issues

Found a bug? Please open an issue on [GitHub](https://github.com/MrVauxs/create-fvtt-module/issues).
