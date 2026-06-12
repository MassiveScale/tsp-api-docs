import {
  isArrayModelType,
  isRecordModelType,
  walkPropertiesInherited,
  type Program,
  type Type,
} from "@typespec/compiler";
import type { OutputFormat } from "./lib.js";
import type { ServiceEntry } from "./service-entry.js";
import { arrayElementType } from "./type-ref.js";

/**
 * Describes a resolved ER-diagram relationship target — the type at the other
 * end of a property reference, along with whether the relationship is one-to-many.
 */
interface ErRelationTarget {
  /** Name of the related type as it appears in the diagram. */
  typeName: string;
  /** `true` when the property holds a collection (array) of the related type. */
  isArray: boolean;
}

/**
 * Builds the full content of a `relation-diagram.md` file for a service.
 *
 * The diagram is a Mermaid `erDiagram` block containing one entity per named
 * type in the service, with attribute rows for each property, and relationship
 * lines between types that reference one another. Only relationships between
 * types known to the service (i.e. in `service.rawTypes`) are emitted.
 *
 * The Mermaid fence syntax differs by format:
 * - `azure-devops` uses `:::mermaid … :::` (ADO Wiki syntax).
 * - All other formats use the standard ` ```mermaid … ``` ` fence.
 *
 * @param program - The TypeSpec program.
 * @param service - The service entry whose types to diagram.
 * @param format - The output format, used to choose the Mermaid fence style.
 * @returns The full Markdown file content as a string.
 */
export function buildRelationDiagram(
  program: Program,
  service: ServiceEntry,
  format: OutputFormat = "azure-devops",
): string {
  const knownTypeNames = new Set(service.rawTypes.map((t) => t.name));
  const entities: string[] = [];
  const relationships: string[] = [];
  // Deduplicate relationships: a given (parent, child, propertyName) triple
  // can only appear once even if walkPropertiesInherited surfaces it multiple times.
  const seenRelationships = new Set<string>();

  for (const { name, type } of service.rawTypes) {
    const attrs: string[] = [];

    if (
      type.kind === "Model" &&
      !isArrayModelType(program, type) &&
      !isRecordModelType(program, type)
    ) {
      for (const prop of walkPropertiesInherited(type)) {
        const attrType = erAttrType(program, prop.type);
        attrs.push(`    ${attrType} ${sanitizeErName(prop.name)}`);

        const relTarget = resolveErRelationTarget(
          program,
          prop.type,
          knownTypeNames,
        );
        if (relTarget) {
          const relLabel = JSON.stringify(prop.name);
          const rel = relTarget.isArray
            ? `  ${name} ||--o{ ${relTarget.typeName} : ${relLabel}`
            : `  ${name} }o--|| ${relTarget.typeName} : ${relLabel}`;
          const key = `${name}|${relTarget.typeName}|${prop.name}`;
          if (!seenRelationships.has(key)) {
            seenRelationships.add(key);
            relationships.push(rel);
          }
        }
      }
    } else if (type.kind === "Enum") {
      for (const member of type.members.values()) {
        attrs.push(`    string ${sanitizeErName(member.name)}`);
      }
    } else if (type.kind === "Union") {
      for (const [variantName] of type.variants) {
        if (typeof variantName === "string") {
          attrs.push(`    string ${sanitizeErName(variantName)}`);
        }
      }
    } else if (type.kind === "Scalar") {
      attrs.push(`    ${sanitizeErName(type.name)} value`);
    }

    if (attrs.length > 0) {
      entities.push(`  ${name} {\n${attrs.join("\n")}\n  }`);
    } else {
      entities.push(`  ${name}`);
    }
  }

  const mermaidLines = ["erDiagram", ...entities];
  if (relationships.length > 0) {
    mermaidLines.push(...relationships);
  }

  const [open, close] =
    format === "azure-devops" ? [":::mermaid", ":::"] : ["```mermaid", "```"];
  return [
    "# Relation Diagram",
    "",
    open,
    mermaidLines.join("\n"),
    close,
    "",
  ].join("\n");
}

/**
 * Resolves the ER-diagram relationship target for a property type, if any.
 *
 * Returns a target only when the type (or its element type for arrays) is a
 * named type that exists in the service's known type set. Returns `undefined`
 * for primitives, anonymous models, record types, and types outside the service.
 *
 * @param program - The TypeSpec program.
 * @param type - The property type to inspect.
 * @param knownTypeNames - Set of named types that have their own diagram entity.
 */
function resolveErRelationTarget(
  program: Program,
  type: Type,
  knownTypeNames: Set<string>,
): ErRelationTarget | undefined {
  if (type.kind === "Model") {
    if (isArrayModelType(program, type)) {
      const valueType = arrayElementType(type);
      if (
        valueType &&
        (valueType.kind === "Model" ||
          valueType.kind === "Enum" ||
          valueType.kind === "Union") &&
        "name" in valueType &&
        valueType.name &&
        knownTypeNames.has(valueType.name)
      ) {
        return { typeName: valueType.name, isArray: true };
      }
      return undefined;
    }
    if (type.name && knownTypeNames.has(type.name)) {
      return { typeName: type.name, isArray: false };
    }
  }
  if (
    (type.kind === "Enum" || type.kind === "Union") &&
    type.name &&
    knownTypeNames.has(type.name)
  ) {
    return { typeName: type.name, isArray: false };
  }
  return undefined;
}

/**
 * Returns the Mermaid ER attribute type string for a TypeSpec type.
 *
 * Mermaid ER attribute types must be identifier-safe (no angle brackets, pipes,
 * etc.), so this function converts TypeSpec type kinds to safe type tokens.
 *
 * @param program - The TypeSpec program.
 * @param type - The property type to describe.
 */
function erAttrType(program: Program, type: Type): string {
  switch (type.kind) {
    case "Scalar":
      return sanitizeErName(type.name);
    case "Model":
      if (isArrayModelType(program, type)) {
        const valueType = arrayElementType(type);
        const elemName = valueType ? erAttrType(program, valueType) : "unknown";
        return `${elemName}_array`;
      }
      if (isRecordModelType(program, type)) return "map";
      if (type.name) return sanitizeErName(type.name);
      return "object";
    case "Enum":
      return sanitizeErName(type.name);
    case "Union":
      if (type.name) return sanitizeErName(type.name);
      return "union";
    case "String":
      return "string";
    case "Number":
      return "number";
    case "Boolean":
      return "boolean";
    default:
      return "unknown";
  }
}

/**
 * Strips characters from a name that are not allowed in a Mermaid ER identifier.
 *
 * Keeps alphanumeric characters, underscores, hyphens, and tildes.
 * Replaces everything else with `_`, and prepends `_` if the first character
 * is a digit (Mermaid identifiers may not start with a number).
 *
 * @param value - The raw property or type name.
 */
function sanitizeErName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-~]/g, "_").replace(/^([0-9])/, "_$1");
}
