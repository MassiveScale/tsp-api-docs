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

const Handlebars =
  "default" in HandlebarsModule
    ? (HandlebarsModule.default as typeof HandlebarsModule)
    : HandlebarsModule;

Handlebars.registerHelper("join", (values: string[], separator: string) =>
  values.join(separator),
);
Handlebars.registerHelper("mdCell", (value: unknown) =>
  escapeMarkdownCell(String(value ?? "")),
);

interface VersionedServiceIndexEntry extends RenderedDoc {
  version: string;
}

interface VersionedServiceGroup {
  name: string;
  versions: VersionedServiceIndexEntry[];
}

interface ServiceIndexModel {
  services: Array<RenderedDoc>;
  versionedServices: VersionedServiceGroup[];
}

function compileTemplate<T>(source: string): Handlebars.TemplateDelegate<T> {
  return Handlebars.compile<T>(source, { noEscape: true });
}

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

export async function $onEmit(context: EmitContext<ApiDocsEmitterOptions>) {
  const program = context.program;
  const format: OutputFormat = context.options["format"] ?? "azure-devops";
  const apiName = context.options["api-name"];
  const emitProjectFiles = context.options["emit-project-files"] ?? true;
  const overwriteProjectFiles =
    context.options["overwrite-project-files"] ?? false;
  const docfxThemes = context.options["docfx-theme"] ?? ["default", "modern"];
  const emitRelationDiagram = context.options["emit-relation-diagram"] ?? false;

  const templateOverrides = resolveTemplateOverrides(
    context.options["templates"],
  );
  let templates;
  try {
    templates = loadTemplates(templateOverrides);
  } catch (err) {
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
  const renderDocFxProject = compileTemplate<{ themes: string[] }>(
    templates.docfxProject,
  );

  function renderServiceIndex(model: ServiceIndexModel): string {
    return prettifyMarkdown(markdownIndex(model));
  }
  function renderOverview(model: OverviewPageModel): string {
    return prettifyMarkdown(markdownOverview(model));
  }
  function renderOperation(model: OperationPageModel): string {
    return prettifyMarkdown(markdownOperation(model));
  }
  function renderType(model: TypePageModel): string {
    const template = model.kind === "Enum" ? markdownEnum : markdownType;
    return prettifyMarkdown(template(model));
  }
  function renderOperationsIndex(model: OperationsIndexModel): string {
    return prettifyMarkdown(markdownOperationsIndex(model));
  }
  function renderTypesIndex(model: TypesIndexModel): string {
    return prettifyMarkdown(markdownTypesIndex(model));
  }

  if (context.options["clean-output-dir"] ?? true) {
    const outputDir = resolvePath(process.cwd(), context.emitterOutputDir);
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
      const allServiceLinks = [
        ...nonVersionedServices,
        ...versionedServices.flatMap((g) => g.versions),
      ];
      await emitFile(program, {
        path: resolvePath(context.emitterOutputDir, "toc.yml"),
        content: buildDocFxRootTocContent(allServiceLinks),
      });
    }
  }

  if (format === "docfx" && emitProjectFiles) {
    const docfxJsonPath = resolvePath(context.emitterOutputDir, "docfx.json");
    if (overwriteProjectFiles || !existsSync(docfxJsonPath)) {
      await emitFile(program, {
        path: docfxJsonPath,
        content: renderDocFxProject({ themes: docfxThemes }),
      });
    }
  }

  for (const service of serviceEntries) {
    const baseDir = resolvePath(context.emitterOutputDir, service.slug);

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
