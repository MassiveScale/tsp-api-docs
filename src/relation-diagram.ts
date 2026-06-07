import {
  isArrayModelType,
  isRecordModelType,
  walkPropertiesInherited,
  type Program,
  type Type,
} from "@typespec/compiler";
import type { OutputFormat } from "./lib.js";
import type { ServiceEntry } from "./service-entry.js";

interface ErRelationTarget {
  typeName: string;
  isArray: boolean;
}

export function buildRelationDiagram(
  program: Program,
  service: ServiceEntry,
  format: OutputFormat = "azure-devops",
): string {
  const knownTypeNames = new Set(service.rawTypes.map((t) => t.name));
  const entities: string[] = [];
  const relationships: string[] = [];
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

function resolveErRelationTarget(
  program: Program,
  type: Type,
  knownTypeNames: Set<string>,
): ErRelationTarget | undefined {
  if (type.kind === "Model") {
    if (isArrayModelType(program, type)) {
      const valueType = type.indexer?.value;
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

function erAttrType(program: Program, type: Type): string {
  switch (type.kind) {
    case "Scalar":
      return sanitizeErName(type.name);
    case "Model":
      if (isArrayModelType(program, type)) {
        const valueType = type.indexer?.value;
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

function sanitizeErName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-~]/g, "_").replace(/^([0-9])/, "_$1");
}
