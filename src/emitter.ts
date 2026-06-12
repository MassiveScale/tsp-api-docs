import {
  type EmitContext,
  emitFile,
  NoTarget,
  resolvePath,
} from "@typespec/compiler";
import { existsSync } from "node:fs";
import * as HandlebarsModule from "handlebars";
import type {
  ApiDocsEmitterOptions,
  OutputFormat,
  TemplateOverrides,
} from "./lib.js";
import { reportDiagnostic } from "./lib.js";
import { loadTemplates } from "./templates.js";
import {
  escapeMarkdownCell,
  FALLBACK_SUMMARY,
  prettifyMarkdown,
} from "./utils.js";
import { getServiceEntries } from "./service-entry.js";
import type { OverviewPageModel, RenderedDoc } from "./service-entry.js";
import type { OperationPageModel } from "./operation-page.js";
import type { TypePageModel } from "./type-page.js";
import {
  adjustOverviewPathsForAzureDevOps,
  buildDocFxRootTocContent,
  buildDocFxServiceTocContent,
  buildOperationsIndexModel,
  buildTypesIndexModel,
  cleanDocFiles,
  overviewFileName,
  rootIndexFileName,
  type OperationsIndexModel,
  type TypesIndexModel,
} from "./output.js";
import { buildRelationDiagram } from "./relation-diagram.js";

// Handlebars ships both ESM and CJS builds. In some module environments the
// default export is nested under a `.default` property; this normalizes both.
const Handlebars =
  "default" in HandlebarsModule
    ? (HandlebarsModule.default as typeof HandlebarsModule)
    : HandlebarsModule;

// Register shared Handlebars helpers used by multiple templates.
Handlebars.registerHelper("join", (values: string[], separator: string) =>
  values.join(separator),
);
Handlebars.registerHelper("mdCell", (value: unknown) =>
  escapeMarkdownCell(String(value ?? "")),
);

/**
 * One versioned service entry in the root service index.
 * Extends {@link RenderedDoc} with the version string for the index grouping logic.
 */
interface VersionedServiceIndexEntry extends RenderedDoc {
  /** The version string (e.g. `"v1.0"`) used to sort within the group. */
  version: string;
}

/**
 * A group of versioned entries that share the same base API name.
 * Used in the root service index to render expandable version lists.
 */
interface VersionedServiceGroup {
  /** The base API name common to all versions in this group. */
  name: string;
  /** All version entries in this group, sorted ascending by version. */
  versions: VersionedServiceIndexEntry[];
}

/**
 * The data model passed to the `service-index.md.hbs` Handlebars template.
 * Separates non-versioned services from grouped versioned services so the
 * template can render them in different sections.
 */
interface ServiceIndexModel {
  /** Non-versioned service entries to render as a flat list. */
  services: Array<RenderedDoc>;
  /** Versioned services grouped by base name and sorted by version. */
  versionedServices: VersionedServiceGroup[];
}

/**
 * Compiles a Handlebars template source string with `noEscape: true`.
 *
 * HTML escaping is disabled because our output is Markdown, not HTML, and
 * escaping would corrupt type reference strings that contain characters like `<`.
 *
 * @param source - The raw Handlebars template source text.
 * @returns A compiled Handlebars template delegate.
 */
function compileTemplate<T>(source: string): Handlebars.TemplateDelegate<T> {
  return Handlebars.compile<T>(source, { noEscape: true });
}

/**
 * Resolves each template override path relative to `process.cwd()`.
 *
 * Paths in `tspconfig.yaml` are typically project-relative. This ensures they
 * are resolved to absolute paths before being passed to `loadTemplates`.
 *
 * @param rawOverrides - The raw template override map from emitter options.
 * @returns A new override map with all paths resolved to absolute paths.
 */
function resolveTemplateOverrides(
  rawOverrides?: TemplateOverrides,
): TemplateOverrides {
  if (!rawOverrides) return {};
  const resolved: TemplateOverrides = {};
  for (const [key, value] of Object.entries(rawOverrides) as [
    keyof TemplateOverrides,
    string,
  ][]) {
    if (value) {
      resolved[key] = resolvePath(process.cwd(), value);
    }
  }
  return resolved;
}

/**
 * The TypeSpec emitter entry point, invoked by the compiler after type-checking.
 *
 * This function orchestrates the entire documentation generation pipeline:
 * 1. Resolves emitter options and loads Handlebars templates.
 * 2. Optionally cleans the output directory.
 * 3. Collects all service entries (including versioned snapshots).
 * 4. Optionally emits a root service index page and DocFx root `toc.yml`.
 * 5. For each service: emits overview, operations index, types index,
 *    per-operation pages, per-type pages, DocFx `toc.yml`, and optionally a
 *    Mermaid relation diagram.
 *
 * @param context - The TypeSpec emit context, carrying the program, options,
 *   and the resolved emitter output directory.
 */
