# Changelog

All notable changes to `@massivescale/tsp-api-docs` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — 2026-05-10

### Added

- **`format` emitter option** — choose the output structure to match your documentation platform:
  - `azure-devops` *(default)* — folder landing pages use the folder name (e.g. `<slug>/<slug>.md`, `operations/operations.md`, `types/types.md`) for Azure DevOps Wiki compatibility.
  - `github` — folder landing pages are `README.md` so GitHub renders them automatically when browsing directories.
  - `docfx` — folder landing pages are `index.md`; each service folder also gets a `toc.yml` table of contents. When `render-service-index` is enabled a root `toc.yml` is emitted as well.
- **Operations sub-folder index page** — a summary table of all operations in a service is now emitted alongside the individual operation pages (`operations/operations.md` / `operations/README.md`).
- **Types sub-folder index page** — a summary table of all types in a service is now emitted alongside the individual type pages (`types/types.md` / `types/README.md`).
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
