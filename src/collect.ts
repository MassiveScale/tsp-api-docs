import {
  isTemplateDeclaration,
  type Enum,
  type Interface,
  type Model,
  type Namespace,
  type Operation,
  type Program,
  type Scalar,
  type Union,
} from "@typespec/compiler";
import { containerLabel } from "./utils.js";
import { entityId } from "./type-ref.js";

export function collectNamespaces(serviceNamespace: Namespace): Namespace[] {
  const namespaces: Namespace[] = [];

  for (const namespace of serviceNamespace.namespaces.values()) {
    namespaces.push(namespace);
    namespaces.push(...collectNamespaces(namespace));
  }

  return namespaces;
}

export function collectOperations(
  program: Program,
  namespace: Namespace,
): Array<{
  id: string;
  name: string;
  containerLabel: string;
  operation: Operation;
}> {
  const operations: Array<{
    id: string;
    name: string;
    containerLabel: string;
    operation: Operation;
  }> = [];

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

export function collectInterfaceOperations(
  program: Program,
  iface: Interface,
): Array<{
  id: string;
  name: string;
  containerLabel: string;
  operation: Operation;
}> {
  const operations: Array<{
    id: string;
    name: string;
    containerLabel: string;
    operation: Operation;
  }> = [];

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

export function collectTypes(
  program: Program,
  namespace: Namespace,
): Array<{ id: string; name: string; type: Model | Enum | Union | Scalar }> {
  const types: Array<{
    id: string;
    name: string;
    type: Model | Enum | Union | Scalar;
  }> = [];

  for (const model of namespace.models.values()) {
    if (!shouldSkipType(model) && model.name) {
      types.push({
        id: entityId(program, model),
        name: model.name,
        type: model,
      });
    }
  }

  for (const scalar of namespace.scalars.values()) {
    if (!shouldSkipType(scalar) && scalar.name) {
      types.push({
        id: entityId(program, scalar),
        name: scalar.name,
        type: scalar,
      });
    }
  }

  for (const enumeration of namespace.enums.values()) {
    if (!shouldSkipType(enumeration) && enumeration.name) {
      types.push({
        id: entityId(program, enumeration),
        name: enumeration.name,
        type: enumeration,
      });
    }
  }

  for (const union of namespace.unions.values()) {
    if (!shouldSkipType(union) && union.name) {
      types.push({
        id: entityId(program, union),
        name: union.name,
        type: union,
      });
    }
  }

  for (const child of namespace.namespaces.values()) {
    types.push(...collectTypes(program, child));
  }

  return dedupeById(types);
}

export function shouldSkipType(
  type: Operation | Model | Scalar | Enum | Union,
): boolean {
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

export function dedupeById<T extends { id: string }>(entries: T[]): T[] {
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
