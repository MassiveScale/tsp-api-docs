import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateOverrides } from "./lib.js";

const templateDir = resolveTemplateDir();

export interface TemplateBundle {
  overview: string;
  operation: string;
  type: string;
  enum: string;
  serviceIndex: string;
  operationsIndex: string;
  typesIndex: string;
  docfxProject: string;
}

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

function resolveTemplateDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
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

function loadTemplate(filename: string, overridePath?: string): string {
  if (overridePath) {
    return readFileSync(overridePath, "utf8");
  }
  return readFileSync(resolve(templateDir, filename), "utf8");
}
