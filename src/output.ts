import { readdir, rm } from "node:fs/promises";
import { resolvePath } from "@typespec/compiler";
import type { OutputFormat } from "./lib.js";
import type { OverviewPageModel, ServiceEntry } from "./service-entry.js";

/**
 * Template data model for the per-service operations index page.
 * Used by the `operations-index.md.hbs` Handlebars template.
 */
export interface OperationsIndexModel {
  /** Section heading, typically `"Operations"`. */
  title: string;
  /** Rows for the operations table, one entry per operation. */
  operations: Array<{
    /** Operation name as declared in the TypeSpec source. */
    name: string;
    /** Label of the containing interface or `"Service"`. */
    containerLabel: string;
    /** Markdown type reference string for the return type. */
    returnType: string;
    /** Short description, falling back to {@link FALLBACK_SUMMARY}. */
    summaryOrFallback: string;
    /** Relative path to the operation's documentation page. */
    path: string;
  }>;
}

/**
 * Template data model for the per-service types index page.
 * Used by the `types-index.md.hbs` Handlebars template.
 */
export interface TypesIndexModel {
  /** Section heading, typically `"Types"`. */
  title: string;
  /** Rows for the types table, one entry per type. */
  types: Array<{
    /** Type name as declared in the TypeSpec source. */
    name: string;
    /** TypeSpec kind string: `"Model"`, `"Enum"`, `"Union"`, or `"Scalar"`. */
    kind: string;
    /** Short description, falling back to {@link FALLBACK_SUMMARY}. */
    summaryOrFallback: string;
    /** Relative path to the type's documentation page. */
    path: string;
  }>;
}

/**
 * Returns the overview page file name for a given output format.
 *
 * - `"github"` → `"README.md"` (GitHub renders `README.md` as the folder index).
 * - `"docfx"` → `"index.md"` (DocFx convention).
 * - `"azure-devops"` (default) → `"<slug>.md"` (ADO Wiki names pages by file stem).
 *
 * @param slug - The service slug, used for the azure-devops filename.
 * @param format - The output format.
 */
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

/**
 * Returns the root index file name for a given output format.
 *
 * - `"docfx"` → `"index.md"`.
 * - `"azure-devops"` / `"github"` → `"README.md"`.
 *
 * @param format - The output format.
 */
export function rootIndexFileName(format: OutputFormat): string {
  switch (format) {
    case "docfx":
      return "index.md";
    default:
      return "README.md"; // azure-devops, github
  }
}

/**
 * Builds the {@link OperationsIndexModel} for a service.
 *
 * Path adjustment: azure-devops index pages sit in the same folder as the
 * `api/` sub-folder so no prefix is needed; github/docfx index pages sit
 * inside the `api/` folder so the `"api/"` prefix is stripped.
 *
 * @param service - The service entry to build the model from.
 * @param format - The output format, controls path adjustment.
 */
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

/**
 * Builds the {@link TypesIndexModel} for a service.
 *
 * Path adjustment mirrors {@link buildOperationsIndexModel}: azure-devops keeps
 * the `"resources/"` prefix; github/docfx strip it.
 *
 * @param service - The service entry to build the model from.
 * @param format - The output format, controls path adjustment.
 */
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
 *
 * @param overview - The original overview page model.
 * @param slug - The service slug used as the folder prefix.
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
      summary: op.summary
        ? prefixRelativeMarkdownLinks(op.summary, slug)
        : op.summary,
      summaryOrFallback: prefixRelativeMarkdownLinks(
        op.summaryOrFallback,
        slug,
      ),
    })),
    types: overview.types.map((t) => ({
      ...t,
      path: `${slug}/${t.path}`,
      summary: t.summary
        ? prefixRelativeMarkdownLinks(t.summary, slug)
        : t.summary,
      summaryOrFallback: prefixRelativeMarkdownLinks(t.summaryOrFallback, slug),
    })),
  };
}

/**
 * Prefixes all relative Markdown link hrefs in a string with the given prefix.
 * Absolute URLs, absolute paths, and anchors are left unchanged.
 *
 * @param text - A Markdown string that may contain `[label](href)` links.
 * @param prefix - The folder prefix to prepend to relative hrefs.
 */
