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

/** Returns the element type of an array model, checking both the indexer and the first property fallback. */
export function arrayElementType(type: Model): Type | undefined {
  return type.indexer?.value ?? [...type.properties.values()][0]?.type;
}

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

export function jsonRepresentationForType(
  program: Program,
  type: Model | Enum | Union | Scalar,
  visited = new Set<Type>(),
  visibilityFilter?: Visibility,
): unknown {
  if (visited.has(type)) {
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
      const firstMember = [...type.members.values()][0];
      return firstMember?.value ?? firstMember?.name ?? type.name;
    }
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
    case "Scalar":
      return scalarPlaceholder(type);
  }
}

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
