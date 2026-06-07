import {
  getDeprecated,
  getDoc,
  getExamples,
  getSummary,
  type Enum,
  type EnumMember,
  type Model,
  type Program,
  type Scalar,
  type Union,
  type UnionVariant,
} from "@typespec/compiler";
import type { JsonExampleDoc } from "./operation-examples.js";
import { typedExamples } from "./operation-examples.js";
import type { OperationSummary } from "./service-entry.js";
import {
  jsonRepresentationForType,
  makeLinkedTypeRef,
  modelBaseType,
} from "./type-ref.js";
import { breadcrumbsForType, describeSummary } from "./utils.js";
import { modelProperties } from "./operation-page.js";
import type { ParameterDoc } from "./operation-page.js";

export interface VariantDoc {
  name: string;
  type: string;
  summary?: string;
  summaryOrFallback: string;
}

export interface MemberDoc {
  name: string;
  value: string;
  summary?: string;
  summaryOrFallback: string;
}

export interface TypePageModel {
  title: string;
  summary?: string;
  deprecated?: string;
  versionLabel?: string;
  apiName?: string;
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

export function buildTypePage(
  program: Program,
  type: Model | Enum | Union | Scalar,
  methods: OperationSummary[],
  typePathById: Map<string, string>,
  versionLabel?: string,
  apiName?: string,
): TypePageModel {
  const summary = getSummary(program, type) ?? getDoc(program, type);

  const makeRef = makeLinkedTypeRef(program, typePathById, (p) =>
    p.replace(/^resources\//, ""),
  );

  if (type.kind === "Model") {
    return {
      title: type.name,
      summary,
      deprecated: getDeprecated(program, type),
      versionLabel,
      apiName,
      kind: type.kind,
      breadcrumbs: breadcrumbsForType(program, type),
      baseType: type.baseModel
        ? makeRef(type.baseModel)
        : modelBaseType(program, type),
      properties: modelProperties(program, type, makeRef),
      methods,
      variants: [],
      members: [],
      examples: typedExamples(program, type, getExamples(program, type)),
      jsonRepresentation: JSON.stringify(
        jsonRepresentationForType(program, type),
        null,
        2,
      ),
    };
  }

  if (type.kind === "Union") {
    return {
      title: type.name ?? "union",
      summary,
      deprecated: getDeprecated(program, type),
      versionLabel,
      apiName,
      kind: type.kind,
      breadcrumbs: breadcrumbsForType(program, type),
      baseType: undefined,
      properties: [],
      methods,
      variants: [...type.variants.values()].map((variant) =>
        unionVariant(program, variant, makeRef),
      ),
      members: [],
      examples: typedExamples(program, type, getExamples(program, type)),
      jsonRepresentation: JSON.stringify(
        jsonRepresentationForType(program, type),
        null,
        2,
      ),
    };
  }

  if (type.kind === "Enum") {
    return {
      title: type.name,
      summary,
      deprecated: getDeprecated(program, type),
      versionLabel,
      apiName,
      kind: type.kind,
      breadcrumbs: breadcrumbsForType(program, type),
      baseType: undefined,
      properties: [],
      methods,
      variants: [],
      members: [...type.members.values()].map((member) =>
        enumMember(program, member),
      ),
      examples: typedExamples(program, type, getExamples(program, type)),
      jsonRepresentation: "",
    };
  }

  // Scalar
  return {
    title: type.name,
    summary,
    deprecated: getDeprecated(program, type),
    versionLabel,
    apiName,
    kind: type.kind,
    breadcrumbs: breadcrumbsForType(program, type),
    baseType: type.baseScalar ? makeRef(type.baseScalar) : undefined,
    properties: [],
    methods,
    variants: [],
    members: [],
    examples: typedExamples(program, type, getExamples(program, type)),
    jsonRepresentation: JSON.stringify(
      jsonRepresentationForType(program, type),
      null,
      2,
    ),
  };
}

export function unionVariant(
  program: Program,
  variant: UnionVariant,
  makeRef: (type: import("@typespec/compiler").Type) => string,
): VariantDoc {
  return {
    name:
      typeof variant.name === "symbol"
        ? (variant.name.description ?? "variant")
        : variant.name,
    type: makeRef(variant.type),
    summary: getSummary(program, variant) ?? getDoc(program, variant),
    summaryOrFallback: describeSummary(program, variant),
  };
}

export function enumMember(program: Program, member: EnumMember): MemberDoc {
  return {
    name: member.name,
    value: member.value === undefined ? member.name : String(member.value),
    summary: getSummary(program, member) ?? getDoc(program, member),
    summaryOrFallback: describeSummary(program, member),
  };
}
