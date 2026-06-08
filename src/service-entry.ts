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
  namespaceName,
  operationFileName,
  slugify,
} from "./utils.js";
// NOTE: These imports create a circular dependency at the module graph level,
// but Node.js ESM handles this via live bindings. By the time collectServiceEntry
// is actually called at runtime, both modules will be fully initialised.
import { buildOperationPage } from "./operation-page.js";
import { buildTypePage } from "./type-page.js";

export interface RenderedDoc {
  path: string;
  title: string;
  summary?: string;
  summaryOrFallback: string;
}

export interface NamespaceSummary extends RenderedDoc {
  name: string;
}

export interface OperationSummary extends RenderedDoc {
  name: string;
  containerLabel: string;
  returnType: string;
}

export interface TypeSummary extends RenderedDoc {
  name: string;
  kind: string;
}

export interface OverviewPageModel {
  title: string;
  summary?: string;
  versionLabel?: string;
  apiName?: string;
  serviceName?: string;
  namespaces: NamespaceSummary[];
  operations: OperationSummary[];
  types: TypeSummary[];
}

export interface ServiceEntry {
  slug: string;
  baseLabel: string;
  versionValue?: string;
  overview: OverviewPageModel;
  operations: Array<{
    slug: string;
    page: import("./operation-page.js").OperationPageModel;
  }>;
  types: Array<{ slug: string; page: import("./type-page.js").TypePageModel }>;
  rawTypes: Array<{
    id: string;
    name: string;
    type: Model | Enum | Union | Scalar;
  }>;
}

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

function resolveRoutePrefixInternal(
  routePrefix: string,
  version?: string,
): string {
  const substituted = routePrefix.replace(/\{version\}/g, version ?? "");
  return substituted.replace(/\/+/g, "/").replace(/\/$/, "");
}
