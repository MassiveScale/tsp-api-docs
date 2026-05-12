import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const templateDir = resolveTemplateDir();

export const overviewMarkdownTemplate = loadTemplate("overview.md.hbs");
export const operationMarkdownTemplate = loadTemplate("operation.md.hbs");
export const typeMarkdownTemplate = loadTemplate("type.md.hbs");
export const enumMarkdownTemplate = loadTemplate("enum.md.hbs");
export const serviceIndexMarkdownTemplate = loadTemplate("service-index.md.hbs");
export const operationsIndexMarkdownTemplate = loadTemplate("operations-index.md.hbs");
export const typesIndexMarkdownTemplate = loadTemplate("types-index.md.hbs");

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

  throw new Error("Could not find templates directory for tsp-api-docs emitter.");
}

function loadTemplate(name: string): string {
  return readFileSync(resolve(templateDir, name), "utf8");
}
