import {
  type EmitContext,
  emitFile,
  getDeprecated,
  getDoc,
  getExamples,
  getNamespaceFullName,
  getOpExamples,
  getReturnsDoc,
  getSummary,
  getTypeName,
  isArrayModelType,
  isGlobalNamespace,
  isRecordModelType,
  isTemplateDeclaration,
  listServices,
  resolvePath,
  serializeValueAsJson,
  type Enum,
  type EnumMember,
  type Example,
  type Interface,
  type Model,
  type ModelProperty,
  type Namespace,
  type OpExample,
  type Operation,
  type Program,
  type Scalar,
  type Type,
  type Union,
  type UnionVariant,
  walkPropertiesInherited,
} from "@typespec/compiler";
import { unsafe_mutateSubgraphWithNamespace } from "@typespec/compiler/experimental";
import { getHttpOperation, type HttpOperation, type HttpOperationResponse, type HttpStatusCodeRange } from "@typespec/http";
import { getVersioningMutators, type Version } from "@typespec/versioning";
import * as HandlebarsModule from "handlebars";
import type { ApiDocsEmitterOptions, OutputFormat } from "./lib.js";
import {
  operationMarkdownTemplate,
  operationsIndexMarkdownTemplate,
  overviewMarkdownTemplate,
  serviceIndexMarkdownTemplate,
  typeMarkdownTemplate,
  typesIndexMarkdownTemplate,
} from "./templates.js";

interface RenderedDoc {
  path: string;
  title: string;
  summary?: string;
  summaryOrFallback: string;
}

interface NamespaceSummary extends RenderedDoc {
  name: string;
}

interface OperationSummary extends RenderedDoc {
  name: string;
  containerLabel: string;
  returnType: string;
}

interface TypeSummary extends RenderedDoc {
  name: string;
  kind: string;
}

interface ParameterDoc {
  name: string;
  type: string;
  requiredLabel: string;
  summary?: string;
  summaryOrFallback: string;
}

interface JsonExampleDoc {
  title: string;
  description?: string;
  json: string;
}

interface OperationExampleDoc {
  title: string;
  description?: string;
  request: string;
  response?: string;
}

interface RequestBodyDoc {
  type: string;
  contentTypes: string[];
  description: string;
  jsonExample?: string;
}

interface ResponseDoc {
  statusCode: string;
  type: string;
  description: string;
}

interface HttpParameterDoc {
  name: string;
  type: string;
  requiredLabel: string;
  summary?: string;
  summaryOrFallback: string;
}

interface VariantDoc {
  name: string;
  type: string;
  summary?: string;
  summaryOrFallback: string;
}

interface MemberDoc {
  name: string;
  value: string;
  summary?: string;
  summaryOrFallback: string;
}

interface OperationPageModel {
  title: string;
  summary?: string;
  deprecated?: string;
  versionLabel?: string;
  breadcrumbs: string[];
  httpRequest?: string;
  optionalQueryParameters: HttpParameterDoc[];
  requestHeaders: HttpParameterDoc[];
  signature: string;
  parameters: ParameterDoc[];
  requestBody?: RequestBodyDoc;
  returnType: string;
  responses: ResponseDoc[];
  returnsDoc?: string;
  errorsDoc?: string;
  examples: OperationExampleDoc[];
}

interface TypePageModel {
  title: string;
  summary?: string;
  deprecated?: string;
  versionLabel?: string;
  kind: string;
  breadcrumbs: string[];
  baseType?: string;
  properties: ParameterDoc[];
  methods: OperationSummary[];
  variants: VariantDoc[];
  members: MemberDoc[];
  examples: JsonExampleDoc[];
  jsonRepresentation: string;
}

interface OverviewPageModel {
  title: string;
  summary?: string;
  versionLabel?: string;
  serviceName?: string;
  namespaces: NamespaceSummary[];
  operations: OperationSummary[];
  types: TypeSummary[];
}

interface VersionedServiceIndexEntry extends RenderedDoc {
  version: string;
}

interface VersionedServiceGroup {
  name: string;
  versions: VersionedServiceIndexEntry[];
}

interface OperationsIndexModel {
  title: string;
  operations: Array<{
    name: string;
    containerLabel: string;
    returnType: string;
    summaryOrFallback: string;
    path: string;
  }>;
}

interface TypesIndexModel {
  title: string;
  types: Array<{
    name: string;
    kind: string;
    summaryOrFallback: string;
    path: string;
  }>;
}

interface ServiceIndexModel {
  services: Array<RenderedDoc>;
  versionedServices: VersionedServiceGroup[];
}

const FALLBACK_SUMMARY = "No summary provided.";
const Handlebars =
  "default" in HandlebarsModule
    ? (HandlebarsModule.default as typeof HandlebarsModule)
    : HandlebarsModule;

const markdownOverview = compileTemplate<OverviewPageModel>(overviewMarkdownTemplate);
const markdownOperation = compileTemplate<OperationPageModel>(operationMarkdownTemplate);
const markdownType = compileTemplate<TypePageModel>(typeMarkdownTemplate);
const markdownIndex = compileTemplate<ServiceIndexModel>(serviceIndexMarkdownTemplate);
const markdownOperationsIndex = compileTemplate<OperationsIndexModel>(operationsIndexMarkdownTemplate);
const markdownTypesIndex = compileTemplate<TypesIndexModel>(typesIndexMarkdownTemplate);

