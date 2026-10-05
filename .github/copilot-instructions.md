# Copilot Instructions for tsp-api-docs

## Project Purpose

`@massivescale/tsp-api-docs` is a TypeScript TypeSpec emitter that generates API reference documentation in Markdown. It is published publicly on npm and targets Azure DevOps Wiki, GitHub, and DocFx output formats.

## Repository Layout

| Path                        | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `src/emitter.ts`            | `$onEmit` entry point — orchestrates the full emit pipeline  |
| `src/lib.ts`                | Emitter option schema (`ApiDocsEmitterOptions`) and `$lib`   |
| `src/collect.ts`            | Namespace/operation/type walkers with deduplication          |
| `src/service-entry.ts`      | Assembles per-service page models and related-method index   |
| `src/operation-page.ts`     | Builds `OperationPageModel` for each operation page          |
| `src/type-page.ts`          | Builds `TypePageModel` for each type page                    |
| `src/payloads.ts`           | Decides which types get pages and which properties are data  |
| `src/type-ref.ts`           | Type-to-string helpers and Markdown-linked type references   |
| `src/output.ts`             | Index/TOC builders and output directory clean logic          |
| `src/operation-examples.ts` | HTTP example generation (from `@opExample` or synthetic)     |
| `src/relation-diagram.ts`   | Mermaid ER diagram builder                                   |
| `src/templates.ts`          | Handlebars template loader with override support             |
| `src/utils.ts`              | Shared formatting, slug, breadcrumb, and status-code helpers |
| `src/index.ts`              | Public re-exports (`$onEmit`, `$lib`)                        |
| `src/testing/index.ts`      | `TspApiDocsTestLibrary` for use in consumer test harnesses   |
| `templates/`                | External `.hbs` templates (one per page type)                |
| `test/`                     | Node built-in test files (`*.test.js`)                       |
| `examples/`                 | Example TypeSpec projects for manual validation              |
| `dist/src/`                 | Compiled output — what npm consumers receive                 |

## Technical Conventions

- Keep emitter implementation under `src/`. Do not embed large templates directly in TypeScript files.
- Handlebars templates live as external `.hbs` files under `templates/`. Template keys and their built-in paths are documented in `README.md`.
- Prefer focused, incremental changes over broad refactors.
- Configuration options in `src/lib.ts` and in documentation must be sorted alphabetically.
- The `files` field in `package.json` is the publish whitelist — only `dist/src/`, `templates/`, `README.md`, `CHANGELOG.md`, and `LICENSE` are shipped to npm. Do not widen it without a clear reason.
- Peer dependencies are `@typespec/compiler >= 1.12.0`, `@typespec/http >= 1.12.0`, and `@typespec/versioning >= 0.82.0`.
- The `typeDirectlyReferencesTarget` function in `service-entry.ts` intentionally does not recurse into regular model properties — it only checks direct references and one level of plain wrapper model properties. This is by design to avoid false positives on deeply nested types.
- Type pages cover payload data only. `src/payloads.ts` decides which types get pages by asking `@typespec/http` how request and response bodies resolve; metadata-only models and response models with an explicit `@body` never get a page, and `@header` / `@cookie` / `@statusCode` properties never appear in property tables or JSON. This mirrors `@massivescale/tsp-aspnetcore-api` (`src/payloads.ts` there) — keep the two rules in sync. See "Which types get pages" in `readme.md`.
- In versioned services, `getMergePatchSource` returns the unversioned model, not the version snapshot's copy. Compare with `isSameDeclaration`, never by identity.

## Code Style

- Every exported symbol (function, interface, type alias, const, enum member) must have a JSDoc comment. All source files are fully documented — maintain this standard.
- Add inline comments only for non-obvious invariants, subtle constraints, or workarounds — never for self-evident code.
- Test methods are self-documenting; do not add JSDoc to test cases.

## Testing

- Tests are Node built-in tests (`node:test`) in `test/*.test.js` — VS Code test discovery requires this.
- Keep tests end-to-end where possible: compile TypeSpec source inline and assert on generated Markdown output.
- Cover default markdown generation, multiple service namespaces, and each output format.
- `npm test` runs `tsc` then the full test suite — a failing build is a failing test run.

## After Making Changes

1. Run `npm test` — compiles TypeScript and runs the full test suite. Zero failures required.
2. Run `npm run lint` — zero warnings allowed.
3. Run `npm run format` — apply Prettier formatting.
4. Rebuild example TypeSpec projects under `examples/` to validate real output.
5. Update `CHANGELOG.md` with a summary of notable changes.
6. Update `README.md` if behavior, options, or output structure changed.

## Publishing

Releases are published to npm automatically via `.github/workflows/publish.yml` when a GitHub release is created. The workflow validates that the `package.json` version matches the release tag, then runs the full validation suite before publishing. Do not publish manually.
