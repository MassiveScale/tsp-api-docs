# Changelog

All notable changes to `@massivescale/tsp-api-docs` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.1.0] — Global Query Options and Payload-Only Type Pages

### Added

- `@globalQueryOptions(...models)` decorator (in `MassiveScale.ApiDocs`) for query options that shared infrastructure handles, such as OData `$filter` and `$top`. Apply it to a namespace, interface, or operation; the nearest one wins. Each model property becomes a row in the operation's **Optional query parameters** table, after the parameters the operation declares, without changing the HTTP model, OpenAPI output, or generated code. Use `PickProperties` to give each operation its own subset. Custom `operation` templates receive the rows as `globalQueryOptions`.
- The package now has a TypeSpec entry point (`lib/main.tsp`), so `import "@massivescale/tsp-api-docs";` works in `.tsp` files.
- Discriminated types are documented as polymorphic payloads, for both `@discriminator` model hierarchies and `@discriminated` unions (with or without an envelope). See "Discriminated types" in the README.
  - A polymorphic type's page names its discriminator, lists its **Derived types** (or, for a union, adds a discriminator value column to **Variants**), and shows one **JSON representation** per variant. A base model that leaves its discriminator undeclared gets a property row for it.
  - A derived model's or variant's page shows its **Discriminator value** and links to the polymorphic type. A new **Polymorphic methods** table lists the operations that reach the type through that polymorphic type (e.g. `get(): Pet` on the `Dog` page).
  - Operation pages get a **Polymorphic payloads** section, and the request body description names the discriminator values. When the request or primary response body is polymorphic, synthetic examples are generated once per variant (`Example 1: Dog`, `Example 2: Cat`, ...).
  - The relation diagram links derived models to their base (`Dog |o..|| Pet : "extends (kind = dog)"`) and discriminated unions to their variants, and marks discriminator attributes.
  - Custom templates get the new `discriminator`, `derivedTypes`, `discriminatorValues`, `polymorphicMethods`, and `variantRepresentations` fields on type pages, `discriminatorValue` on union variants, and `polymorphicPayloads` on operation pages.
- The `versioned-api` example now includes a discriminated model hierarchy (`Notification`, with `PushNotification` added in v2.0) and two discriminated unions (`PaymentMethod` without an envelope, `OrderEvent` with one).

### Changed

- Widened the `@typespec/versioning` peer dependency from `^0.85.0` to `>=0.85.0 <1.0.0`. A caret on a `0.x` version only allows patch releases (`0.85.x`), so projects on `@typespec/versioning` 0.86 or later hit a peer-dependency conflict when installing this emitter.
- **Behavior change:** Type pages and the Types index now cover only payload data, decided with `@typespec/http` (`getHttpOperation`, `isMetadata`, and the resolved request/response bodies) instead of every named model in the namespace. This is the same rule `@massivescale/tsp-aspnetcore-api` 0.15.0 uses. **Pages disappear, so links to them break:**
  - **Metadata-only models** (every property is `@statusCode`, `@header`, `@cookie`, `@query`, or `@path`, e.g. `ETagHeader`, `IfMatchHeader`, `UpdatedResponse`) no longer get a page.
  - **Response models with an explicit `@body` / `@bodyRoot`** (e.g. `EntityResponse<T>`, `@error model NotFoundError { ...NotFoundResponse; @body body: Error; }`) no longer get a page. Their body type does, and their `@doc` still describes the status code on the operation page.
  - In a service with HTTP operations, models, unions, and scalars that no operation reaches through a body, parameter, property, base model, discriminated derived model, or `MergePatchUpdate<T>` source no longer get a page. Enums always do. A service with no HTTP operations keeps every type except the two kinds above.
