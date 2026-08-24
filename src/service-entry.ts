import {
  getDoc,
  getSummary,
  isArrayModelType,
  isErrorModel,
  isRecordModelType,
  listServices,
  walkPropertiesInherited,
  type Enum,
  type Model,
  type Namespace,
  type Operation,
  type Program,
  type Scalar,
  type Type,
  type Union,
} from "@typespec/compiler";
import { unsafe_mutateSubgraphWithNamespace } from "@typespec/compiler/experimental";
import { getVersioningMutators, type Version } from "@typespec/versioning";
import {
  collectNamespaces,
  collectOperations,
  collectTypes,
} from "./collect.js";
import { arrayElementType, makeLinkedTypeRef } from "./type-ref.js";
import {
  describeSummary,
  describeNamespace,
  formatExternalDocsLink,
  namespaceName,
  operationFileName,
  slugify,
} from "./utils.js";
// NOTE: These imports create a circular dependency at the module graph level,
// but Node.js ESM handles this via live bindings. By the time collectServiceEntry
// is actually called at runtime, both modules will be fully initialised.
import { buildOperationPage } from "./operation-page.js";
import { buildTypePage } from "./type-page.js";

/**
 * A minimal record for a page that can be linked to from index pages.
 * Carries the data needed to render a table row (title, summary, path).
 */
export interface RenderedDoc {
  /** Relative file path to this page (e.g. `"resources/Widget.md"`). */
  path: string;
  /** Human-readable page title. */
  title: string;
  /** Raw summary from `@summary` or `@doc`, if present. */
  summary?: string;
  /** Summary falling back to {@link FALLBACK_SUMMARY} when absent. */
  summaryOrFallback: string;
}

/**
 * A {@link RenderedDoc} extended with the namespace's display name.
 * Used in the overview page's namespace table.
 */
export interface NamespaceSummary extends RenderedDoc {
  /** Fully-qualified namespace name, e.g. `"Contoso.Pets"`. */
  name: string;
}

/**
 * A {@link RenderedDoc} extended with operation-specific metadata.
 * Used in the overview page and in the related-methods table on type pages.
 */
export interface OperationSummary extends RenderedDoc {
  /** Operation name as declared in the TypeSpec source. */
  name: string;
  /** Label of the containing interface or `"Service"`. */
  containerLabel: string;
  /** Markdown type reference string for the return type. */
  returnType: string;
}

/**
 * A {@link RenderedDoc} extended with the TypeSpec kind of the type.
 * Used in the overview page's types table.
 */
export interface TypeSummary extends RenderedDoc {
  /** Type name as declared in the TypeSpec source. */
  name: string;
  /** TypeSpec kind string: `"Model"`, `"Enum"`, `"Union"`, or `"Scalar"`. */
  kind: string;
}

/**
 * The data model for the service overview page template (`overview.md.hbs`).
 * Aggregates all operations, types, and namespaces for a single service version.
 */
export interface OverviewPageModel {
  /** Service title used as the page heading. */
  title: string;
  /** Raw summary from `@summary` or `@doc` on the service namespace, if present. */
  summary?: string;
  /** Markdown link rendered from `@externalDocs` on the service namespace, if present. */
  externalDocs?: string;
  /** Version label string (e.g. `"v1.0"`), only present for versioned services. */
  versionLabel?: string;
  /** Resolved API name from emitter options, if set. */
  apiName?: string;
  /** Reserved for future use (service name distinct from title). */
  serviceName?: string;
  /** All descendant namespaces of the service namespace. */
  namespaces: NamespaceSummary[];
  /** All operations in the service, sorted alphabetically by name. */
  operations: OperationSummary[];
  /** All named types in the service, sorted alphabetically by name. */
  types: TypeSummary[];
}

/**
 * A fully-resolved service entry containing all page models needed to emit
 * a complete documentation set for one service (or one version of a service).
 */
export interface ServiceEntry {
  /** URL-safe slug for this service (used as the output folder name). */
  slug: string;
  /**
   * The unversioned base label used to group versioned services together.
   * Equal to `apiName` when set, otherwise the service title.
   */
  baseLabel: string;
  /** Version string (e.g. `"v1.0"`), only present for versioned services. */
  versionValue?: string;
  /** Data model for the overview page. */
  overview: OverviewPageModel;
  /** One entry per operation, each holding the slug and full page model. */
  operations: Array<{
    slug: string;
    page: import("./operation-page.js").OperationPageModel;
  }>;
  /** One entry per type, each holding the slug and full page model. */
  types: Array<{ slug: string; page: import("./type-page.js").TypePageModel }>;
  /**
   * The raw type descriptors (id, name, type object) used by
   * {@link buildRelationDiagram} to build the ER diagram without re-walking types.
   */
  rawTypes: Array<{
    id: string;
    name: string;
    type: Model | Enum | Union | Scalar;
  }>;
}

