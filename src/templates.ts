import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateOverrides } from "./lib.js";

/** Module-level singleton: resolved absolute path to the built-in `templates/` directory. */
const templateDir = resolveTemplateDir();

/**
 * A fully-resolved set of raw Handlebars template strings for every page kind.
 * Each property holds the `.hbs` source text ready to be compiled by Handlebars.
 */
export interface TemplateBundle {
  /** Overview / landing page template. */
  overview: string;
  /** Individual operation page template. */
  operation: string;
  /** Model / Union / Scalar type page template. */
  type: string;
  /** Enum type page template. */
  enum: string;
  /** Root service index template (lists all services). */
  serviceIndex: string;
  /** Per-service operations index template. */
  operationsIndex: string;
  /** Per-service types index template. */
  typesIndex: string;
  /** DocFx `docfx.json` project file template. */
  docfxProject: string;
}

/**
 * Loads all eight Handlebars templates, applying any caller-supplied overrides.
 *
 * For each template key present in `overrides`, the file at the override path is
 * read instead of the built-in template. Omitted keys fall back to the built-in
 * `.hbs` files under the `templates/` directory.
 *
 * @param overrides - Optional map of template name to absolute override file path.
 * @returns A {@link TemplateBundle} of raw Handlebars source strings.
 * @throws If a template file (built-in or override) cannot be read.
 */
export function loadTemplates(
  overrides: TemplateOverrides = {},
): TemplateBundle {
  return {
    overview: loadTemplate("overview.md.hbs", overrides["overview"]),
    operation: loadTemplate("operation.md.hbs", overrides["operation"]),
    type: loadTemplate("type.md.hbs", overrides["type"]),
    enum: loadTemplate("enum.md.hbs", overrides["enum"]),
    serviceIndex: loadTemplate(
      "service-index.md.hbs",
      overrides["service-index"],
    ),
    operationsIndex: loadTemplate(
      "operations-index.md.hbs",
      overrides["operations-index"],
    ),
    typesIndex: loadTemplate("types-index.md.hbs", overrides["types-index"]),
    docfxProject: loadTemplate("docfx.json.hbs", overrides["docfx-project"]),
  };
}

/**
 * Locates the `templates/` directory at startup, checking two candidate paths
 * to handle both development (source tree) and published (dist) layouts.
 *
 * @returns The resolved absolute path to the `templates/` directory.
 * @throws If neither candidate path exists on disk.
 */
function resolveTemplateDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  // In the published package: dist/src/ → ../../templates/
  // During development:       src/       → ../templates/
  const candidates = [
    resolve(moduleDir, "../../templates"),
    resolve(moduleDir, "../templates"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find templates directory for tsp-api-docs emitter.",
  );
}

/**
 * Reads a single Handlebars template from disk.
 *
 * @param filename - The `.hbs` filename to load from the built-in templates dir.
 * @param overridePath - If provided, reads from this absolute path instead.
 * @returns The raw template source text as a UTF-8 string.
 */
function loadTemplate(filename: string, overridePath?: string): string {
  if (overridePath) {
    return readFileSync(overridePath, "utf8");
  }
  return readFileSync(resolve(templateDir, filename), "utf8");
}
