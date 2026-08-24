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
import {
  breadcrumbsForType,
  describeSummary,
  formatExternalDocsLink,
} from "./utils.js";
import { modelProperties } from "./operation-page.js";
import type { ParameterDoc } from "./operation-page.js";

/**
 * Documentation for a single variant of a TypeSpec `union`.
 */
export interface VariantDoc {
  /**
   * Variant name, or `"variant"` when the variant uses a symbol name (anonymous
   * variants created by `@typespec/compiler` internals have symbol descriptions).
   */
  name: string;
  /** Markdown type reference string for the variant's type. */
  type: string;
  /** Raw summary from `@summary` or `@doc` on the variant, if present. */
  summary?: string;
  /** Summary falling back to {@link FALLBACK_SUMMARY} when absent. */
  summaryOrFallback: string;
}

/**
 * Documentation for a single member of a TypeSpec `enum`.
 */
export interface MemberDoc {
  /** Member name as declared in the TypeSpec source. */
  name: string;
  /**
   * Wire value of the member. When an explicit value is not provided via
   * `= "value"`, the member name is used as both name and value.
   */
  value: string;
  /** Raw summary from `@summary` or `@doc` on the member, if present. */
  summary?: string;
  /** Summary falling back to {@link FALLBACK_SUMMARY} when absent. */
  summaryOrFallback: string;
}

/**
 * The complete data model passed to the `type.md.hbs` and `enum.md.hbs`
 * Handlebars templates.
 *
 * All four type kinds (Model, Union, Enum, Scalar) share this interface.
 * Fields irrelevant to a specific kind are set to empty arrays or `undefined`.
 */
export interface TypePageModel {
  /** Type name as declared in the TypeSpec source. */
  title: string;
  /** Raw summary from `@summary` or `@doc` on the type, if present. */
  summary?: string;
  /** Deprecation message from `@deprecated`, if present. */
  deprecated?: string;
  /** Markdown link rendered from `@externalDocs` on the type, if present. */
  externalDocs?: string;
  /** API version label, e.g. `"v1.0"`, when the service is versioned. */
  versionLabel?: string;
  /** Resolved API name from emitter options, if set. */
  apiName?: string;
  /** TypeSpec kind string: `"Model"`, `"Union"`, `"Enum"`, or `"Scalar"`. */
  kind: string;
  /** Ordered breadcrumb labels, e.g. `["API", "Widget"]`. */
  breadcrumbs: string[];
  /**
   * Markdown reference string for the base/parent type:
   * - Models: the `extends` base model, or `"Array"` / `"Record"` for generics.
   * - Scalars: the base scalar.
   * - Unions / Enums: always `undefined`.
   */
  baseType?: string;
  /** Documented properties (Models only; empty for all other kinds). */
  properties: ParameterDoc[];
  /** Operations that use this type as a parameter or return type. */
  methods: OperationSummary[];
  /** Union variants (Unions only; empty for all other kinds). */
  variants: VariantDoc[];
  /** Enum members (Enums only; empty for all other kinds). */
  members: MemberDoc[];
  /** Examples from `@example` decorators on the type. */
  examples: JsonExampleDoc[];
  /**
   * A JSON-stringified representative value for this type.
   * Empty string for Enums (which use `members` instead).
   */
  jsonRepresentation: string;
}

/**
 * Builds the complete {@link TypePageModel} for a single TypeSpec type.
 *
 * Dispatches to kind-specific logic for Model, Union, Enum, and Scalar.
 * The `methods` list is pre-computed by {@link buildRelatedMethodsByType} and
 * passed in rather than derived here, since it requires inspecting all operations.
 *
 * @param program - The TypeSpec program.
 * @param type - The type to document.
 * @param methods - Related operations that reference this type.
 * @param typePathById - Map from entity ID to relative path for Markdown links.
 * @param versionLabel - Optional version string for versioned services.
 * @param apiName - Optional resolved API name from emitter options.
 * @returns A fully-populated type page data model.
 */
export function buildTypePage(
  program: Program,
  type: Model | Enum | Union | Scalar,
  methods: OperationSummary[],
  typePathById: Map<string, string>,
  versionLabel?: string,
  apiName?: string,
): TypePageModel {
  const summary = getSummary(program, type) ?? getDoc(program, type);

  // Path adjuster: type pages live in `resources/`, so links to other types
  // should strip the `resources/` prefix (they're siblings in the same folder).
  const makeRef = makeLinkedTypeRef(program, typePathById, (p) =>
    p.replace(/^resources\//, ""),
  );

  if (type.kind === "Model") {
    return {
      title: type.name,
      summary,
      deprecated: getDeprecated(program, type),
      externalDocs: formatExternalDocsLink(program, type),
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
      externalDocs: formatExternalDocsLink(program, type),
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
      externalDocs: formatExternalDocsLink(program, type),
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
    externalDocs: formatExternalDocsLink(program, type),
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

/**
 * Converts a TypeSpec `UnionVariant` into a {@link VariantDoc}.
 *
 * Variant names that are symbols (anonymous variants created internally by the
 * compiler) use their symbol description, falling back to `"variant"`.
 *
 * @param program - The TypeSpec program.
 * @param variant - The union variant to document.
 * @param makeRef - A type-reference function for Markdown links.
 */
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

/**
 * Converts a TypeSpec `EnumMember` into a {@link MemberDoc}.
 *
 * When no explicit wire value is present (`member.value === undefined`),
 * the member name is used as the value, matching TypeSpec's own default behavior.
 *
 * @param program - The TypeSpec program.
 * @param member - The enum member to document.
 */
export function enumMember(program: Program, member: EnumMember): MemberDoc {
  return {
    name: member.name,
    value: member.value === undefined ? member.name : String(member.value),
    summary: getSummary(program, member) ?? getDoc(program, member),
    summaryOrFallback: describeSummary(program, member),
  };
}