/**
 * The top-level entry point for collecting all service entries from a TypeSpec program.
 *
 * Finds all `@service`-decorated namespaces. When none are present, falls back
 * to the global namespace. For each namespace, calls
 * {@link collectServiceEntriesForNamespace} which expands versioned services
 * into one entry per version snapshot.
 *
 * @param program - The TypeSpec program.
 * @param pageTitlePrefix - Fallback prefix for page titles when no `@service` title is present.
 * @param apiName - Optional API name override from emitter options.
 * @param routePrefix - Optional route prefix template (may contain `{version}`).
 * @returns A flat array of {@link ServiceEntry} objects, one per service (or version).
 */
export function getServiceEntries(
  program: Program,
  pageTitlePrefix?: string,
  apiName?: string,
  routePrefix?: string,
): ServiceEntry[] {
  const services = listServices(program);
  const serviceTargets =
    services.length > 0
      ? services.map((service) => ({
          namespace: service.type,
          title: service.title,
        }))
      : [{ namespace: program.getGlobalNamespaceType(), title: undefined }];

  return serviceTargets.flatMap(({ namespace, title }) =>
    collectServiceEntriesForNamespace(
      program,
      namespace,
      title,
      pageTitlePrefix,
      apiName,
      routePrefix,
    ),
  );
}

/**
 * Expands a single service namespace into one or more {@link ServiceEntry} objects.
 *
 * When the namespace is decorated with `@versioned`, the TypeSpec versioning
 * mutator API is used to project a snapshot of the namespace for each declared
 * version. Each snapshot is then passed to {@link collectServiceEntry}.
 *
 * Non-versioned services produce exactly one entry.
 *
 * @param program - The TypeSpec program.
 * @param serviceNamespace - The `@service`-decorated namespace.
 * @param serviceTitle - The service title from the `@service` decorator, if any.
 * @param pageTitlePrefix - Fallback title prefix from emitter options.
 * @param apiName - Optional API name override.
 * @param routePrefix - Optional route prefix template.
 */
export function collectServiceEntriesForNamespace(
  program: Program,
  serviceNamespace: Namespace,
  serviceTitle: string | undefined,
  pageTitlePrefix: string | undefined,
  apiName?: string,
  routePrefix?: string,
): ServiceEntry[] {
  const versioning = getVersioningMutators(program, serviceNamespace);

  if (versioning?.kind === "versioned") {
    return versioning.snapshots.map((snapshot) => {
      // Materialize a version-specific copy of the namespace subgraph.
      const { type } = unsafe_mutateSubgraphWithNamespace(
        program,
        [snapshot.mutator],
        serviceNamespace,
      );
      return collectServiceEntry(
        program,
        type as Namespace,
        serviceTitle,
        pageTitlePrefix,
        apiName,
        snapshot.version,
        routePrefix,
      );
    });
  }

  return [
    collectServiceEntry(
      program,
      serviceNamespace,
      serviceTitle,
      pageTitlePrefix,
      apiName,
      undefined,
      routePrefix,
    ),
  ];
}

/**
 * Builds a single {@link ServiceEntry} for a namespace (or a versioned snapshot).
 *
 * This is the central assembly function: it collects all operations and types,
 * sorts them, builds cross-reference maps, computes related-method lists for
 * type pages, and assembles the full data models for every page in the service.
 *
 * @param program - The TypeSpec program.
 * @param serviceNamespace - The namespace to document (possibly a version snapshot).
 * @param serviceTitle - Title from `@service`, used as the heading.
 * @param pageTitlePrefix - Fallback title when no `@service` title is present.
 * @param apiName - Optional API name override from emitter options.
 * @param version - The version object from `@typespec/versioning`, when versioned.
 * @param routePrefix - Optional route prefix template.
 */
