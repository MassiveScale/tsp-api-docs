# @massivescale/tsp-api-docs

TypeSpec emitter for generating API reference documentation in Markdown.

The generated docs follow a Microsoft Graph-style reference structure with service indexes, operation pages, and type pages.

## Features

- Emits Markdown docs.
- Uses external Handlebars templates from `templates/*.hbs`.
- Generates:
  - Root API index
  - Per-service overview pages
  - Per-operation pages
  - Per-type pages (models, enums, unions, scalars)

## Prerequisites

- Node.js (current LTS recommended)
- npm
- TypeSpec compiler available in your environment

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Emitter Usage

Use the emitter name `tsp-api-docs` in your TypeSpec config.

Supported emitter options:
- `emitter-output-dir`: custom output directory
- `page-title-prefix`: optional fallback title prefix

Example config snippet:

```yaml
emit:
  - tsp-api-docs
options:
  tsp-api-docs:
    emitter-output-dir: ./tsp-output
```

## Output Structure

Typical output layout:

```text
tsp-output/
  tsp-api-docs/
    index.md
    <service-slug>/
      index.md
      operations/
        <operation>.md
      types/
        <type>.md
```

## Templates

Templates are external `.hbs` files in:

- `templates/overview.md.hbs`
- `templates/operation.md.hbs`
- `templates/type.md.hbs`
- `templates/service-index.md.hbs`

## Development Notes

- Main emitter implementation: `src/emitter.ts`
- Emitter option schema: `src/lib.ts`
- Template loader: `src/templates.ts`
- Tests: `test/emitter.test.js`
- Project-specific Copilot guidance: `.github/copilot-instructions.md`
