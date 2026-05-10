import { createTypeSpecLibrary, type JSONSchemaType } from "@typespec/compiler";

export type OutputFormat = "azure-devops" | "github" | "docfx";

export interface ApiDocsEmitterOptions {
  "emitter-output-dir"?: string;
  "page-title-prefix"?: string;
  "render-service-index"?: boolean;
  "format"?: OutputFormat;
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
    "format": {
      type: "string",
      enum: ["azure-devops", "github", "docfx"],
      nullable: true,
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "tsp-api-docs",
  diagnostics: {},
  emitter: {
    options: optionsSchema,
  },
} as const);

export const { reportDiagnostic, createDiagnostic } = $lib;