- **Behavior change:** A response model that mixes metadata with plain properties and has no `@body` (an _implicit body_) keeps its page, but the page lists only the body properties. More generally, `@header`, `@cookie`, and `@statusCode` properties, and properties typed as a metadata-only or explicit-body response model, never appear in a type's property table, JSON representation, example bodies, or relation diagram, wherever the model is used.
- A model's "Base type" skips metadata-only base models and points at the nearest base that has a page.
- The **Methods** table on a type page now lists operations that return or accept the type through a response model (`EntityResponse<Widget>`) or through `MergePatchUpdate<Widget>`.
- The **Response** line on operation pages, and the Returns column on the overview, operations index, and Methods tables, now show what a caller receives on success: the 2xx body types, or `void`. Previously they listed every body type including errors (e.g. `[Error]` for an update that returns `204`), or the raw TypeSpec return type (e.g. `UpdatedResponse | NotFoundError | ...`).
- The built-in operation template's **Parameters** table, which repeated headers and the body already covered in their own sections, is replaced by a **Path parameters** table (and a **Request cookies** table when the operation takes cookies). Operations without HTTP metadata still render **Parameters**. Custom `operation` templates are unaffected: every existing variable, including `parameters`, is still provided. They also get new `pathParameters` and `requestCookies` variables, and each entry in `responses` now has a `headers` list.

### Fixed

- Response headers are now documented per status code on operation pages (name, type, required, description) and included in the example HTTP response (e.g. `ETag: string`). When an `@opExample` returns a response model, its `@body` value is used as the JSON body and its header values as header lines, instead of the whole model being printed as the body.
- Query parameters use their wire name (`@query(#{ name: "$expand" })` documents `$expand`, not `expand`) in the query parameter table, the example request (`?$expand=string`), and the URI template, which now renders `{?$expand}` instead of `{?%24expand}`. Array query parameters render as `name=a,b`, or `name=a&name=b` with `explode: true`. Path parameters also use their wire name in examples.
- Every IANA-registered HTTP status code now renders with its reason phrase (e.g. `409 Conflict`, `412 Precondition Failed`), not just the nine most common ones.
- Synthetic JSON for a polymorphic type was invalid: a `@discriminator` base rendered without its discriminator (`{ "id": "string", "name": "string" }` for `Pet`), and a `@discriminated` union rendered as its first variant's bare properties, ignoring the discriminator and the envelope. A client copying either got an error. Request and response bodies, examples, type pages, and nested properties now render a real variant with its discriminator set and listed first (`{ "kind": "dog", ... }`, or `{ "kind": "created", "value": { ... } }` for an object envelope). A polymorphic array shows one item per variant.
- A property typed as an enum member (`kind: PetKind.dog`) rendered as `"Demo.PetKind.dog"` in JSON and `Demo.PetKind.dog` in property tables. JSON now shows the member's value (`"dog"`), and tables show `[PetKind](PetKind.md).dog`. The relation diagram shows the enum's name instead of `unknown`.
- A model that declares properties and also accepts others (`model Bag { name: string; ...Record<string>; }`, or `extends Record<string>`) was treated as a plain record: it got no page, every reference showed `Record<string, string>`, and its declared properties disappeared from examples. It now gets a page with its properties and an `Additional properties:` line, and examples show its properties plus one `"additionalProperty"`.
- `@encodedName("application/json", ...)` was ignored, so property tables and examples showed the TypeSpec name instead of the wire name. Property tables, JSON representations, examples, and the relation diagram now use the JSON wire name.
- Response examples included write-only properties (e.g. a `@visibility(Lifecycle.Create)` password). They now use read visibility, the same way request examples already used the verb's request visibility.
- Sample values were type names rather than valid values: `"utcDateTime"`, `"duration"`, `"bytes"`, and `since=utcDateTime` in query strings. They are now real values in the wire format (RFC 3339 dates, RFC 7231 in headers, ISO 8601 durations, base64 bytes), honouring `@encode`, `@format`, `@minLength` / `@maxLength`, `@minValue` / `@maxValue`, and declared defaults. See "Sample values" in the README.
- Request examples listed `Content-Type` twice when the operation declares a `@header contentType` parameter.
- **Changed output:** in the relation diagram, a model whose base is in the diagram now lists only its own properties and gets an `extends` line to its base, instead of repeating every inherited property.

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
