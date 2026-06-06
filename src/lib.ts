import {
  createTypeSpecLibrary,
  paramMessage,
  type JSONSchemaType,
} from "@typespec/compiler";

export type OutputFormat = "azure-devops" | "github" | "docfx";

export type TemplateName =
  | "overview"
  | "operation"
  | "type"
  | "enum"
  | "service-index"
  | "operations-index"
  | "types-index"
  | "docfx-project";

export type TemplateOverrides = Partial<Record<TemplateName, string>>;

export interface ApiDocsEmitterOptions {
  "api-name"?: string;
  "clean-output-dir"?: boolean;
  "docfx-theme"?: string[];
  "emit-project-files"?: boolean;
  "emit-relation-diagram"?: boolean;
  "emitter-output-dir"?: string;
  format?: OutputFormat;
  "overwrite-project-files"?: boolean;
  "page-title-prefix"?: string;
  "render-service-index"?: boolean;
  "route-prefix"?: string;
  templates?: TemplateOverrides;
}

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

export const $lib = createTypeSpecLibrary({
  name: "tsp-api-docs",
  diagnostics: {
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

export const { reportDiagnostic, createDiagnostic } = $lib;