export async function $onEmit(context: EmitContext<ApiDocsEmitterOptions>) {
  const program = context.program;
  const format: OutputFormat = context.options["format"] ?? "azure-devops";
  const apiName = context.options["api-name"];
  const emitProjectFiles = context.options["emit-project-files"] ?? true;
  const overwriteProjectFiles =
    context.options["overwrite-project-files"] ?? false;
  const docfx = context.options.docfx;
  const docfxThemes = docfx?.theme ?? ["default", "modern"];
  const docfxAppName = docfx?.["app-name"] ?? apiName ?? "API";
  const docfxAppTitle = docfx?.["app-title"] ?? apiName ?? "API";
  const docfxEnablePdf = docfx?.["enable-pdf"] ?? true;
  const docfxEnablePdfTocPage = docfx?.["enable-pdf-toc-page"] ?? true;
  const docfxEmitJson = docfx?.["emit-json"] ?? true;
  const emitRelationDiagram = context.options["emit-relation-diagram"] ?? false;

  const templateOverrides = resolveTemplateOverrides(
    context.options["templates"],
  );
  let templates;
  try {
    templates = loadTemplates(templateOverrides);
  } catch (err) {
    // Map the load error back to the override key that caused it, so the
    // diagnostic message can name both the template key and the bad path.
    const failedEntry = Object.entries(templateOverrides).find(([, path]) => {
      try {
        return err instanceof Error && err.message.includes(path);
      } catch {
        return false;
      }
    });
    reportDiagnostic(program, {
      code: "template-load-failed",
      target: NoTarget,
      format: {
        name: failedEntry?.[0] ?? "unknown",
        path: failedEntry?.[1] ?? "",
        reason: err instanceof Error ? err.message : String(err),
      },
    });
    return;
  }

  // Compile all eight templates once up-front to catch syntax errors early.
  const markdownOverview = compileTemplate<OverviewPageModel>(
    templates.overview,
  );
  const markdownOperation = compileTemplate<OperationPageModel>(
    templates.operation,
  );
  const markdownType = compileTemplate<TypePageModel>(templates.type);
  const markdownEnum = compileTemplate<TypePageModel>(templates.enum);
  const markdownIndex = compileTemplate<ServiceIndexModel>(
    templates.serviceIndex,
  );
  const markdownOperationsIndex = compileTemplate<OperationsIndexModel>(
    templates.operationsIndex,
  );
  const markdownTypesIndex = compileTemplate<TypesIndexModel>(
    templates.typesIndex,
  );
  const renderDocFxProject = compileTemplate<{
    themes: string[];
    appName: string;
    appTitle: string;
    enablePdf: boolean;
    enablePdfTocPage: boolean;
  }>(templates.docfxProject);

  /** Renders the root service index and prettifies the resulting Markdown. */
  function renderServiceIndex(model: ServiceIndexModel): string {
    return prettifyMarkdown(markdownIndex(model));
  }
  /** Renders an overview page and prettifies the resulting Markdown. */
  function renderOverview(model: OverviewPageModel): string {
    return prettifyMarkdown(markdownOverview(model));
  }
  /** Renders an operation page and prettifies the resulting Markdown. */
  function renderOperation(model: OperationPageModel): string {
    return prettifyMarkdown(markdownOperation(model));
  }
  /** Renders a type page (Model/Union/Scalar uses `type.hbs`; Enum uses `enum.hbs`). */
  function renderType(model: TypePageModel): string {
    const template = model.kind === "Enum" ? markdownEnum : markdownType;
    return prettifyMarkdown(template(model));
  }
  /** Renders an operations index page and prettifies the resulting Markdown. */
  function renderOperationsIndex(model: OperationsIndexModel): string {
    return prettifyMarkdown(markdownOperationsIndex(model));
  }
  /** Renders a types index page and prettifies the resulting Markdown. */
  function renderTypesIndex(model: TypesIndexModel): string {
    return prettifyMarkdown(markdownTypesIndex(model));
  }

  if (context.options["clean-output-dir"] ?? true) {
    const outputDir = resolvePath(process.cwd(), context.emitterOutputDir);
    // Safety guard: refuse to delete the working directory or filesystem root.
    if (outputDir === process.cwd() || outputDir === "/") {
      throw new Error(
        `Refusing to delete unsafe output directory: ${outputDir}`,
      );
    }
    await cleanDocFiles(outputDir, format);
  }

  const routePrefix = context.options["route-prefix"] ?? "api/{version}";
  const serviceEntries = getServiceEntries(
    program,
    context.options["page-title-prefix"],
    apiName,
    routePrefix,
  );

  if (context.options["render-service-index"] === true) {
    const nonVersionedServices = serviceEntries
      .filter((service) => service.versionValue === undefined)
      .map((service) => ({
        title: service.overview.title,
        summary: service.overview.summary,
        summaryOrFallback: service.overview.summary ?? FALLBACK_SUMMARY,
        path:
          format === "azure-devops"
            ? overviewFileName(service.slug, format)
            : `${service.slug}/${overviewFileName(service.slug, format)}`,
      }));

    const versionedServices = [
      ...serviceEntries
        .filter((service) => service.versionValue !== undefined)
        .reduce((groups, service) => {
          const key = service.baseLabel;
          const current = groups.get(key) ?? [];
          current.push({
            title: service.overview.title,
            summary: service.overview.summary,
            summaryOrFallback: service.overview.summary ?? FALLBACK_SUMMARY,
            path:
              format === "azure-devops"
                ? overviewFileName(service.slug, format)
                : `${service.slug}/${overviewFileName(service.slug, format)}`,
            version: service.versionValue!,
          });
          groups.set(key, current);
          return groups;
        }, new Map<string, VersionedServiceIndexEntry[]>()),
    ]
      .map(([name, versions]) => ({
        name,
        versions: versions.sort((left, right) =>
          left.version.localeCompare(right.version, undefined, {
            numeric: true,
          }),
        ),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const rootIndexFile = rootIndexFileName(format);
    await emitFile(program, {
      path: resolvePath(context.emitterOutputDir, rootIndexFile),
      content: renderServiceIndex({
        services: nonVersionedServices,
        versionedServices,
      }),
    });

    if (format === "docfx") {
      await emitFile(program, {
        path: resolvePath(context.emitterOutputDir, "toc.yml"),
        content: buildDocFxRootTocContent(
          nonVersionedServices,
          versionedServices,
        ),
      });
    }
  }

  if (format === "docfx" && emitProjectFiles && docfxEmitJson) {
    const docfxJsonPath = resolvePath(context.emitterOutputDir, "docfx.json");
    if (overwriteProjectFiles || !existsSync(docfxJsonPath)) {
      await emitFile(program, {
        path: docfxJsonPath,
        content: renderDocFxProject({
          themes: docfxThemes,
          appName: JSON.stringify(docfxAppName),
          appTitle: JSON.stringify(docfxAppTitle),
          enablePdf: docfxEnablePdf,
          enablePdfTocPage: docfxEnablePdfTocPage,
        }),
      });
    }
  }

  for (const service of serviceEntries) {
    const baseDir = resolvePath(context.emitterOutputDir, service.slug);

    // azure-devops: overview pages sit one level above the service folder.
    // github/docfx: overview pages sit inside the service folder.
    const overviewPath =
      format === "azure-devops"
        ? resolvePath(
            context.emitterOutputDir,
            overviewFileName(service.slug, format),
          )
        : resolvePath(baseDir, overviewFileName(service.slug, format));
    const overviewModel =
      format === "azure-devops"
        ? adjustOverviewPathsForAzureDevOps(service.overview, service.slug)
        : service.overview;
    await emitFile(program, {
      path: overviewPath,
      content: renderOverview(overviewModel),
    });

    if (format === "azure-devops" || format === "github") {
      if (service.operations.length > 0) {
        const opsIndexPath =
          format === "azure-devops"
            ? resolvePath(baseDir, "api.md")
            : resolvePath(baseDir, "api", "README.md");
        await emitFile(program, {
          path: opsIndexPath,
          content: renderOperationsIndex(
            buildOperationsIndexModel(service, format),
          ),
        });
      }

      if (service.types.length > 0) {
        const typesIndexPath =
          format === "azure-devops"
            ? resolvePath(baseDir, "resources.md")
            : resolvePath(baseDir, "resources", "README.md");
        await emitFile(program, {
          path: typesIndexPath,
          content: renderTypesIndex(buildTypesIndexModel(service, format)),
        });
      }
    }

    if (format === "docfx") {
      await emitFile(program, {
        path: resolvePath(baseDir, "toc.yml"),
        content: buildDocFxServiceTocContent(service, emitRelationDiagram),
      });
    }

    if (emitRelationDiagram) {
      await emitFile(program, {
        path: resolvePath(baseDir, "relation-diagram.md"),
        content: buildRelationDiagram(program, service, format),
      });
    }

    for (const operationPage of service.operations) {
      await emitFile(program, {
        path: resolvePath(baseDir, "api", `${operationPage.slug}.md`),
        content: renderOperation(operationPage.page),
      });
    }

    for (const typePage of service.types) {
      await emitFile(program, {
        path: resolvePath(baseDir, "resources", `${typePage.slug}.md`),
        content: renderType(typePage.page),
      });
    }
  }
}
