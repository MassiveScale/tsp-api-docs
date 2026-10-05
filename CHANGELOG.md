# Changelog

All notable changes to `@massivescale/tsp-api-docs` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed

- **Breaking:** Type pages and the Types index now cover only payload data, decided with `@typespec/http` (`getHttpOperation`, `isMetadata`, and the resolved request/response bodies) instead of every named model in the namespace. This is the same rule `@massivescale/tsp-aspnetcore-api` 0.15.0 uses. **Pages disappear, so links to them break:**
  - **Metadata-only models** (every property is `@statusCode`, `@header`, `@cookie`, `@query`, or `@path`, e.g. `ETagHeader`, `IfMatchHeader`, `UpdatedResponse`) no longer get a page.
  - **Response models with an explicit `@body` / `@bodyRoot`** (e.g. `EntityResponse<T>`, `@error model NotFoundError { ...NotFoundResponse; @body body: Error; }`) no longer get a page. Their body type does, and their `@doc` still describes the status code on the operation page.
  - In a service with HTTP operations, models, unions, and scalars that no operation reaches through a body, parameter, property, base model, discriminated derived model, or `MergePatchUpdate<T>` source no longer get a page. Enums always do. A service with no HTTP operations keeps every type except the two kinds above.
- **Breaking:** A response model that mixes metadata with plain properties and has no `@body` (an _implicit body_) keeps its page, but the page lists only the body properties. More generally, `@header`, `@cookie`, and `@statusCode` properties, and properties typed as a metadata-only or explicit-body response model, never appear in a type's property table, JSON representation, example bodies, or relation diagram, wherever the model is used.
- A model's "Base type" skips metadata-only base models and points at the nearest base that has a page.
- The **Methods** table on a type page now lists operations that return or accept the type through a response model (`EntityResponse<Widget>`) or through `MergePatchUpdate<Widget>`.
- The **Response** line on operation pages, and the Returns column on the overview, operations index, and Methods tables, now show what a caller receives on success: the 2xx body types, or `void`. Previously they listed every body type including errors (e.g. `[Error]` for an update that returns `204`), or the raw TypeSpec return type (e.g. `UpdatedResponse | NotFoundError | ...`).
- **Breaking (custom templates):** The operation page's **Parameters** table, which repeated headers and the body already covered in their own sections, is replaced by a **Path parameters** table (and a **Request cookies** table when the operation takes cookies). Operations without HTTP metadata still render **Parameters**. Custom `operation` templates get new `pathParameters` and `requestCookies` variables, and each entry in `responses` now has a `headers` list.

### Fixed

- Response headers are now documented per status code on operation pages (name, type, required, description) and included in the example HTTP response (e.g. `ETag: string`). When an `@opExample` returns a response model, its `@body` value is used as the JSON body and its header values as header lines, instead of the whole model being printed as the body.
- Query parameters use their wire name (`@query(#{ name: "$expand" })` documents `$expand`, not `expand`) in the query parameter table, the example request (`?$expand=string`), and the URI template, which now renders `{?$expand}` instead of `{?%24expand}`. Array query parameters render as `name=a,b`, or `name=a&name=b` with `explode: true`. Path parameters also use their wire name in examples.
- Every IANA-registered HTTP status code now renders with its reason phrase (e.g. `409 Conflict`, `412 Precondition Failed`), not just the nine most common ones.

---

## [v1.0.0] — Initial Release

### Added

- Added support for the `@externalDocs` decorator (`@typespec/openapi`) on operations, types (models/unions/enums/scalars), and the service namespace — rendered as an "External documentation" Markdown link section. This introduces a new `@typespec/openapi: ^1.15.0` peer/dev dependency, installed alongside the existing `@typespec/compiler`/`@typespec/http` `^1.15.0` and `@typespec/versioning` `^0.85.0`.
- Operation pages now render `@errorsDoc` doc-comment content under a new "## Errors" heading, sourced via `getErrorsDoc` from `@typespec/compiler`. Previously the operation page model always hard-coded `errorsDoc: undefined`, so the `@errorsDoc` tag was silently ignored.
- `@encode(string)` on a `boolean` model property is now reflected in generated example JSON: the property renders as the wire-level string `"true"`/`"false"` instead of a native JSON boolean, matching how `@massivescale/tsp-aspnetcore-api`, `@massivescale/tsp-refit-client`, and `@massivescale/tsp-ts-client-models` already handle this encoding. Plain `boolean` properties are unaffected.
- New `tsp-api-docs/missing-errors-doc` linter rule (in `recommended` and `all` rule sets): flags an operation that can return an error response — a status code `>= 400`, or a response body typed with `@error` — but has no `@errorsDoc` doc-comment tag. Reports once per operation.

### Fixed

- "## Response headers" on operation pages now renders unconditionally, matching every other section in the operation template. It was previously nested inside the `{{#if errorsDoc}}` block alongside "## Errors", so — since `errorsDoc` was always `undefined` before this release — response headers never rendered on any generated operation page.

### Changed

- Upgraded the supported TypeSpec toolchain to the 1.15.0 release train: `@typespec/compiler` and `@typespec/http` to `^1.15.0`, and `@typespec/versioning` to `^0.85.0`.

### Removed

- **Breaking (tooling):** Removed the `./testing` package export and the `TspApiDocsTestLibrary` it exposed. It relied on `createTestLibrary`/`TypeSpecTestLibrary`. Consumers writing tests against this emitter should use `createTester` from `@typespec/compiler/testing` directly (see `test/emitter.test.js` for the pattern).
- **Breaking:** Raised the minimum supported Node.js version to 22. `@typespec/compiler` and `@typespec/openapi` at `^1.15.0` both require Node `>=22.0.0`, so `engines.node` in `package.json` now accurately reflects that floor instead of the previously advertised `>=18.0.0`. Consumers on Node 18 or 20 must upgrade.

---

## [v1.0.0-beta3] — DocFx Improvements

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
