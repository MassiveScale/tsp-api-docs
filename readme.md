# @massivescale/tsp-api-docs

TypeSpec emitter for generating API reference documentation in Markdown.

Supports multiple output formats targeting Azure DevOps Wiki, GitHub, and DocFx.

## Features

- Emits Markdown docs with per-service overview pages, per-operation pages, and per-type pages (models, enums, unions, scalars).
- Three output formats: `azure-devops` (default), `github`, and `docfx`.
- Automatically formats Markdown tables with aligned columns.
- External Handlebars templates — override any built-in template with a custom `.hbs` file.
- Optional root service index page.
- Versioned API support via `@typespec/versioning`.
- Optional `api-name` prefix for versioned file/folder slugs (e.g. `my-api-v1-0/`).
- Configurable `route-prefix` with `{version}` token substitution for HTTP request lines (default: `api/{version}`).
- Response headers documented per operation.
- Request body examples automatically omit read-only and immutable properties based on HTTP verb visibility.
- Type names rendered exactly as defined — no CamelCase splitting in page titles.
- Related-methods table on type pages lists only operations that directly address the type — return it, accept it as a parameter, or use a direct array/record/union of it. Operations that reference the type only through a nested property of another model are excluded. Types decorated with `@error` are never treated as addressable entities and have no Methods section.
- DocFx `toc.yml` output is YAML-safe — service and page titles containing colons or other special characters are properly quoted.

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

| Option                    | Type                                        | Default          | Description                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api-name`                | `string`                                    | —                | API name prefix for file/folder slugs. See [API Name](#api-name) below.                                                                                                                                                                                                                                                              |
| `clean-output-dir`        | `boolean`                                   | `true`           | Before emitting, deletes the entire `emitter-output-dir` for `azure-devops` and `github` formats. For `docfx`, enumerates and removes only non-project files, preserving `docfx.json`. Do not point `emitter-output-dir` at a directory that contains unrelated files when this is `true`. Set to `false` to skip cleaning entirely. |
| `docfx-theme`             | `string[]`                                  | `["default"]`    | DocFx template names applied to the `build.template` array in the generated `docfx.json`. Only used with `format: docfx`.                                                                                                                                                                                                            |
| `emit-project-files`      | `boolean`                                   | `true`           | When `true`, emits project/configuration files (e.g. `docfx.json`). Set to `false` to emit documentation files only.                                                                                                                                                                                                                 |
| `emit-relation-diagram`   | `boolean`                                   | `false`          | When `true`, emits a `relation-diagram.md` containing a Mermaid ER diagram of all types for each service.                                                                                                                                                                                                                            |
| `emitter-output-dir`      | `string`                                    | `./tsp-output`   | Output directory for generated files.                                                                                                                                                                                                                                                                                                |
| `format`                  | `"azure-devops"` \| `"github"` \| `"docfx"` | `"azure-devops"` | Output format. See [Output Formats](#output-formats) below.                                                                                                                                                                                                                                                                          |
| `overwrite-project-files` | `boolean`                                   | `false`          | When `false`, project files are only written if they do not already exist. Set to `true` to always overwrite them.                                                                                                                                                                                                                   |
| `page-title-prefix`       | `string`                                    | —                | Fallback title prefix used when the service has no explicit title.                                                                                                                                                                                                                                                                   |
| `render-service-index`    | `boolean`                                   | `false`          | Emit a root index page listing all services.                                                                                                                                                                                                                                                                                         |
| `route-prefix`            | `string`                                    | `api/{version}`  | Prefix prepended to HTTP request paths. Supports `{version}` token substitution. See [Route Prefix](#route-prefix) below.                                                                                                                                                                                                            |
| `templates`               | `TemplateOverrides`                         | —                | Per-template path overrides for custom Handlebars templates. See [Custom Templates](#custom-templates) below.                                                                                                                                                                                                                        |

## Output Formats

### `azure-devops` (default)

Generates structure compatible with **Azure DevOps Wiki**. Index pages sit beside the folder they describe — Azure DevOps Wiki associates a page with a folder when the page is at the same level as (not inside) the folder.

```text
tsp-output/
  README.md                         # root index (render-service-index: true)
  <service-slug>.md                 # overview — beside the service folder
  <service-slug>/
    api.md                          # operations index — beside api/
    api/
      <Operation>.md
    resources.md                    # types index — beside resources/
    resources/
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