Handlebars.registerHelper("join", (values: string[], separator: string) => values.join(separator));
Handlebars.registerHelper("mdCell", (value: unknown) => escapeMarkdownCell(String(value ?? "")));

export async function $onEmit(context: EmitContext<ApiDocsEmitterOptions>) {
  const program = context.program;
  const format: OutputFormat = context.options["format"] ?? "azure-devops";
  const serviceEntries = getServiceEntries(program, context.options["page-title-prefix"]);

  if (context.options["render-service-index"] === true) {
    const nonVersionedServices = serviceEntries
      .filter((service) => service.versionValue === undefined)
      .map((service) => ({
        title: service.overview.title,
        summary: service.overview.summary,
        summaryOrFallback: service.overview.summary ?? FALLBACK_SUMMARY,
        path: `${service.slug}/${overviewFileName(service.slug, format)}`,
      }));

    const versionedServices = [...serviceEntries
      .filter((service) => service.versionValue !== undefined)
      .reduce((groups, service) => {
        const key = service.baseLabel;
        const current = groups.get(key) ?? [];
        current.push({
          title: service.overview.title,
          summary: service.overview.summary,
          summaryOrFallback: service.overview.summary ?? FALLBACK_SUMMARY,
          path: `${service.slug}/${overviewFileName(service.slug, format)}`,
          version: service.versionValue!,
        });
        groups.set(key, current);
        return groups;
      }, new Map<string, VersionedServiceIndexEntry[]>())]
      .map(([name, versions]) => ({
        name,
        versions: versions.sort((left, right) => left.version.localeCompare(right.version, undefined, { numeric: true })),
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

  for (const service of serviceEntries) {
    const baseDir = resolvePath(context.emitterOutputDir, service.slug);

    await emitFile(program, {
      path: resolvePath(baseDir, overviewFileName(service.slug, format)),
      content: renderOverview(service.overview),
    });

    if (format === "azure-devops" || format === "github") {
      const folderIndexName = format === "azure-devops" ? "operations.md" : "README.md";
      if (service.operations.length > 0) {
        await emitFile(program, {
          path: resolvePath(baseDir, "operations", folderIndexName),
          content: renderOperationsIndex(buildOperationsIndexModel(service)),
        });
      }

      const typesIndexName = format === "azure-devops" ? "types.md" : "README.md";
      if (service.types.length > 0) {
        await emitFile(program, {
          path: resolvePath(baseDir, "types", typesIndexName),
          content: renderTypesIndex(buildTypesIndexModel(service)),
        });
      }
    }

    if (format === "docfx") {
      await emitFile(program, {
        path: resolvePath(baseDir, "toc.yml"),
        content: buildDocFxServiceTocContent(service),
      });
    }

    for (const operationPage of service.operations) {
      await emitFile(program, {
        path: resolvePath(baseDir, "operations", `${operationPage.slug}.md`),
        content: renderOperation(operationPage.page),
      });
    }

    for (const typePage of service.types) {
      await emitFile(program, {
        path: resolvePath(baseDir, "types", `${typePage.slug}.md`),
        content: renderType(typePage.page),
      });
    }
  }
}

function compileTemplate<T>(source: string): Handlebars.TemplateDelegate<T> {
  return Handlebars.compile<T>(source, { noEscape: true });
}

function overviewFileName(slug: string, format: OutputFormat): string {
  switch (format) {
    case "github": return "README.md";
    case "docfx": return "index.md";
    default: return `${slug}.md`; // azure-devops
  }
}

function rootIndexFileName(format: OutputFormat): string {
  return format === "github" ? "README.md" : "index.md";
}

function buildOperationsIndexModel(service: ServiceEntry): OperationsIndexModel {
  return {
    title: "Operations",
    operations: service.overview.operations.map((op) => ({
      name: op.name,
      containerLabel: op.containerLabel,
      returnType: op.returnType,
      summaryOrFallback: op.summaryOrFallback,
      path: op.path.replace(/^operations\//, ""),
    })),
  };
}

function buildTypesIndexModel(service: ServiceEntry): TypesIndexModel {
  return {
    title: "Types",
    types: service.overview.types.map((t) => ({
      name: t.name,
      kind: t.kind,
      summaryOrFallback: t.summaryOrFallback,
      path: t.path.replace(/^types\//, ""),
    })),
  };
}

function buildDocFxServiceTocContent(service: ServiceEntry): string {
  const lines: string[] = [];
  lines.push(`- name: Overview`);
  lines.push(`  href: index.md`);
  if (service.operations.length > 0) {
    lines.push(`- name: Operations`);
    lines.push(`  items:`);
    for (const op of service.operations) {
      lines.push(`  - name: ${op.page.title}`);
      lines.push(`    href: operations/${op.slug}.md`);
    }
  }
  if (service.types.length > 0) {
    lines.push(`- name: Types`);
    lines.push(`  items:`);
    for (const type of service.types) {
      lines.push(`  - name: ${type.page.title}`);
      lines.push(`    href: types/${type.slug}.md`);
    }
  }
  return lines.join("\n") + "\n";
}

function buildDocFxRootTocContent(services: Array<{ title: string; path: string }>): string {
  const lines: string[] = [];
  for (const service of services) {
    lines.push(`- name: ${service.title}`);
    lines.push(`  href: ${service.path}`);
  }
  return lines.join("\n") + "\n";
}

function renderServiceIndex(model: ServiceIndexModel): string {
  return markdownIndex(model);
}

function renderOverview(model: OverviewPageModel): string {
  return markdownOverview(model);
}

function renderOperation(model: OperationPageModel): string {
  return markdownOperation(model);
}

function renderType(model: TypePageModel): string {
  return markdownType(model);
}

function renderOperationsIndex(model: OperationsIndexModel): string {
  return markdownOperationsIndex(model);
}

function renderTypesIndex(model: TypesIndexModel): string {
  return markdownTypesIndex(model);
}

function getServiceEntries(program: Program, pageTitlePrefix?: string): ServiceEntry[] {
  const services = listServices(program);
  const serviceTargets =
    services.length > 0
      ? services.map((service) => ({ namespace: service.type, title: service.title }))
      : [{ namespace: program.getGlobalNamespaceType(), title: undefined }];

  return serviceTargets.flatMap(({ namespace, title }) =>
    collectServiceEntriesForNamespace(program, namespace, title, pageTitlePrefix),
  );
}

interface ServiceEntry {
  slug: string;
  baseLabel: string;
  versionValue?: string;
  overview: OverviewPageModel;
  operations: Array<{ slug: string; page: OperationPageModel }>;
  types: Array<{ slug: string; page: TypePageModel }>;
}

function collectServiceEntriesForNamespace(
  program: Program,
  serviceNamespace: Namespace,
  serviceTitle: string | undefined,
  pageTitlePrefix: string | undefined,
): ServiceEntry[] {
  const versioning = getVersioningMutators(program, serviceNamespace);

  if (versioning?.kind === "versioned") {
    return versioning.snapshots.map((snapshot) => {
      const { type } = unsafe_mutateSubgraphWithNamespace(program, [snapshot.mutator], serviceNamespace);
      return collectServiceEntry(
        program,
        type as Namespace,
        serviceTitle,
        pageTitlePrefix,
        snapshot.version,
      );
    });
  }

  return [collectServiceEntry(program, serviceNamespace, serviceTitle, pageTitlePrefix)];
}

function collectServiceEntry(
  program: Program,
  serviceNamespace: Namespace,
  serviceTitle: string | undefined,
  pageTitlePrefix: string | undefined,
  version?: Version,
): ServiceEntry {
  const namespaces = collectNamespaces(serviceNamespace);
  const operations = collectOperations(program, serviceNamespace);
  const types = collectTypes(program, serviceNamespace);
  const baseServiceLabel = describeNamespace(program, serviceNamespace, serviceTitle ?? pageTitlePrefix ?? "API Reference");
  const serviceLabel = version ? `${baseServiceLabel} ${version.value}` : baseServiceLabel;
  const serviceSlug = version ? slugify(version.value) : slugify(serviceLabel);

  const operationPages = operations
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((operation) => {
      const slug = operationFileName(operation.operation);
      return {
        slug,
        page: buildOperationPage(program, operation.operation, version?.value),
      };
    });

  const operationPathById = new Map(operationPages.map((item, index) => [operations[index].id, `operations/${item.slug}.md`]));

  const relatedMethodsByTypeId = buildRelatedMethodsByType(program, types, operations, operationPathById);

  const typePages = types
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((typeEntry) => {
      const slug = toTitleCaseFileName(typeEntry.name);
      return {
        slug,
        page: buildTypePage(program, typeEntry.type, relatedMethodsByTypeId.get(typeEntry.id) ?? [], version?.value),
      };
    });
  const typePathById = new Map(typePages.map((item, index) => [types[index].id, `types/${item.slug}.md`]));

  const overview: OverviewPageModel = {
    title: serviceLabel,
    summary: getSummary(program, serviceNamespace) ?? getDoc(program, serviceNamespace),
    versionLabel: version?.value,
    serviceName: undefined,
    namespaces: namespaces.map((ns) => ({
      name: namespaceName(program, ns),
      title: namespaceName(program, ns),
      summary: getSummary(program, ns) ?? getDoc(program, ns),
      summaryOrFallback: describeSummary(program, ns),
      path: "#",
    })),
    operations: operations.map((entry) => ({
      name: entry.name,
      title: entry.name,
      containerLabel: entry.containerLabel,
      returnType: typeReference(program, entry.operation.returnType),
      summary: getSummary(program, entry.operation) ?? getDoc(program, entry.operation),
      summaryOrFallback: describeSummary(program, entry.operation),
      path: operationPathById.get(entry.id) ?? "#",
    })),
    types: types.map((entry) => ({
      name: entry.name,
      title: entry.name,
      kind: entry.type.kind,
      summary: getSummary(program, entry.type) ?? getDoc(program, entry.type),
      summaryOrFallback: describeSummary(program, entry.type),
      path: typePathById.get(entry.id) ?? "#",
    })),
  };

  return {
    slug: serviceSlug,
    baseLabel: baseServiceLabel,
    versionValue: version?.value,
    overview,
    operations: operationPages,
    types: typePages,
  };
}

function collectNamespaces(serviceNamespace: Namespace): Namespace[] {
  const namespaces: Namespace[] = [];

  for (const namespace of serviceNamespace.namespaces.values()) {
    namespaces.push(namespace);
    namespaces.push(...collectNamespaces(namespace));
  }

  return namespaces;
}

function collectOperations(program: Program, namespace: Namespace): Array<{ id: string; name: string; containerLabel: string; operation: Operation }> {
  const operations: Array<{ id: string; name: string; containerLabel: string; operation: Operation }> = [];

  for (const operation of namespace.operations.values()) {
    if (shouldSkipType(operation)) {
      continue;
    }

    operations.push({
      id: entityId(program, operation),
      name: operation.name,
      containerLabel: containerLabel(program, operation),
      operation,
    });
  }

  for (const iface of namespace.interfaces.values()) {
    operations.push(...collectInterfaceOperations(program, iface));
  }

  for (const child of namespace.namespaces.values()) {
    operations.push(...collectOperations(program, child));
  }

  return dedupeById(operations);
}

function collectInterfaceOperations(program: Program, iface: Interface): Array<{ id: string; name: string; containerLabel: string; operation: Operation }> {
  const operations: Array<{ id: string; name: string; containerLabel: string; operation: Operation }> = [];

  for (const operation of iface.operations.values()) {
    if (shouldSkipType(operation)) {
      continue;
    }

    operations.push({
      id: entityId(program, operation),
      name: operation.name,
      containerLabel: containerLabel(program, operation),
      operation,
    });
  }

  return operations;
}

function collectTypes(program: Program, namespace: Namespace): Array<{ id: string; name: string; type: Model | Enum | Union | Scalar }> {
  const types: Array<{ id: string; name: string; type: Model | Enum | Union | Scalar }> = [];

  for (const model of namespace.models.values()) {
    if (!shouldSkipType(model) && model.name) {
      types.push({ id: entityId(program, model), name: model.name, type: model });
    }
  }

  for (const scalar of namespace.scalars.values()) {
    if (!shouldSkipType(scalar) && scalar.name) {
      types.push({ id: entityId(program, scalar), name: scalar.name, type: scalar });
    }
  }

  for (const enumeration of namespace.enums.values()) {
    if (!shouldSkipType(enumeration) && enumeration.name) {
      types.push({ id: entityId(program, enumeration), name: enumeration.name, type: enumeration });
    }
  }

  for (const union of namespace.unions.values()) {
    if (!shouldSkipType(union) && union.name) {
      types.push({ id: entityId(program, union), name: union.name, type: union });
    }
  }

  for (const child of namespace.namespaces.values()) {
    types.push(...collectTypes(program, child));
  }

  return dedupeById(types);
}

function shouldSkipType(type: Operation | Model | Scalar | Enum | Union): boolean {
  switch (type.kind) {
    case "Operation":
    case "Model":
    case "Scalar":
    case "Union":
      return isTemplateDeclaration(type);
    case "Enum":
      return false;
  }
}

function dedupeById<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    deduped.push(entry);
  }

  return deduped;
}

function buildOperationPage(program: Program, operation: Operation, versionLabel?: string): OperationPageModel {
  const summary = getSummary(program, operation) ?? getDoc(program, operation);
  const httpOperation = resolveHttpOperation(program, operation);

  const operationLabel = operation.interface?.name
    ? `${operation.interface.name} ${operation.name}`
    : operation.name;

  return {
    title: toTitleCaseLabel(operationLabel),
    summary,
    deprecated: getDeprecated(program, operation),
    versionLabel,
    breadcrumbs: breadcrumbsForOperation(program, operation),
    httpRequest: httpOperation ? formatHttpRequest(httpOperation) : undefined,
    optionalQueryParameters: buildQueryParameterDocs(program, httpOperation),
    requestHeaders: buildHeaderDocs(program, httpOperation),
    signature: `${operation.name}(${formatParametersSignature(program, operation.parameters)}) => ${typeReference(program, operation.returnType)}`,
    parameters: modelProperties(program, operation.parameters),
    requestBody: buildRequestBodyDoc(program, httpOperation),
    returnType: typeReference(program, operation.returnType),
    responses: buildResponseDocs(program, operation, httpOperation),
    returnsDoc: getReturnsDoc(program, operation),
    errorsDoc: undefined,
    examples: operationExamples(program, operation, httpOperation),
  };
}

function resolveHttpOperation(program: Program, operation: Operation): HttpOperation | undefined {
  try {
    const [httpOperation, diagnostics] = getHttpOperation(program, operation);
    return diagnostics.length === 0 ? httpOperation : undefined;
  } catch {
    return undefined;
  }
}

function formatHttpRequest(httpOperation: HttpOperation): string {
  return `${httpOperation.verb.toUpperCase()} ${httpOperation.uriTemplate}`;
}

function buildRequestBodyDoc(program: Program, httpOperation: HttpOperation | undefined): RequestBodyDoc | undefined {
  const body = httpOperation?.parameters.body;
  if (!body) {
    return undefined;
  }

  return {
    type: typeReference(program, body.type),
    contentTypes: body.contentTypes.length > 0 ? [...body.contentTypes] : ["application/json"],
    description: `Supply a request body of type \`${typeReference(program, body.type)}\`.`,
    jsonExample: body.bodyKind === "single" ? JSON.stringify(jsonValueForType(program, body.type, new Set<Type>()), null, 2) : undefined,
  };
}

function buildQueryParameterDocs(program: Program, httpOperation: HttpOperation | undefined): HttpParameterDoc[] {
  if (!httpOperation) {
    return [];
  }

  return httpOperation.parameters.parameters
    .filter((parameter) => parameter.type === "query")
    .map((parameter) => ({
      name: parameter.param.name,
      type: typeReference(program, parameter.param.type),
      requiredLabel: parameter.param.optional ? "No" : "Yes",
      summary: getSummary(program, parameter.param) ?? getDoc(program, parameter.param),
      summaryOrFallback: describeSummary(program, parameter.param),
    }));
}

function buildHeaderDocs(program: Program, httpOperation: HttpOperation | undefined): HttpParameterDoc[] {
  if (!httpOperation) {
    return [];
  }

  return httpOperation.parameters.parameters
    .filter((parameter) => parameter.type === "header")
    .map((parameter) => ({
      name: parameter.name,
      type: typeReference(program, parameter.param.type),
      requiredLabel: parameter.param.optional ? "No" : "Yes",
      summary: getSummary(program, parameter.param) ?? getDoc(program, parameter.param),
      summaryOrFallback: describeSummary(program, parameter.param),
    }));
}

function buildResponseDocs(program: Program, operation: Operation, httpOperation: HttpOperation | undefined): ResponseDoc[] {
  if (!httpOperation) {
    return [
      {
        statusCode: "default",
        type: typeReference(program, operation.returnType),
        description: getReturnsDoc(program, operation) ?? `Returns \`${typeReference(program, operation.returnType)}\`.`,
      },
    ];
  }

  return httpOperation.responses.map((response) => ({
    statusCode: formatStatusCode(response.statusCodes),
    type: typeReference(program, response.type),
    description: response.description ?? getSummary(program, response.type) ?? getDoc(program, response.type) ?? FALLBACK_SUMMARY,
  }));
}

function buildTypePage(
  program: Program,
  type: Model | Enum | Union | Scalar,
  methods: OperationSummary[],
  versionLabel?: string,
): TypePageModel {
  const summary = getSummary(program, type) ?? getDoc(program, type);

  if (type.kind === "Model") {
    return {
      title: toTitleCaseLabel(type.name),
      summary,
      deprecated: getDeprecated(program, type),
      versionLabel,
      kind: type.kind,
      breadcrumbs: breadcrumbsForType(program, type),
      baseType: type.baseModel ? typeReference(program, type.baseModel) : modelBaseType(program, type),
      properties: modelProperties(program, type),
      methods,
      variants: [],
      members: [],
      examples: typedExamples(program, type, getExamples(program, type)),
      jsonRepresentation: JSON.stringify(jsonRepresentationForType(program, type), null, 2),
    };
  }

  if (type.kind === "Union") {
    return {
      title: toTitleCaseLabel(type.name ?? "union"),
      summary,
      deprecated: getDeprecated(program, type),
      versionLabel,
      kind: type.kind,
      breadcrumbs: breadcrumbsForType(program, type),
      baseType: undefined,
      properties: [],
      methods,
      variants: [...type.variants.values()].map((variant) => unionVariant(program, variant)),
      members: [],
      examples: typedExamples(program, type, getExamples(program, type)),
      jsonRepresentation: JSON.stringify(jsonRepresentationForType(program, type), null, 2),
    };
  }

  if (type.kind === "Enum") {
    return {
      title: toTitleCaseLabel(type.name),
      summary,
      deprecated: getDeprecated(program, type),
      versionLabel,
      kind: type.kind,
      breadcrumbs: breadcrumbsForType(program, type),
      baseType: undefined,
      properties: [],
      methods,
      variants: [],
      members: [...type.members.values()].map((member) => enumMember(program, member)),
      examples: typedExamples(program, type, getExamples(program, type)),
      jsonRepresentation: JSON.stringify(jsonRepresentationForType(program, type), null, 2),
    };
  }

  return {
    title: toTitleCaseLabel(type.name),
    summary,
    deprecated: getDeprecated(program, type),
    versionLabel,
    kind: type.kind,
    breadcrumbs: breadcrumbsForType(program, type),
    baseType: type.baseScalar ? typeReference(program, type.baseScalar) : undefined,
    properties: [],
    methods,
    variants: [],
    members: [],
    examples: typedExamples(program, type, getExamples(program, type)),
    jsonRepresentation: JSON.stringify(jsonRepresentationForType(program, type), null, 2),
  };
}

function modelProperties(program: Program, model: Model): ParameterDoc[] {
  return [...walkPropertiesInherited(model)].map((property) => ({
    name: property.name,
    type: typeReference(program, property.type),
    requiredLabel: property.optional ? "No" : "Yes",
    summary: getSummary(program, property) ?? getDoc(program, property),
    summaryOrFallback: describeSummary(program, property),
  }));
}

function buildRelatedMethodsByType(
  program: Program,
  types: Array<{ id: string; name: string; type: Model | Enum | Union | Scalar }>,
  operations: Array<{ id: string; name: string; containerLabel: string; operation: Operation }>,
  operationPathById: Map<string, string>,
): Map<string, OperationSummary[]> {
  const relatedMethods = new Map<string, OperationSummary[]>();

  for (const typeEntry of types) {
    const methods = operations
      .filter((operationEntry) => operationUsesType(operationEntry.operation, typeEntry.type))
      .map((operationEntry) => ({
        name: operationEntry.name,
        title: operationEntry.name,
        containerLabel: operationEntry.containerLabel,
        returnType: typeReference(program, operationEntry.operation.returnType),
        summary: getSummary(program, operationEntry.operation) ?? getDoc(program, operationEntry.operation),
        summaryOrFallback: describeSummary(program, operationEntry.operation),
        path: operationPathById.has(operationEntry.id)
          ? `../${operationPathById.get(operationEntry.id)}`
          : "#",
      }));

    relatedMethods.set(typeEntry.id, methods);
  }

  return relatedMethods;
}

function operationUsesType(operation: Operation, target: Model | Enum | Union | Scalar): boolean {
  return typeContainsTarget(operation.returnType, target, new Set<Type>()) || typeContainsTarget(operation.parameters, target, new Set<Type>());
}

function typeContainsTarget(type: Type, target: Model | Enum | Union | Scalar, visited: Set<Type>): boolean {
  if (visited.has(type)) {
    return false;
  }

  visited.add(type);

  if (sameType(type, target)) {
    return true;
  }

  switch (type.kind) {
    case "Model":
      return [...type.properties.values()].some((property) => typeContainsTarget(property.type, target, visited));
    case "Union":
      return [...type.variants.values()].some((variant) => typeContainsTarget(variant.type, target, visited));
    case "Tuple":
      return type.values.some((value) => typeContainsTarget(value, target, visited));
    default:
      return false;
  }
}

function sameType(left: Type, right: Model | Enum | Union | Scalar): boolean {
  return left === right;
}

function jsonRepresentationForType(program: Program, type: Model | Enum | Union | Scalar, visited = new Set<Type>()): unknown {
  if (visited.has(type)) {
    return typeReference(program, type);
  }

  visited.add(type);

  switch (type.kind) {
    case "Model": {
      const jsonObject: Record<string, unknown> = {};
      for (const property of walkPropertiesInherited(type)) {
        jsonObject[property.name] = jsonValueForType(program, property.type, visited);
      }
      return jsonObject;
    }
    case "Enum": {
      const firstMember = [...type.members.values()][0];
      return firstMember?.value ?? firstMember?.name ?? type.name;
    }
    case "Union": {
      const firstVariant = [...type.variants.values()][0];
      return firstVariant ? jsonValueForType(program, firstVariant.type, visited) : type.name ?? "union";
    }
    case "Scalar":
      return scalarPlaceholder(type);
  }
}

function jsonValueForType(program: Program, type: Type, visited: Set<Type>): unknown {
  switch (type.kind) {
    case "String":
      return type.value;
    case "Number":
      return type.value;
    case "Boolean":
      return type.value;
    case "Tuple":
      return type.values.map((value) => jsonValueForType(program, value, visited));
    case "Model":
      if (isArrayModelType(program, type)) {
        const itemType = type.indexer?.value ?? [...type.properties.values()][0]?.type;
        return [itemType ? jsonValueForType(program, itemType, visited) : "unknown"];
      }
      if (isRecordModelType(program, type)) {
        const valueType = type.indexer?.value;
        return { property: valueType ? jsonValueForType(program, valueType, visited) : "unknown" };
      }
      return jsonRepresentationForType(program, type, new Set(visited));
    case "Union": {
      const firstVariant = [...type.variants.values()][0];
      return firstVariant ? jsonValueForType(program, firstVariant.type, visited) : type.name ?? "union";
    }
    case "Enum":
    case "Scalar":
      return jsonRepresentationForType(program, type, new Set(visited));
    default:
      return typeReference(program, type);
  }
}

function scalarPlaceholder(type: Scalar): unknown {
  if (type.name === "string" || type.baseScalar?.name === "string") {
    return "string";
  }

  if (type.name === "boolean" || type.baseScalar?.name === "boolean") {
    return true;
  }

  if (type.name.startsWith("int") || type.name.startsWith("uint") || type.name.startsWith("float") || type.name.startsWith("numeric")) {
    return 0;
  }

  return type.name;
}

function unionVariant(program: Program, variant: UnionVariant): VariantDoc {
  return {
    name: typeof variant.name === "symbol" ? variant.name.description ?? "variant" : variant.name,
    type: typeReference(program, variant.type),
    summary: getSummary(program, variant) ?? getDoc(program, variant),
    summaryOrFallback: describeSummary(program, variant),
  };
}

function enumMember(program: Program, member: EnumMember): MemberDoc {
  return {
    name: member.name,
    value: member.value === undefined ? member.name : String(member.value),
    summary: getSummary(program, member) ?? getDoc(program, member),
    summaryOrFallback: describeSummary(program, member),
  };
}

function typedExamples(program: Program, type: Type, examples: readonly Example[]): JsonExampleDoc[] {
  return examples.map((example, index) => ({
    title: example.title ?? `Example ${index + 1}`,
    description: example.description,
    json: stringifyExample(program, example.value, type),
  }));
}

function operationExamples(program: Program, operation: Operation, httpOperation: HttpOperation | undefined): OperationExampleDoc[] {
  const examples = getOpExamples(program, operation);

  if (examples.length > 0) {
    return examples.map((example, index) => buildOperationExample(program, operation, httpOperation, example, index));
  }

  const fallbackExample = buildSyntheticOperationExample(program, operation, httpOperation);
  return fallbackExample ? [fallbackExample] : [];
}

function buildOperationExample(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  example: OpExample,
  index: number,
): OperationExampleDoc {
  const parameterValues = example.parameters ? serializeSafely(program, example.parameters, operation.parameters) : undefined;
  const responseValue = example.returnType ? serializeSafely(program, example.returnType, operation.returnType) : undefined;

  return {
    title: example.title ?? `Example ${index + 1}`,
    description: example.description,
    request: buildHttpRequestExample(program, httpOperation, parameterValues),
    response: buildHttpResponseExample(program, httpOperation, responseValue),
  };
}

function buildSyntheticOperationExample(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
): OperationExampleDoc | undefined {
  if (!httpOperation) {
    return undefined;
  }

  return {
    title: "Example 1",
    description: getSummary(program, operation) ?? getDoc(program, operation),
    request: buildHttpRequestExample(program, httpOperation),
    response: buildHttpResponseExample(program, httpOperation),
  };
}

function stringifyExample(program: Program, value: Example["value"], type: Type): string {
  return JSON.stringify(serializeSafely(program, value, type), null, 2);
}

function buildHttpRequestExample(program: Program, httpOperation: HttpOperation | undefined, parameterValues?: unknown): string {
  if (!httpOperation) {
    return "HTTP metadata is not available for this operation.";
  }

  const sampleValues = resolveHttpParameterValues(program, httpOperation, parameterValues);
  const lines = [formatHttpRequestExampleLine(httpOperation, sampleValues)];
  const headerLines = buildRequestHeaderExampleLines(httpOperation, sampleValues);
  const body = httpOperation.parameters.body;
  const bodyValue = body ? extractRequestBodyValue(program, httpOperation, sampleValues) : undefined;

  lines.push(...headerLines);

  if (body) {
    lines.push(`Content-Type: ${body.contentTypes[0] ?? "application/json"}`);
  }

  if (bodyValue !== undefined) {
    lines.push("", JSON.stringify(bodyValue, null, 2));
  }

  return lines.join("\n");
}

function buildHttpResponseExample(program: Program, httpOperation: HttpOperation | undefined, responseValue?: unknown): string | undefined {
  if (!httpOperation) {
    return responseValue === undefined ? undefined : JSON.stringify(responseValue, null, 2);
  }

  const response = pickPrimaryResponse(httpOperation.responses);
  if (!response) {
    return undefined;
  }

  const content = response.responses[0];
  const inferredValue = responseValue ?? inferResponseBodyValue(program, content);
  const lines = [`HTTP/1.1 ${formatStatusCode(response.statusCodes)}`];

  if (inferredValue !== undefined) {
    lines.push(`Content-Type: ${content?.body?.contentTypes[0] ?? "application/json"}`, "", JSON.stringify(inferredValue, null, 2));
  }

  return lines.join("\n");
}

function formatHttpRequestExampleLine(httpOperation: HttpOperation, parameterValues?: Record<string, unknown>): string {
  let path = httpOperation.uriTemplate;
  const queryEntries: string[] = [];

  for (const parameter of httpOperation.parameters.parameters) {
    const value = parameterValues?.[parameter.param.name];
    if (value === undefined) {
      continue;
    }

    if (parameter.type === "path") {
      path = path.replaceAll(`{${parameter.param.name}}`, encodeURIComponent(String(value)));
      path = path.replaceAll(`{+${parameter.param.name}}`, encodeURIComponent(String(value)));
      continue;
    }

    if (parameter.type === "query") {
      const queryName = parameter.param.name;
      queryEntries.push(`${encodeURIComponent(queryName)}=${encodeURIComponent(String(value))}`);
    }
  }

  path = path.replace(/\{\?[^}]+\}/g, "");
  if (queryEntries.length > 0) {
    path = `${path}${path.includes("?") ? "&" : "?"}${queryEntries.join("&")}`;
  }

  return `${httpOperation.verb.toUpperCase()} ${path}`;
}

function buildRequestHeaderExampleLines(httpOperation: HttpOperation, parameterValues: Record<string, unknown>): string[] {
  const headerLines: string[] = [];

  for (const parameter of httpOperation.parameters.parameters) {
    if (parameter.type !== "header") {
      continue;
    }

    const value = parameterValues[parameter.param.name];
    if (value === undefined) {
      continue;
    }

    headerLines.push(`${parameter.name}: ${String(value)}`);
  }

  return headerLines;
}

function resolveHttpParameterValues(
  program: Program,
  httpOperation: HttpOperation,
  parameterValues?: unknown,
): Record<string, unknown> {
  const resolvedValues: Record<string, unknown> = { ...(asRecord(parameterValues) ?? {}) };

  for (const parameter of httpOperation.parameters.parameters) {
    if (resolvedValues[parameter.param.name] !== undefined) {
      continue;
    }

    resolvedValues[parameter.param.name] = sampleValueForType(program, parameter.param.type);
  }

  return resolvedValues;
}

function sampleValueForType(program: Program, type: Type): unknown {
  return jsonValueForType(program, type, new Set<Type>());
}

function extractRequestBodyValue(program: Program, httpOperation: HttpOperation, parameterValues?: unknown): unknown {
  const body = httpOperation.parameters.body;
  if (!body) {
    return undefined;
  }

  const values = asRecord(parameterValues);
  if (values && body.property && values[body.property.name] !== undefined) {
    return values[body.property.name];
  }

  return body.bodyKind === "single" ? jsonValueForType(program, body.type, new Set<Type>()) : undefined;
}

function inferResponseBodyValue(program: Program, responseContent: HttpOperationResponse["responses"][number] | undefined): unknown {
  if (!responseContent?.body) {
    return undefined;
  }

  return responseContent.body.bodyKind === "single"
    ? jsonValueForType(program, responseContent.body.type, new Set<Type>())
    : undefined;
}

function pickPrimaryResponse(responses: HttpOperationResponse[]): HttpOperationResponse | undefined {
  return responses.find((response) => isSuccessStatusCode(response.statusCodes)) ?? responses[0];
}

function isSuccessStatusCode(statusCode: number | "*" | HttpStatusCodeRange): boolean {
  if (typeof statusCode === "number") {
    return statusCode >= 200 && statusCode < 300;
  }

  if (statusCode === "*") {
    return false;
  }

  return statusCode.start >= 200 && statusCode.end < 300;
}

function formatStatusCode(statusCode: number | "*" | HttpStatusCodeRange): string {
  if (typeof statusCode === "number") {
    const label = statusText(statusCode);
    return label ? `${statusCode} ${label}` : `${statusCode}`;
  }

  if (statusCode === "*") {
    return "default";
  }

  return `${statusCode.start}-${statusCode.end}`;
}

function statusText(statusCode: number): string {
  switch (statusCode) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 202:
      return "Accepted";
    case 204:
      return "No Content";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 500:
      return "Internal Server Error";
    default:
      return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function serializeSafely(program: Program, value: Example["value"] | OpExample["parameters"] | undefined, type: Type): unknown {
  if (value === undefined) {
    return undefined;
  }

  try {
    return serializeValueAsJson(program, value, type);
  } catch {
    return typeReference(program, type);
  }
}

function formatParametersSignature(program: Program, model: Model): string {
  return modelProperties(program, model)
    .map((property) => `${property.name}${property.requiredLabel === "No" ? "?" : ""}: ${property.type}`)
    .join(", ");
}

function containerLabel(program: Program, operation: Operation): string {
  if (operation.interface) {
    return operation.interface.name;
  }

  if (operation.namespace && !isGlobalNamespace(program, operation.namespace)) {
    return "Service";
  }

  return "Service";
}

function breadcrumbsForOperation(program: Program, operation: Operation): string[] {
  const crumbs = ["API"];

  if (operation.interface) {
    crumbs.push(operation.interface.name);
  }

  crumbs.push(operation.name);
  return crumbs;
}

function breadcrumbsForType(program: Program, type: Model | Enum | Union | Scalar): string[] {
  const crumbs = ["API"];

  if (type.kind === "Union" && !type.name) {
    crumbs.push("union");
  } else if ("name" in type && type.name) {
    crumbs.push(type.name);
  }

  return crumbs;
}

function namespaceName(program: Program, namespace: Namespace): string {
  if (isGlobalNamespace(program, namespace)) {
    return "Global";
  }

  return getNamespaceFullName(namespace) || namespace.name || "Global";
}

function describeNamespace(program: Program, namespace: Namespace, fallback: string): string {
  return fallback;
}

function entityId(program: Program, entity: Type): string {
  if (entity.kind === "Operation") {
    const interfaceName = entity.interface ? `${entity.interface.name}.` : "";
    const namespace = entity.namespace && !isGlobalNamespace(program, entity.namespace) ? `${namespaceName(program, entity.namespace)}.` : "";
    return `${namespace}${interfaceName}${entity.name}`;
  }

  if (entity.kind === "Union") {
    return entity.name ? `${entity.namespace ? `${namespaceName(program, entity.namespace)}.` : ""}${entity.name}` : typeReference(program, entity);
  }

  return getTypeName(entity);
}

function typeReference(program: Program, type: Type): string {
  switch (type.kind) {
    case "String":
      return JSON.stringify(type.value);
    case "Number":
      return type.valueAsString;
    case "Boolean":
      return String(type.value);
    case "Tuple":
      return `[${type.values.map((item) => typeReference(program, item)).join(", ")}]`;
    case "Union":
      if (type.name) {
        return type.name;
      }
      return [...type.variants.values()].map((variant) => typeReference(program, variant.type)).join(" | ");
    case "Model":
      // Check structural array/record types before the name to correctly handle
      // anonymous template instantiations (e.g., Array<Widget> from Widget[]).
      if (isArrayModelType(program, type)) {
        const valueType = type.indexer?.value ?? [...type.properties.values()][0]?.type;
        return `${valueType ? typeReference(program, valueType) : "unknown"}[]`;
      }
      if (isRecordModelType(program, type)) {
        const valueType = type.indexer?.value;
        return `Record<string, ${valueType ? typeReference(program, valueType) : "unknown"}>`;
      }
      if (type.name) {
        return type.name;
      }
      return `{ ${[...type.properties.values()]
        .map((property) => `${property.name}${property.optional ? "?" : ""}: ${typeReference(program, property.type)}`)
        .join("; ")} }`;
    case "Enum":
      return type.name;
    case "Scalar":
      return type.name;
    default:
      return getTypeName(type);
  }
}

function modelBaseType(program: Program, model: Model): string | undefined {
  if (isArrayModelType(program, model)) {
    return "Array";
  }

  if (isRecordModelType(program, model)) {
    return "Record";
  }

  return undefined;
}

function describeSummary(program: Program, type: Type): string {
  return getSummary(program, type) ?? getDoc(program, type) ?? FALLBACK_SUMMARY;
}

function slugify(value: string): string {
  const slug = value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug || "index";
}

function operationFileName(operation: Operation): string {
  const segments: string[] = [];
  if (operation.interface?.name) {
    segments.push(operation.interface.name);
  }
  segments.push(operation.name);
  return toTitleCaseFileName(segments.join(" "));
}

function toTitleCaseFileName(value: string): string {
  const words = splitIdentifierWords(value);
  if (words.length === 0) {
    return "Index";
  }

  return words.map((word) => capitalizeWord(word)).join("-");
}

function toTitleCaseLabel(value: string): string {
  const words = splitIdentifierWords(value);
  if (words.length === 0) {
    return value;
  }

  return words.map((word) => capitalizeWord(word)).join(" ");
}

function splitIdentifierWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

function capitalizeWord(word: string): string {
  if (word.length === 0) {
    return word;
  }

  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " ").trim();
}
