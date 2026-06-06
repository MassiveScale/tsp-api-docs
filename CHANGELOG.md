# Changelog

All notable changes to `@massivescale/tsp-api-docs` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] — 2026-06-06

### Added

- **`docfx-theme` option** — string array of DocFx template names applied to the `build.template` array in the generated `docfx.json`. When not provided, defaults to `["default"]`. Only has effect with `format: docfx`.
- **`emit-project-files` option** — when `true` (default), the emitter writes project/configuration files such as `docfx.json` for the DocFx format. Set to `false` to emit documentation files only.
- **`emit-relation-diagram` option** — when `true`, the emitter writes a `relation-diagram.md` file in each service directory containing a Mermaid `erDiagram` of all emitted types and their relationships. For the `docfx` format the diagram is also linked in the service `toc.yml`.
- **`overwrite-project-files` option** — when `false` (default), project/configuration files (e.g. `docfx.json`) are only written if they do not already exist on disk. Set to `true` to always overwrite them. Has no effect on formats that do not emit project files.
- **DocFx `docfx.json` emission** — the DocFx format now automatically emits a `docfx.json` project configuration file at the output root, controlled by `emit-project-files` and `overwrite-project-files`.
- **`clean-output-dir` option** — when `true` (default), the emitter removes all previously generated documentation files from `emitter-output-dir` before writing new output, preventing stale files from accumulating. Project/configuration files (e.g. `docfx.json`) are always preserved regardless of this setting. Set to `false` to skip cleaning entirely.

### Fixed

- **`clean-output-dir` preserves project files** — the directory clean now enumerates only non-project-file entries and deletes them individually, so `docfx.json` (and equivalent files for other formats) survive the clean. Previously the entire output directory was wiped, making `overwrite-project-files: false` ineffective on subsequent runs.
- **Markdown tables render correctly** — all Handlebars templates have been rewritten so that each table row is emitted on a single line. Previously, indented `{{#each}}` blocks caused every cell to appear on its own line, which prevented `CliPrettify` from aligning the columns.
- **`docfx.json` is now template-driven** — the DocFx project file is rendered from `templates/docfx.json.hbs` (overridable via the `templates["docfx-project"]` option) instead of being hardcoded in TypeScript.
- **Type names are exact** — type page titles and file names now use the type name exactly as defined in TypeSpec (e.g. `WidgetList.md`, `AnalyzeResult.md`) instead of splitting CamelCase into hyphenated/spaced forms (`Widget-List.md`, `Analyze Result`).
- **No-explicit-any lint error** — the JSON schema for the `templates` option now uses a safe double-cast through `unknown` instead of `as any`.

---

## [0.2.5] — 2026-05-30

### Added

- **`route-prefix` option** — configurable prefix prepended to all HTTP request paths on operation pages. Supports a `{version}` token that is substituted with the API version value for versioned services (e.g. `api/{version}` + version `1.0` → `/api/1.0/widgets/{id}`). For non-versioned services, `{version}` resolves to an empty string (e.g. `api/{version}` → `/api/widgets/{id}`). Default is `api/{version}`. Set to `""` to emit bare paths.

---

## [0.2.4] — 2026-05-21

### Added

- **`api-name` option** — optional API name prefix for file and folder slugs. When set, non-versioned services use `slugify(api-name)` as the folder name; versioned services use `slugify("<api-name> <version>")` (e.g. `my-awesome-api-v1-0/`). When `render-service-index` is enabled, versioned entries are grouped under the `api-name` heading. The combined label is also available in every template as `{{apiName}}`.
- **Custom templates** — any of the seven built-in Handlebars templates can now be replaced with a custom `.hbs` file via the new `templates` option. Paths are resolved relative to `process.cwd()`. Templates not listed fall back to the built-in defaults. Load failures are reported as TypeSpec diagnostics.

---

## [0.2.3] — 2026-05-12

### Added