Generates structure compatible with a **DocFx** project. Each service folder contains an `index.md` overview and a `toc.yml` table of contents for navigation. When `render-service-index: true`, a root `toc.yml` is also emitted. A `docfx.json` project configuration file is emitted at the output root by default (see [DocFx Project Files](#docfx-project-files)).

```text
tsp-output/
  docfx.json                        # project config (emit-project-files: true)
  index.md                          # root index (render-service-index: true)
  toc.yml                           # root TOC (render-service-index: true)
  <service-slug>/
    index.md                        # overview
    toc.yml                         # service TOC (Overview / API / Resources)
    relation-diagram.md             # Mermaid ER diagram (emit-relation-diagram: true)
    api/
      <Operation>.md
    resources/
      <Type>.md
```

### DocFx Project Files

When `format: docfx` is used, the emitter writes a `docfx.json` configuration file at the output root. This file is only written if it does not already exist (controlled by `overwrite-project-files`). To skip it entirely, set `emit-project-files: false`.

The `docfx-theme` option populates the `build.template` array in the generated config:

```yaml
options:
  "@massivescale/tsp-api-docs":
    format: docfx
    docfx-theme:
      - default
      - my-custom-theme
```

### Relation Diagram

When `emit-relation-diagram: true`, a `relation-diagram.md` file is emitted in each service folder. It contains a Mermaid `erDiagram` block that shows all emitted types and their relationships:

```yaml
options:
  "@massivescale/tsp-api-docs":
    emit-relation-diagram: true
```

The code fence syntax is automatically selected per format — Azure DevOps Wiki uses `:::mermaid` / `:::` while GitHub and DocFx use ` ```mermaid ` / ` ``` `.

The diagram includes:

- Models as entities with their properties and types
- Enums as entities with their members
- Unions as entities with their named variants
- Relationship lines between models that reference other service types

## API Name

The `api-name` option provides a consistent prefix for file and folder slugs, which is useful when the TypeSpec service title differs from how you want the output organized.

```yaml
options:
  "@massivescale/tsp-api-docs":
    api-name: "My Awesome API"
```

**Non-versioned service** — the slug is derived from `api-name` instead of the service title:

```text
my-awesome-api.md
my-awesome-api/
  api/Get-Widget.md
  resources/Widget.md
```

**Versioned service** — the slug is `<api-name> <version>` slugified:

```text
my-awesome-api-v1-0.md        # version 1.0 folder and overview
my-awesome-api-v2-0.md        # version 2.0 folder and overview
```

When `render-service-index` is also enabled, versioned entries are grouped under the `api-name` heading in the index.

The combined label (e.g. `"My Awesome API v1.0"`) is also exposed to all templates as the `{{apiName}}` variable so custom templates can reference it.

## Route Prefix

The `route-prefix` option controls the path prefix shown in HTTP request lines on operation pages. It supports a `{version}` token that is substituted with the actual API version value for versioned services.

The default value is `api/{version}`:

```yaml
options:
  "@massivescale/tsp-api-docs":
    route-prefix: "api/{version}"
```

**Non-versioned service** — `{version}` resolves to an empty string, giving just `api`:

```http
GET /api/widgets/{id}
```

**Versioned service at v1.0** — `{version}` is substituted with `1.0`:

```http
GET /api/1.0/widgets/{id}
```

To use a custom prefix pattern:

```yaml
options:
  "@massivescale/tsp-api-docs":
    route-prefix: "v{version}/rest"
```

To emit bare paths with no prefix, set `route-prefix` to an empty string:

```yaml
options:
  "@massivescale/tsp-api-docs":
    route-prefix: ""
```

## Custom Templates

Any of the built-in Handlebars templates can be replaced by specifying a path to a custom `.hbs` file. Paths are resolved relative to the directory where `tsp compile` is run.

```yaml
options:
  "@massivescale/tsp-api-docs":
    templates:
      overview: ./my-templates/overview.md.hbs
      operation: ./my-templates/operation.md.hbs
```

Only the templates you list are overridden; all others continue to use the built-in defaults.

### Available template keys

| Key                | Built-in file                       | Renders                                               |
| ------------------ | ----------------------------------- | ----------------------------------------------------- |
| `overview`         | `templates/overview.md.hbs`         | Service overview page                                 |
| `operation`        | `templates/operation.md.hbs`        | Individual operation reference page                   |
| `type`             | `templates/type.md.hbs`             | Type page (models, unions, scalars)                   |
| `enum`             | `templates/enum.md.hbs`             | Enum type page                                        |
| `service-index`    | `templates/service-index.md.hbs`    | Root service index                                    |
| `operations-index` | `templates/operations-index.md.hbs` | `api/` sub-folder index                               |
| `types-index`      | `templates/types-index.md.hbs`      | `resources/` sub-folder index                         |
| `docfx-project`    | `templates/docfx.json.hbs`          | DocFx `docfx.json` project config (docfx format only) |

### Template variables

All templates receive the standard view model for their page type. The following variables are common across all page templates:

| Variable       | Description                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `title`        | Page title (service label, operation name, or type name).                                           |
| `summary`      | Doc summary from the TypeSpec `@summary` decorator, if present.                                     |
| `versionLabel` | The API version string (e.g. `"v1.0"`), present only on versioned services.                         |
| `apiName`      | The full `api-name`-prefixed label (e.g. `"My Awesome API v1.0"`). `undefined` when not configured. |

Refer to the built-in templates in `templates/` for the full variable list for each page type.

## Development Notes

- Main emitter implementation: `src/emitter.ts`
- Emitter option schema: `src/lib.ts`
- Template loader: `src/templates.ts`
- Tests: `test/emitter.test.js`
- Example TypeSpec projects: `examples/`
- Project-specific Copilot guidance: `.github/copilot-instructions.md`
