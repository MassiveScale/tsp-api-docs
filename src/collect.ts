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

/**
 * Recursively collects all descendant namespaces of `serviceNamespace`,
 * including the namespace's own child namespaces and their children.
 *
 * The root namespace itself is not included — only its descendants.
 *
 * @param serviceNamespace - The namespace whose descendants to collect.
 * @returns A flat array of all descendant namespaces in declaration order.
 */
export function collectNamespaces(serviceNamespace: Namespace): Namespace[] {
  const namespaces: Namespace[] = [];

  for (const namespace of serviceNamespace.namespaces.values()) {
    namespaces.push(namespace);
    namespaces.push(...collectNamespaces(namespace));
  }

  return namespaces;
}

/**
 * Collects all non-template operations reachable from `namespace`, including
 * operations declared directly on the namespace, inside interfaces, and inside
 * nested child namespaces. Deduplicates by entity ID.
 *
 * @param program - The TypeSpec program (used to compute entity IDs and labels).
 * @param namespace - The namespace to walk.
 * @returns A deduplicated array of operation descriptors sorted by declaration order.
 */
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

/**
 * Collects all non-template operations declared on a single TypeSpec interface.
 *
 * @param program - The TypeSpec program.
 * @param iface - The interface whose operations to collect.
 * @returns An array of operation descriptors for every non-skipped operation.
 */
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

/**
 * Collects all named, non-template types (Models, Scalars, Enums, Unions)
 * reachable from `namespace` and its children. Deduplicates by entity ID.
 *
 * Anonymous models and template declarations are excluded because they have
 * no stable name and therefore cannot have their own documentation page.
 *
 * @param program - The TypeSpec program.
 * @param namespace - The namespace to walk.
 * @returns A deduplicated array of type descriptors.
 */
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

/**
 * Returns `true` when a type should be excluded from emitted documentation.
 *
 * Template declarations (e.g. `model Foo<T>`) are skipped because they are
 * abstract building blocks, not concrete API types. Enum declarations are
 * never skipped — TypeSpec enums cannot be template declarations.
 *
 * @param type - The TypeSpec type to test.
 */
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

/**
 * Removes duplicate entries from an array, keeping only the first occurrence
 * of each unique `id`.
 *
 * Used after recursive namespace walks where the same type or operation can
 * be encountered more than once (e.g. through versioning snapshots).
 *
 * @param entries - Array of objects with a string `id` field.
 * @returns A new array with duplicates removed, preserving insertion order.
 */
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