function prefixRelativeMarkdownLinks(text: string, prefix: string): string {
  return text.replace(/\]\(([^)]+)\)/g, (_, href) => {
    if (/^[a-z]+:\/\/|^\/|^#/.test(href)) {
      return `](${href})`;
    }
    return `](${prefix}/${href})`;
  });
}

/** Wraps a YAML scalar value in double quotes, escaping any internal double quotes. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Builds the YAML content of a per-service `toc.yml` file for DocFx.
 *
 * The table of contents always starts with an Overview entry, optionally
 * followed by a Relation Diagram entry, then nested API and Resources sections.
 *
 * @param service - The service entry to build the TOC for.
 * @param includeRelationDiagram - When `true`, adds a "Relation Diagram" entry.
 * @returns The complete `toc.yml` file content as a string.
 */
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
      lines.push(`  - name: ${yamlString(op.page.title)}`);
      lines.push(`    href: api/${op.slug}.md`);
    }
  }
  if (service.types.length > 0) {
    lines.push(`- name: Resources`);
    lines.push(`  items:`);
    for (const type of service.types) {
      lines.push(`  - name: ${yamlString(type.page.title)}`);
      lines.push(`    href: resources/${type.slug}.md`);
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * Builds the YAML content of the root `toc.yml` for a DocFx site.
 *
 * Non-versioned services are listed directly in the TOC.
 * Versioned services are grouped by base name under a "Versions" entry,
 * with each version listed using only the version number as the display name.
 *
 * @param nonVersionedServices - Non-versioned service entries to render as a flat list.
 * @param versionedServices - Versioned services grouped by base name and version.
 * @returns The complete root `toc.yml` file content as a string.
 */
export function buildDocFxRootTocContent(
  nonVersionedServices: Array<{ title: string; path: string }>,
  versionedServices: Array<{
    name: string;
    versions: Array<{ title: string; path: string; version: string }>;
  }>,
): string {
  const lines: string[] = [];

  // Add non-versioned services first
  for (const service of nonVersionedServices) {
    lines.push(`- name: ${yamlString(service.title)}`);
    lines.push(`  href: ${service.path}`);
  }

  // Add versioned services grouped under "Versions" if there are any
  if (versionedServices.length > 0) {
    lines.push(`- name: Versions`);
    lines.push(`  items:`);

    for (const group of versionedServices) {
      lines.push(`  - name: ${yamlString(group.name)}`);
      lines.push(`    items:`);
      for (const version of group.versions) {
        lines.push(`    - name: ${yamlString(version.version)}`);
        lines.push(`      href: ${version.path}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Returns the set of project-level file names that should be preserved during
 * an output directory clean (i.e. files that are not regenerated on every run).
 *
 * For `docfx`, this is `["docfx.json"]` — the project config should survive
 * a clean so manual edits are not lost. All other formats have no protected files.
 *
 * @param format - The output format.
 */
export function getProjectFileNames(format: OutputFormat): string[] {
  switch (format) {
    case "docfx":
      return ["docfx.json"];
    default:
      return [];
  }
}

/**
 * Deletes previously generated documentation files from `outputDir`, preserving
 * any format-specific project files returned by {@link getProjectFileNames}.
 *
 * When there are no protected files (non-DocFx formats), the entire directory
 * is deleted recursively. For DocFx, each top-level entry is deleted individually
 * unless its name is in the protected set.
 *
 * Silently ignores `ENOENT` (directory does not exist yet); all other errors are
 * rethrown so permission problems and I/O failures are visible.
 *
 * @param outputDir - Absolute path to the emitter output directory.
 * @param format - The output format, determines which files are preserved.
 */
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
    await Promise.all(
      entries
        .filter((entry) => !projectFiles.has(entry.name))
        .map((entry) =>
          rm(resolvePath(outputDir, entry.name), {
            recursive: true,
            force: true,
          }),
        ),
    );
  } catch (err) {
    // Ignore only ENOENT (directory doesn't exist yet); rethrow everything else
    // so permission errors and transient IO failures are not silently swallowed.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