export function collectServiceEntry(
  program: Program,
  serviceNamespace: Namespace,
  serviceTitle: string | undefined,
  pageTitlePrefix: string | undefined,
  apiName?: string,
  version?: Version,
  routePrefix?: string,
): ServiceEntry {
  const namespaces = collectNamespaces(serviceNamespace);
  const operations = collectOperations(program, serviceNamespace);
  const types = collectTypes(program, serviceNamespace);
  const baseServiceLabel = describeNamespace(
    program,
    serviceNamespace,
    serviceTitle ?? pageTitlePrefix ?? "API Reference",
  );
  const serviceLabel = version
    ? `${baseServiceLabel} ${version.value}`
    : baseServiceLabel;

  const resolvedApiName = apiName
    ? version
      ? `${apiName} ${version.value}`
      : apiName
    : undefined;
  const serviceSlug = resolvedApiName
    ? slugify(resolvedApiName)
    : version
      ? slugify(version.value)
      : slugify(serviceLabel);

  const sortedOperations = operations
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const sortedTypes = types
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const operationPathById = new Map(
    sortedOperations.map((op) => [
      op.id,
      `api/${operationFileName(op.operation)}.md`,
    ]),
  );
  const typePathById = new Map(
    sortedTypes.map((t) => [t.id, `resources/${t.name}.md`]),
  );

  const relatedMethodsByTypeId = buildRelatedMethodsByType(
    program,
    sortedTypes,
    sortedOperations,
    operationPathById,
    typePathById,
  );

  const resolvedRoutePrefix = routePrefix
    ? resolveRoutePrefixInternal(routePrefix, version?.value)
    : undefined;

  const operationPages = sortedOperations.map((operation) => ({
    slug: operationFileName(operation.operation),
    page: buildOperationPage(
      program,
      operation.operation,
      typePathById,
      version?.value,
      resolvedApiName,
      resolvedRoutePrefix,
    ),
  }));

  const typePages = sortedTypes.map((typeEntry) => ({
    slug: typeEntry.name,
    page: buildTypePage(
      program,
      typeEntry.type,
      relatedMethodsByTypeId.get(typeEntry.id) ?? [],
      typePathById,
      version?.value,
      resolvedApiName,
    ),
  }));

  const overviewTypeRef = makeLinkedTypeRef(program, typePathById, (p) => p);

  const overview: OverviewPageModel = {
    title: serviceLabel,
    summary:
      getSummary(program, serviceNamespace) ??
      getDoc(program, serviceNamespace),
    externalDocs: formatExternalDocsLink(program, serviceNamespace),
    versionLabel: version?.value,
    apiName: resolvedApiName,
    serviceName: undefined,
    namespaces: namespaces.map((ns) => ({
      name: namespaceName(program, ns),
      title: namespaceName(program, ns),
      summary: getSummary(program, ns) ?? getDoc(program, ns),
      summaryOrFallback: describeSummary(program, ns),
      path: "#",
    })),
    operations: sortedOperations.map((entry) => ({
      name: entry.name,
      title: entry.name,
      containerLabel: entry.containerLabel,
      returnType: overviewTypeRef(entry.operation.returnType),
      summary:
        getSummary(program, entry.operation) ??
        getDoc(program, entry.operation),
      summaryOrFallback: describeSummary(program, entry.operation),
      path: operationPathById.get(entry.id) ?? "#",
    })),
    types: sortedTypes.map((entry) => ({
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
    baseLabel: apiName ?? baseServiceLabel,
    versionValue: version?.value,
    overview,
    operations: operationPages,
    types: typePages,
    rawTypes: sortedTypes,
  };
}

/**
 * Builds a map from type ID to the list of operations that reference that type.
 *
 * For each type in `types`, all operations in `operations` are tested with
 * {@link operationUsesType}. Matching operations are converted to
 * {@link OperationSummary} objects with relative paths adjusted for type pages
 * (which live inside `resources/`, so links to `api/` need a `"../"` prefix).
 *
 * `@error` types are excluded from all related-method lists because they are
 * cross-cutting error envelopes used across many operations — listing them on
 * every operation page would be noisy and unhelpful.
 *
 * @param program - The TypeSpec program.
 * @param types - All named types in the service, sorted by name.
 * @param operations - All operations in the service, sorted by name.
 * @param operationPathById - Map from operation entity ID to its relative file path.
 * @param typePathById - Map from type entity ID to its relative file path.
 * @returns A map from type entity ID to its list of related operation summaries.
 */
export function buildRelatedMethodsByType(
  program: Program,
  types: Array<{
    id: string;
    name: string;
    type: Model | Enum | Union | Scalar;
  }>,
  operations: Array<{
    id: string;
    name: string;
    containerLabel: string;
    operation: Operation;
  }>,
  operationPathById: Map<string, string>,
  typePathById: Map<string, string>,
): Map<string, OperationSummary[]> {
  const relatedMethods = new Map<string, OperationSummary[]>();

  const makeRef = makeLinkedTypeRef(program, typePathById, (p) =>
    p.replace(/^resources\//, ""),
  );

  for (const typeEntry of types) {
    const methods = operations
      .filter((operationEntry) =>
        operationUsesType(program, operationEntry.operation, typeEntry.type),
      )
      .map((operationEntry) => ({
        name: operationEntry.name,
        title: operationEntry.name,
        containerLabel: operationEntry.containerLabel,
        returnType: makeRef(operationEntry.operation.returnType),
        summary:
          getSummary(program, operationEntry.operation) ??
          getDoc(program, operationEntry.operation),
        summaryOrFallback: describeSummary(program, operationEntry.operation),
        path: operationPathById.has(operationEntry.id)
          ? `../${operationPathById.get(operationEntry.id)}`
          : "#",
      }));

    relatedMethods.set(typeEntry.id, methods);
  }

  return relatedMethods;
}

/**
 * Returns `true` when an operation uses `target` as a parameter or return type.
 *
 * "Uses" is defined as:
 * 1. The return type directly references `target` (via {@link typeDirectlyReferencesTarget}).
 * 2. Any parameter property directly references `target`.
 * 3. Any parameter is a plain (non-array, non-record) model whose own properties
 *    directly reference `target` — this handles wrapper body patterns such as
 *    `op create(body: CreateWidgetRequest): Widget` where `CreateWidgetRequest`
 *    has `widget: Widget`.
 *
 * `@error` types are always excluded: they appear on every operation that can
 * fail and listing them on a type page would be misleading.
 *
 * @param program - The TypeSpec program.
 * @param operation - The operation to test.
 * @param target - The type to look for.
 */
export function operationUsesType(
  program: Program,
  operation: Operation,
  target: Model | Enum | Union | Scalar,
): boolean {
  // @error types are cross-cutting error envelopes, not addressable entities.
  if (isErrorModel(program, target)) {
    return false;
  }

  if (typeDirectlyReferencesTarget(program, operation.returnType, target)) {
    return true;
  }

  for (const property of walkPropertiesInherited(operation.parameters)) {
    if (typeDirectlyReferencesTarget(program, property.type, target)) {
      return true;
    }
    // For plain model parameters (e.g. an @body wrapper like CreateRequest),
    // also check their direct properties — a wrapper body type is still a
    // direct input to the operation from the caller's perspective.
    const paramType = property.type;
    if (
      paramType.kind === "Model" &&
      !isArrayModelType(program, paramType) &&
      !isRecordModelType(program, paramType)
    ) {
      for (const nested of walkPropertiesInherited(paramType)) {
        if (typeDirectlyReferencesTarget(program, nested.type, target)) {
          return true;
        }
      }
    }
  }

  return false;
}

// Returns true if `type` IS the target, is a direct array/record of the target,
// or is a union whose variants directly reference the target (including as an
// array/record element). Does not recurse into regular model properties.
// visited guards against circular union references.
function typeDirectlyReferencesTarget(
  program: Program,
  type: Type,
  target: Model | Enum | Union | Scalar,
  visited: Set<Type> = new Set(),
): boolean {
  if (visited.has(type)) {
    return false;
  }
  visited.add(type);

  if (type === target) {
    return true;
  }

  switch (type.kind) {
    case "Model": {
      if (isArrayModelType(program, type) || isRecordModelType(program, type)) {
        const elementType = arrayElementType(type);
        return elementType === target;
      }
      return false;
    }
    case "Union": {
      for (const variant of type.variants.values()) {
        if (
          typeDirectlyReferencesTarget(program, variant.type, target, visited)
        ) {
          return true;
        }
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Resolves the route prefix template by substituting `{version}` and
 * normalizing repeated or trailing slashes.
 *
 * @param routePrefix - The raw prefix template, e.g. `"api/{version}"`.
 * @param version - The version string to substitute for `{version}`, if any.
 * @returns A clean prefix string with no trailing slash.
 */
function resolveRoutePrefixInternal(
  routePrefix: string,
  version?: string,
): string {
  const substituted = routePrefix.replace(/\{version\}/g, version ?? "");
  return substituted.replace(/\/+/g, "/").replace(/\/$/, "");
}
