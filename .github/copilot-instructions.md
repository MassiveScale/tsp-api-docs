# Copilot Instructions For tsp-api-docs

## Project Purpose
This project is a TypeSpec emitter that generates API reference documentation in Markdown.
The output structure mirrors Microsoft Graph style reference docs.

## Technical Conventions
- Keep emitter implementation under `src/`.
- Keep Handlebars templates as external `.hbs` files under `templates/`.
- Avoid embedding large templates directly in TypeScript files.
- Prefer focused, incremental changes over broad refactors.

## Emitter Behavior
- Emit Markdown output.
- Respect emitter options from `src/lib.ts`.
- Keep service, operation, and type pages aligned with Graph-style API reference organization.

## Testing Expectations
- Tests should be Node built-in tests in `test/*.test.js` so VS Code test discovery can find them.
- Keep tests end-to-end where possible by compiling TypeSpec source and asserting generated outputs.
- Cover:
  - default markdown generation,
  - multiple service namespaces.

## Validation
- After code changes, run:
  - `npm run build`
  - `npm test`
- After cide code changes, rebuild the example typespec projects under `examples/`
