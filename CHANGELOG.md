# Changelog

All notable changes to `@massivescale/tsp-api-docs` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Added support for the `@externalDocs` decorator (`@typespec/openapi`) on operations, types (models/unions/enums/scalars), and the service namespace — rendered as an "External documentation" Markdown link section. This introduces a new `@typespec/openapi: ^1.15.0` peer/dev dependency, installed alongside the existing `@typespec/compiler`/`@typespec/http` `^1.15.0` and `@typespec/versioning` `^0.85.0`.
- Operation pages now render `@errors` doc-comment content under a new "## Errors" heading, sourced via `getErrorsDoc` from `@typespec/compiler`. Previously the operation page model always hard-coded `errorsDoc: undefined`, so the `@errors` tag was silently ignored.
- `@encode(string)` on a `boolean` model property is now reflected in generated example JSON: the property renders as the wire-level string `"true"`/`"false"` instead of a native JSON boolean, matching how `@massivescale/tsp-aspnetcore-api`, `@massivescale/tsp-refit-client`, and `@massivescale/tsp-ts-client-models` already handle this encoding. Plain `boolean` properties are unaffected.
- New `tsp-api-docs/missing-errors-doc` linter rule (in `recommended` and `all` rule sets): flags an operation that can return an error response — a status code `>= 400`, or a response body typed with `@error` — but has no `@errors` doc-comment tag. Reports once per operation.

### Fixed

- "## Response headers" on operation pages now renders unconditionally, matching every other section in the operation template. It was previously nested inside the `{{#if errorsDoc}}` block alongside "## Errors", so — since `errorsDoc` was always `undefined` before this release — response headers never rendered on any generated operation page.

### Changed

- Upgraded the supported TypeSpec toolchain to the 1.15.0 release train: `@typespec/compiler` and `@typespec/http` to `^1.15.0`, and `@typespec/versioning` to `^0.85.0`.

### Removed

- **Breaking (tooling):** Removed the `./testing` package export and the `TspApiDocsTestLibrary` it exposed. It relied on `createTestLibrary`/`TypeSpecTestLibrary`. Consumers writing tests against this emitter should use `createTester` from `@typespec/compiler/testing` directly (see `test/emitter.test.js` for the pattern).

---

## [v1.0.0-beta2] — DocFx Improvements

### Added

- `docfx.app-name` option — sets `globalMetadata._appName` in the generated `docfx.json`
- `docfx.app-title` option — sets `globalMetadata._appTitle` in the generated `docfx.json`
- `docfx.emit-json` option — suppresses `docfx.json` output independently of `emit-project-files`
- `docfx.enable-pdf` option — controls `globalMetadata.pdf` in the generated `docfx.json`
- `docfx.enable-pdf-toc-page` option — controls `globalMetadata.pdfTocPage` in the generated `docfx.json`

### Changed

- **Breaking**: DocFx-specific options are now nested under a `docfx:` key in `tspconfig.yaml` (e.g. `docfx: { theme: ["default", "modern"] }`) rather than being flat top-level keys with a `docfx-` prefix. Rename existing `docfx-theme` → `docfx.theme` (i.e. `docfx: { theme: [...] }`), etc.
- DocFx root `toc.yml` now groups versioned services under a nested `Versions` section rather than listing them as a flat list
- `docfx.json` template expanded: `globalMetadata` now includes `_appName`, `_appTitle`, and `pdfTocPage`

---

## [v1.0.0-beta1] — Initial Release

### Added

- Initial Release
