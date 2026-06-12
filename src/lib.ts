import {
  createTypeSpecLibrary,
  paramMessage,
  type JSONSchemaType,
} from "@typespec/compiler";

/** The three output formats the emitter can produce. */
export type OutputFormat = "azure-devops" | "github" | "docfx";

/**
 * The key names for the eight built-in Handlebars templates.
 * Each key maps to the corresponding `.hbs` file under `templates/`.
 */
export type TemplateName =
  | "overview"
  | "operation"
  | "type"
  | "enum"
  | "service-index"
  | "operations-index"
  | "types-index"
  | "docfx-project";

/**
 * A partial map of {@link TemplateName} keys to absolute file-system paths.
 * Any key present overrides the built-in template; omitted keys fall back to
 * the built-in defaults loaded from the `templates/` directory.
 */
export type TemplateOverrides = Partial<Record<TemplateName, string>>;

/**
 * All configuration options exposed by the emitter in `tspconfig.yaml`.
 * Every field is optional; the emitter applies documented defaults when a
 * field is absent.
 */
export interface ApiDocsEmitterOptions {
  /**
   * Optional API name prefix used to build file/folder slugs.
   * For non-versioned services the slug is derived directly from this value;
   * for versioned services it is combined with the version (e.g. `"My API v1.0"`).
   */
  "api-name"?: string;

  /**
   * When `true` (default), the emitter deletes previously generated files
   * from `emitter-output-dir` before writing new output.
   * For the `docfx` format only non-project files are removed so that
   * `docfx.json` is preserved across runs.
   */
  "clean-output-dir"?: boolean;

  /**
   * DocFx template names applied to the `build.template` array in the
   * generated `docfx.json`. Defaults to `["default", "modern"]`.
   * Only meaningful when `format` is `"docfx"`.
   */
  "docfx-theme"?: string[];

  /**
   * When `true` (default), the emitter writes project/configuration files
   * such as `docfx.json`. Set to `false` to emit documentation files only.
   */
  "emit-project-files"?: boolean;

  /**
   * When `true`, the emitter writes a `relation-diagram.md` Mermaid ER
   * diagram alongside each service's documentation.
   */
  "emit-relation-diagram"?: boolean;

  /**
   * Root directory for all emitted files.
   * Resolved relative to the working directory where `tsp compile` is run.
   * Defaults to `./tsp-output`.
   */
  "emitter-output-dir"?: string;

  /**
   * The output format to use. Controls folder structure and index page names.
   * - `"azure-devops"` — index pages sit beside their folders (ADO Wiki convention).
   * - `"github"` — index pages are `README.md` inside each folder.
   * - `"docfx"` — index pages are `index.md` with an accompanying `toc.yml`.
   */
  format?: OutputFormat;

  /**
   * When `false` (default), project files (e.g. `docfx.json`) are only
   * written if they do not already exist on disk.
   * Set to `true` to always overwrite them.
   */
  "overwrite-project-files"?: boolean;

  /**
   * Fallback title prefix used when the TypeSpec service has no explicit title.
   * Has no effect when a `@service` title is present.
   */
  "page-title-prefix"?: string;

  /**
   * When `true`, the emitter writes a root index page listing all services.
   * The page name depends on `format` (`README.md`, `index.md`, etc.).
   */
  "render-service-index"?: boolean;

  /**
   * Prefix prepended to HTTP request paths on operation pages.
   * Supports a `{version}` token substituted with the API version string.
   * Defaults to `"api/{version}"`. Set to `""` for bare paths.
   */
  "route-prefix"?: string;

  /**
   * Per-template path overrides. Any key present replaces the corresponding
   * built-in `.hbs` file. Paths are resolved relative to `process.cwd()`.
   */
  templates?: TemplateOverrides;
}

/** JSON Schema used by the TypeSpec compiler to validate emitter options. */
const optionsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    "api-name": {
      type: "string",
      nullable: true,
    },
    "clean-output-dir": {
      type: "boolean",
      nullable: true,
    },
    "docfx-theme": {
      type: "array",
      items: { type: "string" },
      nullable: true,
    },
    "emit-project-files": {
      type: "boolean",
      nullable: true,
    },
    "emit-relation-diagram": {
      type: "boolean",
      nullable: true,
    },
    "emitter-output-dir": {
      type: "string",
      nullable: true,
    },
    format: {
      type: "string",
      enum: ["azure-devops", "github", "docfx"],
      nullable: true,
    },
    "overwrite-project-files": {
      type: "boolean",
      nullable: true,
    },
    "page-title-prefix": {
      type: "string",
      nullable: true,
    },
    "render-service-index": {
      type: "boolean",
      nullable: true,
    },
    "route-prefix": {
      type: "string",
      nullable: true,
    },
    templates: {
      type: "object",
      additionalProperties: false,
      nullable: true,
      properties: {
        overview: { type: "string", nullable: true },
        operation: { type: "string", nullable: true },
        type: { type: "string", nullable: true },
        enum: { type: "string", nullable: true },
        "service-index": { type: "string", nullable: true },
        "operations-index": { type: "string", nullable: true },
        "types-index": { type: "string", nullable: true },
        "docfx-project": { type: "string", nullable: true },
      },
      required: [],
    },
  },
  required: [],
} as unknown as JSONSchemaType<ApiDocsEmitterOptions>;

/**
 * The TypeSpec library registration for `tsp-api-docs`.
 * Registers the emitter's option schema and its diagnostic codes with the
 * TypeSpec compiler so that validation and error reporting work correctly.
 */
export const $lib = createTypeSpecLibrary({
  name: "tsp-api-docs",
  diagnostics: {
    /** Emitted when a custom template path cannot be read at startup. */
    "template-load-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to load custom template "${"name"}" from "${"path"}": ${"reason"}`,
      },
    },
  },
  emitter: {
    options: optionsSchema,
  },
} as const);

/** Convenience re-exports from `$lib` for raising diagnostics inside the emitter. */
export const { reportDiagnostic, createDiagnostic } = $lib;