- **Separate enum template** — enum type pages are now rendered using a dedicated `templates/enum.md.hbs` template instead of the shared `type.md.hbs`. The enum template focuses on the `## Members` table and omits sections irrelevant to enums (properties, variants, base type, JSON representation).

---

## [0.2.2] — 2026-05-11

### Added

- **Response headers section** — operation pages now include a `## Response headers` table listing any custom headers returned by the operation (name, type, required, summary).
- **Visibility-aware request body examples** — request body JSON examples now omit properties that callers cannot supply:
  - `POST` operations exclude read-only properties (`@visibility("read")`).
  - `PATCH` / `put` operations exclude read-only and immutable (create-only) properties.
    This uses `resolveRequestVisibility` and `isVisible` from `@typespec/http`.

### Fixed

- **Anonymous HTTP response type rendering** — the `Response` table and the operation return type now show the actual body type (e.g. `[Widget](../resources/Widget.md)`) instead of the raw anonymous model (`{ statusCode: 201; eTag: string; body: Widget }`).

---

## [0.2.1] — 2026-05-11

### Added

- **Automatic table formatting** — all generated Markdown tables are now column-aligned using `markdown-table-prettify` for improved readability.
- **Type linking** — property types, request body types, and return types that have a corresponding documentation page are now rendered as Markdown links instead of plain text.

### Changed

- **Output folder names** — operations pages now live under `api/` (previously `operations/`) and type pages under `resources/` (previously `types/`), aligning with Microsoft Graph documentation conventions.
- **Enum pages omit JSON representation** — the `## JSON representation` section is no longer emitted for `Enum` types, as a list of members already fully describes the type.

### Fixed

- The root service index was incorrectly emitted as `index.md` instead of `README.md` in `azure-devops` format when `render-service-index` is enabled.
- **Azure DevOps Wiki index page placement** — overview pages, operations index pages (`api.md`), and types index pages (`resources.md`) are now emitted at the same level as the folder they represent rather than inside it. Azure DevOps Wiki requires a page to sit beside its child folder (not within it) for the sidebar to associate the page with the folder node.

---

## [0.2.0] — 2026-05-10

### Added

- **`format` emitter option** — choose the output structure to match your documentation platform:
  - `azure-devops` _(default)_ — folder landing pages use the folder name (e.g. `<slug>/<slug>.md`, `api/api.md`, `resources/resources.md`) for Azure DevOps Wiki compatibility.
  - `github` — folder landing pages are `README.md` so GitHub renders them automatically when browsing directories.
  - `docfx` — folder landing pages are `index.md`; each service folder also gets a `toc.yml` table of contents. When `render-service-index` is enabled a root `toc.yml` is emitted as well.
- **Operations sub-folder index page** — a summary table of all operations in a service is now emitted alongside the individual operation pages (`api/api.md` / `api/README.md`).
- **Types sub-folder index page** — a summary table of all types in a service is now emitted alongside the individual type pages (`resources/resources.md` / `resources/README.md`).
- **`templates/operations-index.md.hbs`** — Handlebars template for the operations index page.
- **`templates/types-index.md.hbs`** — Handlebars template for the types index page.

### Fixed

- Operation page titles now include the interface (resource) name — e.g. `# Widgets Update` instead of `# Update`.
- `typeReference()` now correctly renders array model types as `Widget[]` rather than the internal model name `Array`.

---

## [0.1.0] — initial release

### Added

- TypeSpec emitter (`@massivescale/tsp-api-docs`) that generates API reference docs in Markdown following a Microsoft Graph-style structure.
- Per-service overview pages, per-operation pages, and per-type pages (models, enums, unions, scalars).
- Optional root service index page via `render-service-index` option.
- External Handlebars templates (`templates/*.hbs`) for full layout customisation.
- `@typespec/versioning` support — versioned APIs emit a separate folder per version.
- Emitter options: `emitter-output-dir`, `page-title-prefix`, `render-service-index`.
- End-to-end Node.js built-in test suite (`test/emitter.test.js`).
- Example TypeSpec projects under `examples/`.
