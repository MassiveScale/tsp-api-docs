import {
  getTypeName,
  isArrayModelType,
  isGlobalNamespace,
  isRecordModelType,
  walkPropertiesInherited,
  type Enum,
  type Model,
  type Namespace,
  type Program,
  type Scalar,
  type Type,
  type Union,
} from "@typespec/compiler";
import { isVisible, type Visibility } from "@typespec/http";
import { namespaceName } from "./utils.js";

/**
 * Returns the element type of an array model.
 *
 * Prefers `type.indexer.value` (the standard TypeSpec path for `Array<T>`).
 * Falls back to the first declared property's type for legacy or non-standard
 * array shapes. Returns `undefined` when neither is available.
 *
 * @param type - A Model that is expected to be an array type.
 */
export function arrayElementType(type: Model): Type | undefined {
  return type.indexer?.value ?? [...type.properties.values()][0]?.type;
}

/**
 * Computes a stable, human-readable entity ID for a TypeSpec type.
 *
 * - **Operations**: `"Namespace.Interface.name"` (with namespace/interface omitted
 *   when they are absent or global).
 * - **Named unions**: `"Namespace.name"`.
 * - **Everything else**: delegates to `getTypeName` from the TypeSpec compiler.
 *
 * Entity IDs are used as keys in the `typePathById` and `operationPathById` maps
 * to cross-link pages without embedding absolute file paths.
 *
 * @param program - The TypeSpec program.
 * @param entity - The type to identify.
 */
export function entityId(program: Program, entity: Type): string {
  if (entity.kind === "Operation") {
    const interfaceName = entity.interface ? `${entity.interface.name}.` : "";
    const namespace =
      entity.namespace && !isGlobalNamespace(program, entity.namespace)
        ? `${namespaceName(program, entity.namespace)}.`
        : "";
    return `${namespace}${interfaceName}${entity.name}`;
  }

  if (entity.kind === "Union") {
    return entity.name
      ? `${entity.namespace ? `${namespaceName(program, entity.namespace as Namespace)}.` : ""}${entity.name}`
      : typeReference(program, entity);
  }

  return getTypeName(entity);
}

/**
 * Produces an unlinked, plain-text type reference string for a TypeSpec type.
 *
 * Used in signatures and fallback contexts where Markdown links are not desired.
 * Handles literals (`"value"`, `42`, `true`), tuples, unions, models (including
 * arrays and records), enums, scalars, and delegates to `getTypeName` for anything else.
 *
 * @param program - The TypeSpec program.
 * @param type - The type to describe as a string.
 */
