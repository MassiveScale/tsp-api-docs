import { createTypeSpecLibrary, type JSONSchemaType } from "@typespec/compiler";

export interface ApiDocsEmitterOptions {
  "emitter-output-dir"?: string;
  "page-title-prefix"?: string;
  "render-service-index"?: boolean;
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
