# @massivescale/tsp-api-docs

[![npm version](https://badge.fury.io/js/@massivescale%2Ftsp-api-docs.svg)](https://www.npmjs.com/package/@massivescale/tsp-api-docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/MassiveScale/tsp-api-docs/actions/workflows/pr-validation.yml/badge.svg)](https://github.com/MassiveScale/tsp-api-docs/actions/workflows/pr-validation.yml)

TypeSpec emitter for generating API reference documentation in Markdown.

Supports multiple output formats targeting Azure DevOps Wiki, GitHub, and DocFx.

## Features

- Emits Markdown docs with per-service overview pages, per-operation pages, and per-type pages (models, enums, unions, scalars). Type pages cover payload data only — response models and metadata-only models are documented on operation pages instead. See [Which types get pages](#which-types-get-pages).
- Three output formats: `azure-devops` (default), `github`, and `docfx`.
- Automatically formats Markdown tables with aligned columns.
- External Handlebars templates — override any built-in template with a custom `.hbs` file.
- Optional root service index page.
- Versioned API support via `@typespec/versioning`.
- Optional `api-name` prefix for versioned file/folder slugs (e.g. `my-api-v1-0/`).
- Configurable `route-prefix` with `{version}` token substitution for HTTP request lines (default: `api/{version}`).
- Response headers documented per status code, and included in example responses.
- Query, header, path, and cookie parameters documented by their HTTP wire names (e.g. `$expand`, `If-Match`).
- `@globalQueryOptions` documents query options handled by shared infrastructure (e.g. OData `$filter`, `$top`) per operation, without adding them to the operation signature. See [Global query options](#global-query-options).
- Request body examples automatically omit read-only and immutable properties based on HTTP verb visibility, and response examples omit write-only ones.
- Example payloads are values a server accepts: properties use their `@encodedName` wire names, dates, durations and bytes follow their `@encode`, and strings and numbers honour `@format` and length/range constraints. See [Sample values](#sample-values).
- Type names rendered exactly as defined — no CamelCase splitting in page titles.
- Related-methods table on type pages lists only operations that directly address the type — return it (including through a response model such as `EntityResponse<Widget>`), accept it as a parameter or body (including through `MergePatchUpdate<Widget>`), or use a direct array/record/union of it. Operations that reference the type only through nested properties are excluded, except for one-level wrapper request models that are direct operation parameters (e.g. `CreateWidgetRequest { widget: Widget }`). Types decorated with `@error` are never treated as addressable entities and have no Methods section.
- Discriminated types (`@discriminator` models and `@discriminated` unions) document their discriminator, derived types or variants, and a valid JSON payload for each variant. Operations that send or return them get one example per variant. See [Discriminated types](#discriminated-types).
- DocFx `toc.yml` output is YAML-safe — service and page titles containing colons or other special characters are properly quoted.

## Requirements

- Node.js 22 or later
- `@typespec/compiler` ^1.15.0
- `@typespec/http` ^1.15.0
- `@typespec/openapi` ^1.15.0
- `@typespec/versioning` >=0.85.0 <1.0.0

## Install

```bash
npm install --save-dev @massivescale/tsp-api-docs
```

Peer dependencies must also be present in your project:

```bash
npm install --save-dev @typespec/compiler @typespec/http @typespec/openapi @typespec/versioning
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

All options are set under the `"@massivescale/tsp-api-docs"` key in `tspconfig.yaml`:

```yaml
options:
  "@massivescale/tsp-api-docs":
    format: azure-devops
    api-name: "My API"
    route-prefix: "api/{version}"
```

#### General options

| Option                    | Type                                        | Default          | Description                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api-name`                | `string`                                    | —                | API name prefix for file/folder slugs. See [API Name](#api-name) below.                                                                                                                                                                                                                                                              |
| `clean-output-dir`        | `boolean`                                   | `true`           | Before emitting, deletes the entire `emitter-output-dir` for `azure-devops` and `github` formats. For `docfx`, enumerates and removes only non-project files, preserving `docfx.json`. Do not point `emitter-output-dir` at a directory that contains unrelated files when this is `true`. Set to `false` to skip cleaning entirely. |
| `emit-project-files`      | `boolean`                                   | `true`           | When `true`, emits project/configuration files (e.g. `docfx.json`). Set to `false` to emit documentation files only.                                                                                                                                                                                                                 |
| `emit-relation-diagram`   | `boolean`                                   | `false`          | When `true`, emits a `relation-diagram.md` containing a Mermaid ER diagram of all types for each service.                                                                                                                                                                                                                            |
| `emitter-output-dir`      | `string`                                    | `./tsp-output`   | Output directory for generated files.                                                                                                                                                                                                                                                                                                |
| `format`                  | `"azure-devops"` \| `"github"` \| `"docfx"` | `"azure-devops"` | Output format. See [Output Formats](#output-formats) below.                                                                                                                                                                                                                                                                          |
| `overwrite-project-files` | `boolean`                                   | `false`          | When `false`, project files are only written if they do not already exist. Set to `true` to always overwrite them.                                                                                                                                                                                                                   |
| `page-title-prefix`       | `string`                                    | —                | Fallback title prefix used when the service has no explicit title.                                                                                                                                                                                                                                                                   |
| `render-service-index`    | `boolean`                                   | `false`          | Emit a root index page listing all services.                                                                                                                                                                                                                                                                                         |
| `route-prefix`            | `string`                                    | `api/{version}`  | Prefix prepended to HTTP request paths. Supports `{version}` token substitution. See [Route Prefix](#route-prefix) below.                                                                                                                                                                                                            |
| `templates`               | `TemplateOverrides`                         | —                | Per-template path overrides for custom Handlebars templates. See [Custom Templates](#custom-templates) below.                                                                                                                                                                                                                        |

#### DocFx options

DocFx-specific options are nested under a `docfx:` key, which itself lives under `"@massivescale/tsp-api-docs"`. These are only applied when `format: docfx`.

```yaml
options:
  "@massivescale/tsp-api-docs":
    format: docfx
    docfx:
      app-name: "My API"
      app-title: "My API Reference"
      enable-pdf: true
      enable-pdf-toc-page: true
      theme:
        - default
        - modern
```

| Option                | Type       | Default                 | Description                                                                                      |
| --------------------- | ---------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `app-name`            | `string`   | `api-name` or `"API"`   | Application name in the site header. Sets `globalMetadata._appName` in `docfx.json`.             |
| `app-title`           | `string`   | `api-name` or `"API"`   | Application title in the browser `<title>` tag. Sets `globalMetadata._appTitle` in `docfx.json`. |
| `emit-json`           | `boolean`  | `true`                  | When `false`, suppresses `docfx.json` output while leaving documentation pages unaffected.       |
| `enable-pdf`          | `boolean`  | `true`                  | Sets `globalMetadata.pdf` in `docfx.json`, enabling PDF generation in the DocFx build.           |
| `enable-pdf-toc-page` | `boolean`  | `true`                  | Sets `globalMetadata.pdfTocPage` in `docfx.json`, enabling a PDF table-of-contents page.         |
| `theme`               | `string[]` | `["default", "modern"]` | Template names applied to the `build.template` array in `docfx.json`.                            |

## Which types get pages

A type page (and a row in the Types index) describes **data**: something a client sends or receives as an HTTP body. The emitter decides this by asking `@typespec/http` how each operation's request and response bodies resolve, rather than documenting every model in the namespace. This is the same rule `@massivescale/tsp-aspnetcore-api` uses to decide which models get a C# class, and it matches how `@typespec/openapi3` builds schemas.

TypeSpec calls `@statusCode`, `@header`, `@cookie`, `@query`, and `@path` properties [metadata](https://typespec.io/docs/libraries/http/operations/). Two kinds of model describe HTTP details rather than data:

- A **metadata-only model** has only metadata properties, e.g. `model ETagHeader { @header("ETag") etag: string; }`, `model UpdatedResponse { ...NoContentResponse; ...ETagHeader; }`, or a spread parameter model like `model IfMatchHeader { @header("If-Match") ifMatch?: string; }`. It **never gets a type page**. Its properties show up on the operation pages that use it, as request headers, response headers, or parameters.
- A **response model** is used as an operation's return type and carries metadata. Only its body is data:
  - **Explicit body.** With an `@body` or `@bodyRoot` property (`model EntityResponse<T> { ...OkResponse; ...ETagHeader; @body body: T; }`, or `@error model NotFoundError { ...NotFoundResponse; @body body: Error; }`), the response model **gets no type page**. Its body type (`T`, `Error`) does. The response model's `@doc` still appears as that status code's description on the operation page.
  - **Implicit body.** If a response model mixes metadata with plain properties and has no `@body`, the plain properties form the body. The model **gets a type page** that lists only those plain properties.

```typespec
model WidgetResult {
  @header("ETag") etag: string; // metadata: shown as a response header on the operation page
  name: string;                 // body: shown on the WidgetResult type page
}

@get read(): WidgetResult;
```

Metadata never appears in a type's property table, JSON representation, or relation diagram entry, wherever the model is used. Specifically, `@header`, `@cookie`, and `@statusCode` properties are left out, as are properties typed as a metadata-only or explicit-body response model. `@path` and `@query` properties stay, because on a returned resource (`model Widget { @path id: string; ... }`) they are ordinary body data.

### Reachability

When the service has HTTP operations, a model, union, or scalar gets a page only if an operation reaches it:

- a request body, a response body (as resolved above), or a parameter type;
- the type of a property of an applicable [`@globalQueryOptions`](#global-query-options) model (the options model itself gets no page);
- transitively, a property type, base model, array/record element, union variant, or `MergePatchUpdate<T>` source of one of those;
- every derived model of a reachable `@discriminator` base. A derived model that is itself a response model (e.g. `model OddPet extends Pet { kind: "odd"; @body body: Toy; }`) still gets no page.

Enums always get a page, whether or not an operation uses them. Templated models (`EntityResponse<T>`) never get their own page; their body types do.

If a base model is metadata-only, a derived model's "Base type" points at the nearest base that does have a page (or is omitted).

A plain record (`Record<string>`, or `model Tags is Record<string>`) is shown as `Record<string, T>` and gets no page. A model that declares properties and also accepts others (`model Bag { name: string; ...Record<string>; }` or `model Bag extends Record<string> { name: string; }`) is a model: it gets a page listing its properties, with an `Additional properties:` line naming the type of the others.

When the service has **no** HTTP operations (a models-only library), every named model, enum, union, and scalar in the namespace gets a page, except metadata-only models and explicit-body response models.

## Operation pages

Each operation page documents the HTTP request and every response:

- **HTTP request** — the verb and URI template, with the route prefix applied. Percent-encoded names are decoded so the line reads the way a client types it (`{?$expand}` rather than `{?%24expand}`).
- **Path parameters**, **Optional query parameters**, **Request headers**, and **Request cookies** — one table each, using the wire name from `@path`, `@query`, `@header`, or `@cookie` (e.g. `$expand`, `If-Match`), not the TypeSpec property name. Empty path and cookie sections are omitted. Operations without HTTP metadata get a single **Parameters** table instead.
- **Request body** — the body type, content types, and a JSON example.
- **Response** — what the caller receives on success (the 2xx body types, or `void`), followed by one row per status code with its body type and description. Status codes show their standard reason phrase (e.g. `409 Conflict`, `412 Precondition Failed`).
- **Response headers** — one table per status code that returns headers (name, type, required, summary).
- **Polymorphic payloads** — present when a body is a discriminated type. See [Discriminated types](#discriminated-types).
- **Examples** — from `@opExample`, or generated from the HTTP metadata (one per variant for a polymorphic body). Example requests use wire names (`?$expand=string`), and example responses include response headers (`ETag: string`). When an `@opExample` return value is a response model, its `@body` value becomes the JSON body and its header values become the header lines.

## Property rules

The Summary column of every property and parameter table (type properties, path, query, header and cookie parameters, global query options, and response headers) adds the rules a value must follow after the `@doc` text:

| Source                                          | Example                             |
| ----------------------------------------------- | ----------------------------------- |
| `#deprecated "Use name."`                       | `Deprecated: Use name.`             |
| `@visibility(Lifecycle.Read)`                   | `Read-only.`                        |
| `@visibility(Lifecycle.Create)`                 | `Write-only; never returned.`       |
| `@visibility(Lifecycle.Read, Lifecycle.Create)` | `Set on create; can't be changed.`  |
| `count?: int32 = 5`                             | ``Default: `5`.``                   |
| `@format("uuid")`                               | ``Format: `uuid`.``                 |
| `@minLength(3) @maxLength(50)`                  | `3 to 50 characters.`               |
| `@pattern("^[A-Z]{3}-\\d+$")`                   | ``Must match `^[A-Z]{3}-\d+$`.``    |
| `@minValue(0) @maxValue(100)`                   | `Minimum 0, maximum 100.`           |
| `@minValueExclusive(0)`                         | `Greater than 0.`                   |
| `@minItems(1) @maxItems(3)`                     | `1 to 3 items.`                     |
| `@encode(DurationKnownEncoding.seconds, int32)` | ``Encoded as `seconds` (`int32`).`` |
| `@secret`                                       | `Sensitive: treat as a secret.`     |

- Constraints and `@encode` are read from the property first, then from its scalar's declaration chain. A property typed as `scalar Sku extends string` with `@pattern` shows the pattern, and the scalar's own page lists its rules on a `Constraints:` line.
- Read-only and write-only notes appear on model properties only, not on parameters.
- Custom templates get each row's rules as `rules` and the combined text as `description`. `summary` and `summaryOrFallback` are unchanged; the built-in templates now show `description`.

## Sample values

JSON representations and generated examples use values a client can send as they are:

| Type                      | Sample                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `utcDateTime`             | `"2024-01-15T09:30:00Z"`; RFC 7231 (`"Mon, 15 Jan 2024 09:30:00 GMT"`) in a header                             |
| `offsetDateTime`          | `"2024-01-15T10:30:00+01:00"`                                                                                  |
| `plainDate` / `plainTime` | `"2024-01-15"` / `"09:30:00"`                                                                                  |
| `duration`                | `"PT1H30M"`                                                                                                    |
| `bytes`                   | `"aGVsbG8gd29ybGQ="` (base64)                                                                                  |
| `url`                     | `"https://example.com"`                                                                                        |
| `string` with `@format`   | a value for the format: `uuid`, `email`, `uri`, `url`, `date-time`, `date`, `time`, `hostname`, `ipv4`, `ipv6` |
| `string`                  | `"string"`, padded or cut to `@minLength` / `@maxLength`                                                       |
| numeric scalars           | `0`, moved inside `@minValue` / `@maxValue` and their exclusive forms                                          |

- `@encode` changes the sample to match: `rfc7231` and `unixTimestamp` dates, `seconds` and `milliseconds` durations, `base64url` bytes, and `@encode(string)` on a boolean or number. It's read from the property first, then from the scalar's declaration chain.
- A property with a declared default (`retries?: int32 = 3`) uses the default.
- Properties are keyed by their JSON wire name, so `@encodedName("application/json", "display_label") label: string` appears as `display_label` in property tables and examples.
- A model that accepts additional properties shows one as `"additionalProperty"`.

## Discriminated types

A discriminated type is polymorphic: one property on the wire, the discriminator, says which concrete shape the payload has. TypeSpec has two forms, and both are documented the same way:

```typespec
// A base model and its derived models. Only the derived models must declare `kind`.
@discriminator("kind")
model Pet { name: string; }
model Dog extends Pet { kind: "dog"; barkVolume: int32; }
model Cat extends Pet { kind: "cat"; lives: int32; }

// A union. With `envelope: "none"`, `type` sits beside the variant's properties.
@discriminated(#{ discriminatorPropertyName: "type", envelope: "none" })
union Shape { circle: Circle, square: Square }

// With the default object envelope, the variant is wrapped:
// { "kind": "created", "value": { ... } }
@discriminated
union Event { created: Created, deleted: Deleted }
```

Variants come from the compiler's `getDiscriminatedUnionFromInheritance` and `getDiscriminatedUnion`, the same helpers `@massivescale/tsp-aspnetcore-api` uses to generate `[JsonDerivedType]` attributes, so the documented values match what generated code serializes.

**The polymorphic type's page** (`Pet`, `Shape`, `Event`):

- `Discriminator:` names the discriminator property.
- **Derived types** (models) or **Variants** (unions) is a table of each discriminator value and the type it selects, with a sentence on where the discriminator sits in the JSON.
- A base model that leaves its discriminator undeclared still gets a property row for it, typed as the union of its derived types' values (`"dog" | "cat"`), because every payload carries it.
- **JSON representation** has one block per variant, each with the discriminator set and listed first. Serializers such as `System.Text.Json` expect it first. A union with an object envelope shows the wrapped form.

**A derived model's or variant's page** (`Dog`, `Circle`):

- `Discriminator value:` gives the value that selects the type and links to the polymorphic type, e.g. `` `kind` = `"dog"` in [Pet] ``. A model nested in two discriminated hierarchies (`Shark extends Fish extends Pet`) has one line per level.
- The discriminator property comes first in the property table and the JSON. When it has no `@doc`, its summary is generated (`Discriminator. Always "dog" for this type.`).
- **Polymorphic methods** lists the operations that use a polymorphic type able to carry this type, but not the type itself, with the polymorphic type in the **Via** column. `get(): Pet` appears on the `Dog` page this way. Operations already in **Methods** are not repeated.

**Operation pages:**

- A synthetic JSON body for a polymorphic type is a real variant, with its discriminator set, instead of the bare base model. A client that sends the bare base gets an error.
- When the request body or the primary response body is polymorphic, **Examples** has one example per variant (`Example 1: Dog`, `Example 2: Cat`, ...). When both are, each example sends and returns the same variant. A polymorphic array (`Pet[]`) is shown as one example whose array holds one item per variant.
- **Polymorphic payloads** lists each polymorphic body type with its discriminator values. The request body description repeats this for the request.
- `@opExample` examples are used as written.

**Relation diagram:** a derived model shows only its own properties and links to its base with an `extends` line labelled with its discriminator value (`Dog |o..|| Pet : "extends (kind = dog)"`). Discriminator attributes are marked `"discriminator"`. A discriminated union links to each variant (`Circle |o..|| Shape : "type = circle"`). Plain inheritance also gets an `extends` line.

## Global query options

Some query options are handled by shared infrastructure rather than by the operation itself: OData middleware reading `$filter` and `$top`, a gateway reading `api-key`, a filter reading `tenant`. Declaring them with `@query` on every operation would add parameters that generated server code never reads. `@globalQueryOptions` documents them instead, without touching the HTTP model, so OpenAPI output and generated server and client code stay the same.

Define the options once as a model, then say which ones each operation accepts. TypeSpec's built-in `PickProperties` selects a subset:

```typespec
import "@massivescale/tsp-api-docs";

using Http;
using MassiveScale.ApiDocs;

model CommonQueryOptions {
  /** Filters the collection. */
  @query("$filter") filter?: string;
  /** Maximum number of items to return. */
  @query("$top") top?: int32;
  /** Number of items to skip. */
  @query("$skip") skip?: int32;
  /** Properties to include in the response. */
  @query("$select") select?: string;
}

@route("/widgets")
@globalQueryOptions(CommonQueryOptions)
interface Widgets {
  @get list(): Widget[];

  @globalQueryOptions(PickProperties<CommonQueryOptions, "select">)
  @get read(@path id: string): Widget;

  @globalQueryOptions()
  @delete remove(@path id: string): void;
}
```

| Operation | Query options documented              |
| --------- | ------------------------------------- |
| `list`    | `$filter`, `$top`, `$skip`, `$select` |
| `read`    | `$select`                             |
| `remove`  | none                                  |

How it works:

- Each property of each model becomes a row in the operation's **Optional query parameters** table, after the query parameters the operation declares itself. The decorator adds rows; it never removes declared ones.
- The wire name comes from `@query("name")`, or the property name when there is no `@query`. The type, required flag, and `@doc` / `@summary` come from the property.
- When a declared query parameter and a global option share a wire name, the declared parameter wins. When two models given to one decorator share a wire name, the first wins.
- The decorator can go on a namespace, an interface, or an operation. The nearest one replaces the outer ones; they are not added together. `@globalQueryOptions()` with no arguments means the operation takes none.
- Global options are not added to the HTTP request line or to example requests, because they are not part of the operation's route.

Avoid naming the model `QueryOptions`: with `using Http;` it clashes with `TypeSpec.Http.QueryOptions`.

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

When `format: docfx` is used, the emitter writes a `docfx.json` configuration file at the output root. This file is only written if it does not already exist (controlled by `overwrite-project-files`). To skip it entirely, set `emit-project-files: false` or `docfx: { emit-json: false }`.

The following options populate fields in the generated `docfx.json`:

```yaml
options:
  "@massivescale/tsp-api-docs":
    format: docfx
    docfx:
      app-name: "My API" # globalMetadata._appName
      app-title: "My API Docs" # globalMetadata._appTitle
      enable-pdf: true # globalMetadata.pdf
      enable-pdf-toc-page: true # globalMetadata.pdfTocPage
      theme:
        - default
        - my-custom-theme
```

### Relation Diagram

When `emit-relation-diagram: true`, a `relation-diagram.md` file is emitted in each service folder. It contains a Mermaid `erDiagram` block that shows every type that has a page (see [Which types get pages](#which-types-get-pages)) and their relationships:

```yaml
options:
  "@massivescale/tsp-api-docs":
    emit-relation-diagram: true
```

The code fence syntax is automatically selected per format — Azure DevOps Wiki uses `:::mermaid` / `:::` while GitHub and DocFx use ` ```mermaid ` / ` ``` `.

The diagram includes:

- Models as entities with their properties and types
- Enums as entities with their members
- Unions as entities with their named variants; discriminated unions as entities with their discriminator, linked to each variant
- Relationship lines between models that reference other service types
- `extends` lines from derived models to their base, which show only their own properties

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

The `operation` template also receives `pathParameters`, `optionalQueryParameters`, `globalQueryOptions`, `requestHeaders`, and `requestCookies` (each a list of `name`/`type`/`requiredLabel`/`summaryOrFallback`, keyed by wire name), `parameters` (every TypeSpec parameter by TypeSpec name), and `responses`, where each response has `statusCode`, `type`, `description`, and `headers`. `responseHeaders` lists every response header across all status codes. `polymorphicPayloads` lists the polymorphic body types, each with `type`, `propertyName`, `values`, and `shape`.

The `type` template also receives `discriminator` (`propertyName`, `envelope`, `envelopePropertyName`, `description`) for polymorphic types, `derivedTypes` (`value`, `type`, `summaryOrFallback`), `discriminatorValues` (`propertyName`, `value`, `polymorphicType`), `polymorphicMethods` (operation summaries with a `via` type), and `variantRepresentations` (`title`, `description`, `json`). Each entry in `variants` has a `discriminatorValue` for discriminated unions. Custom templates that ignore these fields keep working; `jsonRepresentation` for a polymorphic type is now its first variant.

## Contributing

```bash
git clone https://github.com/MassiveScale/tsp-api-docs.git
cd tsp-api-docs
npm install
npm test
```

Key source files: `src/emitter.ts` (core), `src/lib.ts` (option schema), `src/templates.ts` (template loader). Example TypeSpec projects are in `examples/`.

## License

[MIT](LICENSE)