export function typeReference(program: Program, type: Type): string {
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
      return [...type.variants.values()]
        .map((variant) => typeReference(program, variant.type))
        .join(" | ");
    case "Model":
      if (isArrayModelType(program, type)) {
        const valueType = arrayElementType(type);
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
        .map(
          (property) =>
            `${property.name}${property.optional ? "?" : ""}: ${typeReference(program, property.type)}`,
        )
        .join("; ")} }`;
    case "Enum":
      return type.name;
    case "Scalar":
      return type.name;
    default:
      return getTypeName(type);
  }
}

/**
 * Creates a type reference function that produces Markdown links for named types
 * that have associated documentation pages.
 *
 * The returned function behaves like {@link typeReference} except that named
 * types (models, enums, scalars, unions) are wrapped in a Markdown link when
 * their entity ID appears in `typePathById`. The `pathAdjuster` callback lets
 * callers transform the stored path (e.g. add `"../"` prefix) to make it
 * relative to the current page.
 *
 * @param program - The TypeSpec program.
 * @param typePathById - Map from entity ID to relative file path for that type's page.
 * @param pathAdjuster - Transforms a stored path into the correct relative path for this page.
 * @returns A function that converts a TypeSpec type to a Markdown reference string.
 */
export function makeLinkedTypeRef(
  program: Program,
  typePathById: Map<string, string>,
  pathAdjuster: (path: string) => string,
): (type: Type) => string {
  function linkedRef(type: Type): string {
    switch (type.kind) {
      case "String":
        return JSON.stringify(type.value);
      case "Number":
        return type.valueAsString;
      case "Boolean":
        return String(type.value);
      case "Tuple":
        return `[${type.values.map(linkedRef).join(", ")}]`;
      case "Union":
        if (type.name) {
          const path = typePathById.get(entityId(program, type));
          if (path) return `[${type.name}](${pathAdjuster(path)})`;
          return type.name;
        }
        return [...type.variants.values()]
          .map((variant) => linkedRef(variant.type))
          .join(" | ");
      case "Model":
        if (isArrayModelType(program, type)) {
          const valueType = arrayElementType(type);
          return `${valueType ? linkedRef(valueType) : "unknown"}[]`;
        }
        if (isRecordModelType(program, type)) {
          const valueType = type.indexer?.value;
          return `Record<string, ${valueType ? linkedRef(valueType) : "unknown"}>`;
        }
        if (type.name) {
          const path = typePathById.get(entityId(program, type));
          if (path) return `[${type.name}](${pathAdjuster(path)})`;
          return type.name;
        }
        return `{ ${[...type.properties.values()]
          .map(
            (property) =>
              `${property.name}${property.optional ? "?" : ""}: ${linkedRef(property.type)}`,
          )
          .join("; ")} }`;
      case "Enum": {
        const path = typePathById.get(entityId(program, type));
        if (path) return `[${type.name}](${pathAdjuster(path)})`;
        return type.name;
      }
      case "Scalar": {
        const path = typePathById.get(entityId(program, type));
        if (path) return `[${type.name}](${pathAdjuster(path)})`;
        return type.name;
      }
      default:
        return getTypeName(type);
    }
  }
  return linkedRef;
}

/**
 * Returns the base type keyword for a model used as a generic container.
 *
 * - Returns `"Array"` for array models.
 * - Returns `"Record"` for record (map) models.
 * - Returns `undefined` for plain models.
 *
 * @param program - The TypeSpec program.
 * @param model - The model to inspect.
 */
export function modelBaseType(
  program: Program,
  model: Model,
): string | undefined {
  if (isArrayModelType(program, model)) {
    return "Array";
  }

  if (isRecordModelType(program, model)) {
    return "Record";
  }

  return undefined;
}

/**
 * Produces a representative JSON-serializable value for a named TypeSpec type.
 *
 * Used to generate example JSON snippets on documentation pages. The `visited`
 * set prevents infinite recursion on self-referential or mutually-recursive types
 * by substituting a type-name string when a cycle is detected.
 *
 * For visibility-filtered contexts (e.g. request bodies), pass the HTTP verb's
 * `Visibility` so write-only properties are excluded from the example.
 *
 * @param program - The TypeSpec program.
 * @param type - A named type (Model, Enum, Union, or Scalar) to represent.
 * @param visited - Accumulator for cycle detection; pass `new Set()` at the call site.
 * @param visibilityFilter - Optional HTTP visibility to filter model properties.
 * @returns A JSON-serializable value (object, string, number, boolean, or array).
 */
export function jsonRepresentationForType(
  program: Program,
  type: Model | Enum | Union | Scalar,
  visited = new Set<Type>(),
  visibilityFilter?: Visibility,
): unknown {
  if (visited.has(type)) {
    // Cycle detected — substitute the type name to break the recursion.
    return typeReference(program, type);
  }

  visited.add(type);

  switch (type.kind) {
    case "Model": {
      const jsonObject: Record<string, unknown> = {};
      for (const property of walkPropertiesInherited(type)) {
        if (
          visibilityFilter !== undefined &&
          !isVisible(program, property, visibilityFilter)
        ) {
          continue;
        }
        jsonObject[property.name] = jsonValueForType(
          program,
          property.type,
          visited,
          visibilityFilter,
        );
      }
      return jsonObject;
    }
    case "Enum": {
      // Use the first member's wire value, then its name, then the enum name.
      const firstMember = [...type.members.values()][0];
      return firstMember?.value ?? firstMember?.name ?? type.name;
    }
    case "Union": {
      // Use the first variant as the representative example.
      const firstVariant = [...type.variants.values()][0];
      return firstVariant
        ? jsonValueForType(
            program,
            firstVariant.type,
            visited,
            visibilityFilter,
          )
        : (type.name ?? "union");
    }
    case "Scalar":
      return scalarPlaceholder(type);
  }
}

/**
 * Produces a representative JSON-serializable value for any TypeSpec type,
 * including literals, tuples, unions, arrays, records, and named types.
 *
 * Delegates to {@link jsonRepresentationForType} for named structural types and
 * to {@link scalarPlaceholder} for scalars. Passes a *copy* of `visited` when
 * recursing into named types to avoid false cycle detection across sibling properties.
 *
 * @param program - The TypeSpec program.
 * @param type - Any TypeSpec type.
 * @param visited - Accumulator for cycle detection.
 * @param visibilityFilter - Optional HTTP visibility to filter model properties.
 * @returns A JSON-serializable value.
 */
export function jsonValueForType(
  program: Program,
  type: Type,
  visited: Set<Type>,
  visibilityFilter?: Visibility,
): unknown {
  switch (type.kind) {
    case "String":
      return type.value;
    case "Number":
      return type.value;
    case "Boolean":
      return type.value;
    case "Tuple":
      return type.values.map((value) =>
        jsonValueForType(program, value, visited, visibilityFilter),
      );
    case "Model":
      if (isArrayModelType(program, type)) {
        const itemType = arrayElementType(type);
        return [
          itemType
            ? jsonValueForType(program, itemType, visited, visibilityFilter)
            : "unknown",
        ];
      }
      if (isRecordModelType(program, type)) {
        const valueType = type.indexer?.value;
        return {
          property: valueType
            ? jsonValueForType(program, valueType, visited, visibilityFilter)
            : "unknown",
        };
      }
      return jsonRepresentationForType(
        program,
        type,
        // Use a copy of `visited` so sibling properties don't incorrectly appear as cycles.
        new Set(visited),
        visibilityFilter,
      );
    case "Union": {
      const firstVariant = [...type.variants.values()][0];
      return firstVariant
        ? jsonValueForType(
            program,
            firstVariant.type,
            visited,
            visibilityFilter,
          )
        : (type.name ?? "union");
    }
    case "Enum":
    case "Scalar":
      return jsonRepresentationForType(
        program,
        type,
        new Set(visited),
        visibilityFilter,
      );
    default:
      return typeReference(program, type);
  }
}

/**
 * Returns a representative primitive placeholder value for a TypeSpec scalar.
 *
 * Walks the scalar's inheritance chain looking for a known built-in base name:
 * - `"string"` or any derived scalar → `"string"`
 * - `"boolean"` → `true`
 * - Numeric families (`int*`, `uint*`, `float*`, `numeric`) → `0`
 *
 * Falls back to the scalar's own name when no built-in is found.
 *
 * @param type - The scalar type to generate a placeholder for.
 */
export function scalarPlaceholder(type: Scalar): unknown {
  let current: Scalar | undefined = type;
  while (current) {
    if (current.name === "string") return "string";
    if (current.name === "boolean") return true;
    if (
      current.name.startsWith("int") ||
      current.name.startsWith("uint") ||
      current.name.startsWith("float") ||
      current.name.startsWith("numeric")
    ) {
      return 0;
    }
    current = current.baseScalar;
  }
  return type.name;
}
