# @massivescale/tsp-api-docs

TypeSpec emitter for generating API reference documentation in Markdown.

Supports multiple output formats targeting Azure DevOps Wiki, GitHub, and DocFx.

## Features

- Emits Markdown docs with per-service overview pages, per-operation pages, and per-type pages (models, enums, unions, scalars).
- Three output formats: `azure-devops` (default), `github`, and `docfx`.
- Automatically formats Markdown tables with aligned columns.
- Uses external Handlebars templates from `templates/*.hbs`.
- Optional root service index page.
- Versioned API support via `@typespec/versioning`.

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

Add the emitter to your TypeSpec config and set options as needed.

```yaml
emit:
  - "@massivescale/tsp-api-docs"
options:
  "@massivescale/tsp-api-docs":
    emitter-output-dir: ./tsp-output
    format: azure-devops
```

### Options

| Option                 | Type                                        | Default          | Description                                                        |
|------------------------|---------------------------------------------|------------------|--------------------------------------------------------------------|
| `emitter-output-dir`   | `string`                                    | `./tsp-output`   | Output directory for generated files.                              |
| `format`               | `"azure-devops"` \| `"github"` \| `"docfx"` | `"azure-devops"` | Output format. See [Output Formats](#output-formats) below.        |
| `page-title-prefix`    | `string`                                    | —                | Fallback title prefix used when the service has no explicit title. |
| `render-service-index` | `boolean`                                   | `false`          | Emit a root index page listing all services.                       |

## Output Formats

### `azure-devops` (default)

Generates structure compatible with **Azure DevOps Wiki**. Each folder's default landing page has the same name as the folder, which Azure DevOps Wiki renders when a folder node is selected.

```text
tsp-output/
  README.md                         # root index (render-service-index: true)
  <service-slug>/
    <service-slug>.md               # overview — same name as folder
    api/
      api.md                        # sub-folder index
      <Operation>.md
    resources/
      resources.md                  # sub-folder index
      <Type>.md
```

### `github`

Generates structure compatible with **GitHub** rendering. Each folder's landing page is `README.md`, which GitHub renders automatically when browsing directories.

```text
tsp-output/
  README.md                         # root index (render-service-index: true)
  <service-slug>/
    README.md                       # overview
    api/
      README.md                     # sub-folder index
      <Operation>.md
    resources/
      README.md                     # sub-folder index
      <Type>.md
```

### `docfx`

Generates structure compatible with a **DocFx** project. Each service folder contains an `index.md` overview and a `toc.yml` table of contents for navigation. When `render-service-index: true`, a root `toc.yml` is also emitted.

```text
tsp-output/
  index.md                          # root index (render-service-index: true)
  toc.yml                           # root TOC (render-service-index: true)
  <service-slug>/
    index.md                        # overview
    toc.yml                         # service TOC (Overview / API / Resources)
    api/
      <Operation>.md
    resources/
      <Type>.md
```

## Templates

Templates are external Handlebars files and can be customized:

- `templates/overview.md.hbs` — service overview page
- `templates/operation.md.hbs` — operation reference page
- `templates/type.md.hbs` — type reference page
- `templates/service-index.md.hbs` — root service index
- `templates/operations-index.md.hbs` — `api/` sub-folder index
- `templates/types-index.md.hbs` — `resources/` sub-folder index

## Development Notes

- Main emitter implementation: `src/emitter.ts`
- Emitter option schema: `src/lib.ts`
- Template loader: `src/templates.ts`
- Tests: `test/emitter.test.js`
- Example TypeSpec projects: `examples/`
- Project-specific Copilot guidance: `.github/copilot-instructions.md`
