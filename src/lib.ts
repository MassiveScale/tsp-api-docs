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
  | "types-index";

export type TemplateOverrides = Partial<Record<TemplateName, string>>;

export interface ApiDocsEmitterOptions {
  "emitter-output-dir"?: string;
  "page-title-prefix"?: string;
  "render-service-index"?: boolean;
  format?: OutputFormat;
  "api-name"?: string;
  "route-prefix"?: string;
  templates?: TemplateOverrides;
}

const optionsSchema: JSONSchemaType<ApiDocsEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "emitter-output-dir": {
      type: "string",
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
    format: {
      type: "string",
      enum: ["azure-devops", "github", "docfx"],
      nullable: true,
    },
    "api-name": {
      type: "string",
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
      },
      required: [],
    } as any,
  },
  required: [],
};

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
