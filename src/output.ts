import { readdir, rm } from "node:fs/promises";
import { resolvePath } from "@typespec/compiler";
import type { OutputFormat } from "./lib.js";
import type { OverviewPageModel, ServiceEntry } from "./service-entry.js";

export interface OperationsIndexModel {
  title: string;
  operations: Array<{
    name: string;
    containerLabel: string;
    returnType: string;
    summaryOrFallback: string;
    path: string;
  }>;
}

export interface TypesIndexModel {
  title: string;
  types: Array<{
    name: string;
    kind: string;
    summaryOrFallback: string;
    path: string;
  }>;
}

export function overviewFileName(slug: string, format: OutputFormat): string {
  switch (format) {
    case "github":
      return "README.md";
    case "docfx":
      return "index.md";
    default:
      return `${slug}.md`; // azure-devops
  }
}

export function rootIndexFileName(format: OutputFormat): string {
  switch (format) {
    case "docfx":
      return "index.md";
    default:
      return "README.md"; // azure-devops, github
  }
}

export function buildOperationsIndexModel(
  service: ServiceEntry,
  format: OutputFormat,
): OperationsIndexModel {
  return {
    title: "Operations",
    operations: service.overview.operations.map((op) => ({
      name: op.name,
      containerLabel: op.containerLabel,
      returnType: op.returnType,
      summaryOrFallback: op.summaryOrFallback,
      path: format === "azure-devops" ? op.path : op.path.replace(/^api\//, ""),
    })),
  };
}

export function buildTypesIndexModel(
  service: ServiceEntry,
  format: OutputFormat,
): TypesIndexModel {
  return {
    title: "Types",
    types: service.overview.types.map((t) => ({
      name: t.name,
      kind: t.kind,
      summaryOrFallback: t.summaryOrFallback,
      path:
        format === "azure-devops" ? t.path : t.path.replace(/^resources\//, ""),
    })),
  };
}

/**
 * Adjusts overview model paths for azure-devops format, where the overview page is
 * emitted one level above the service folder. All relative links must be prefixed
 * with the service slug to remain correct.
 */
export function adjustOverviewPathsForAzureDevOps(
  overview: OverviewPageModel,
  slug: string,
): OverviewPageModel {
  return {
    ...overview,
    operations: overview.operations.map((op) => ({
      ...op,
      path: `${slug}/${op.path}`,
      returnType: prefixRelativeMarkdownLinks(op.returnType, slug),
    })),
    types: overview.types.map((t) => ({
      ...t,
      path: `${slug}/${t.path}`,
    })),
  };
}

/**
 * Prefixes all relative Markdown link hrefs in a string with the given prefix.
 * Absolute URLs, absolute paths, and anchors are left unchanged.
 */
function prefixRelativeMarkdownLinks(text: string, prefix: string): string {
  return text.replace(/\]\(([^)]+)\)/g, (_, href) => {
    if (/^[a-z]+:\/\/|^\/|^#/.test(href)) {
      return `](${href})`;
    }
    return `](${prefix}/${href})`;
  });
}

export function buildDocFxServiceTocContent(
  service: ServiceEntry,
  includeRelationDiagram = false,
): string {
  const lines: string[] = [];
  lines.push(`- name: Overview`);
  lines.push(`  href: index.md`);
  if (includeRelationDiagram) {
    lines.push(`- name: Relation Diagram`);
    lines.push(`  href: relation-diagram.md`);
  }
  if (service.operations.length > 0) {
    lines.push(`- name: API`);
    lines.push(`  items:`);
    for (const op of service.operations) {
      lines.push(`  - name: ${op.page.title}`);
      lines.push(`    href: api/${op.slug}.md`);
    }
  }
  if (service.types.length > 0) {
    lines.push(`- name: Resources`);
    lines.push(`  items:`);
    for (const type of service.types) {
      lines.push(`  - name: ${type.page.title}`);
      lines.push(`    href: resources/${type.slug}.md`);
    }
  }
  return lines.join("\n") + "\n";
}

export function buildDocFxRootTocContent(
  services: Array<{ title: string; path: string }>,
): string {
  const lines: string[] = [];
  for (const service of services) {
    lines.push(`- name: ${service.title}`);
    lines.push(`  href: ${service.path}`);
  }
  return lines.join("\n") + "\n";
}

export function getProjectFileNames(format: OutputFormat): string[] {
  switch (format) {
    case "docfx":
      return ["docfx.json"];
    default:
      return [];
  }
}

export async function cleanDocFiles(
  outputDir: string,
  format: OutputFormat,
): Promise<void> {
  const projectFiles = new Set(getProjectFileNames(format));
  if (projectFiles.size === 0) {
    await rm(outputDir, { recursive: true, force: true });
    return;
  }
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (projectFiles.has(entry.name)) continue;
      await rm(resolvePath(outputDir, entry.name), {
        recursive: true,
        force: true,
      });
    }
  } catch {
    // Directory doesn't exist yet — nothing to clean.
  }
}
