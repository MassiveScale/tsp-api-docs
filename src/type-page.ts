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
import {
  describeWireShape,
  discriminatorPropertyNames,
  formatDiscriminatorValue,
  getPolymorphicInfo,
  inheritanceMemberships,
  unionMemberships,
  withNamesFirst,
  type DiscriminatorMembership,
  type PolymorphicInfo,
} from "./discriminators.js";
import type { JsonExampleDoc } from "./operation-examples.js";
import { typedExamples } from "./operation-examples.js";
import type {
  OperationSummary,
  PolymorphicOperationSummary,
} from "./service-entry.js";
import {
  jsonRepresentationForType,
  jsonPropertyName,
  jsonValueForPolymorphicVariant,
  makeLinkedTypeRef,
  modelBaseType,
  typeReference,
} from "./type-ref.js";
import {
  breadcrumbsForType,
  describeSummary,
  formatExternalDocsLink,
} from "./utils.js";
import { propertyDocs } from "./operation-page.js";
import type { ParameterDoc } from "./operation-page.js";
import {
  additionalPropertiesType,
  payloadBaseModel,
  payloadProperties,
} from "./payloads.js";

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
  /**
   * Discriminator value that selects this variant in a `@discriminated` union,
   * formatted as JSON (e.g. `"circle"`), or `"(any other value)"` for the
   * default variant. `undefined` for other unions.
   */
  discriminatorValue?: string;
  /** Raw summary from `@summary` or `@doc` on the variant, if present. */
  summary?: string;
  /** Summary falling back to {@link FALLBACK_SUMMARY} when absent. */
  summaryOrFallback: string;
}

/**
 * How a polymorphic type (a `@discriminator` model or a `@discriminated`
 * union) tells its variants apart.
 */
export interface DiscriminatorDoc {
  /** Wire name of the discriminator property, e.g. `"kind"`. */
  propertyName: string;
  /** `"object"` when a union wraps each variant, otherwise `"none"`. */
  envelope: "object" | "none";
  /** Property that holds the wrapped variant when `envelope` is `"object"`. */
  envelopePropertyName?: string;
  /** One-sentence description of where the discriminator sits in the JSON. */
  description: string;
}

/**
 * One derived model of a `@discriminator` base, as listed on the base's page.
 */
export interface DerivedTypeDoc {
  /** Discriminator value that selects the derived type, formatted as JSON. */
  value: string;
  /** Markdown type reference string for the derived type. */
  type: string;
  /** Raw summary from `@summary` or `@doc` on the derived type, if present. */
  summary?: string;
  /** Summary falling back to {@link FALLBACK_SUMMARY} when absent. */
  summaryOrFallback: string;
}

/**
 * A polymorphic type that selects the documented type by a discriminator value.
 */
export interface DiscriminatorValueDoc {
  /** Wire name of the discriminator property, e.g. `"kind"`. */
  propertyName: string;
  /** The value that selects the documented type, formatted as JSON. */
  value: string;
  /** Markdown type reference string for the polymorphic type. */
  polymorphicType: string;
}

/**
 * Service-wide context for {@link buildTypePage} that a single type cannot
 * work out on its own.
 */
export interface TypePageContext {
  /**
   * Operations that use a polymorphic type able to carry this type, but not
   * this type directly. See `buildPolymorphicMethodsByType`.
   */
  polymorphicMethods?: PolymorphicOperationSummary[];
  /** The service's documented unions, used to find discriminated memberships. */
  unions?: Union[];
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
   * - Models: the nearest `extends` base model that is not a metadata-only or
   *   response model, or `"Array"` / `"Record"` for generics.
   * - Scalars: the base scalar.
   * - Unions / Enums: always `undefined`.
   */
  baseType?: string;
  /**
   * Documented properties (Models only; empty for all other kinds). Excludes
   * `@header`, `@cookie` and `@statusCode` properties, which are not data.
   */
  properties: ParameterDoc[];
  /** Operations that use this type as a parameter or return type. */
  methods: OperationSummary[];
  /**
   * Operations that use a polymorphic type able to carry this type (a
   * discriminated base model, or a discriminated union listing it), but not
   * this type directly. Each entry names that type in `via`.
   */
  polymorphicMethods: PolymorphicOperationSummary[];
  /**
   * Set when this type is polymorphic: a `@discriminator` model or a
   * `@discriminated` union.
   */
  discriminator?: DiscriminatorDoc;
  /** Derived types of a `@discriminator` model; empty for all other types. */
  derivedTypes: DerivedTypeDoc[];
  /**
   * Markdown type reference string for the type of the additional properties
   * a model accepts beside its declared ones (`...Record<string>`), if any.
   */
  additionalProperties?: string;
  /**
   * Polymorphic types that select this type by a discriminator value, nearest
   * first (e.g. `kind` is `"dog"` in `Pet`).
   */
  discriminatorValues: DiscriminatorValueDoc[];
  /** Union variants (Unions only; empty for all other kinds). */
  variants: VariantDoc[];
  /** Enum members (Enums only; empty for all other kinds). */
  members: MemberDoc[];
  /** Examples from `@example` decorators on the type. */
  examples: JsonExampleDoc[];
  /**
   * A JSON-stringified representative value for this type.
   * Empty string for Enums (which use `members` instead). For a polymorphic
   * type this is its first variant, as sent on the wire.
   */
  jsonRepresentation: string;
  /**
   * For a polymorphic type, the JSON sent for each variant, titled with the
   * variant's type name; empty for all other types.
   */
  variantRepresentations: JsonExampleDoc[];
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
 * @param context - Service-wide polymorphism context (see {@link TypePageContext}).
 * @returns A fully-populated type page data model.
 */
export function buildTypePage(
  program: Program,
  type: Model | Enum | Union | Scalar,
  methods: OperationSummary[],
  typePathById: Map<string, string>,
  versionLabel?: string,
  apiName?: string,
  context: TypePageContext = {},
): TypePageModel {
  const summary = getSummary(program, type) ?? getDoc(program, type);

  // Path adjuster: type pages live in `resources/`, so links to other types
  // should strip the `resources/` prefix (they're siblings in the same folder).
  const makeRef = makeLinkedTypeRef(program, typePathById, (p) =>
    p.replace(/^resources\//, ""),
  );

  const polymorphic = getPolymorphicInfo(program, type);
  const memberships = [
    ...(type.kind === "Model" ? inheritanceMemberships(program, type) : []),
    ...unionMemberships(program, type, context.unions ?? []),
  ];
  const polymorphism = {
    polymorphicMethods: context.polymorphicMethods ?? [],
    discriminator: polymorphic ? discriminatorDoc(polymorphic) : undefined,
    derivedTypes: [] as DerivedTypeDoc[],
    discriminatorValues: memberships.map((membership) =>
      discriminatorValueDoc(membership, makeRef),
    ),
    variantRepresentations: polymorphic
      ? variantRepresentations(program, polymorphic)
      : [],
  };

  if (type.kind === "Model") {
    const baseModel = payloadBaseModel(program, type);
    const additionalProperties = additionalPropertiesType(program, type);
    return {
      title: type.name,
      summary,
      deprecated: getDeprecated(program, type),
      externalDocs: formatExternalDocsLink(program, type),
      versionLabel,
      apiName,
      kind: type.kind,
      breadcrumbs: breadcrumbsForType(program, type),
      baseType: baseModel ? makeRef(baseModel) : modelBaseType(program, type),
      additionalProperties: additionalProperties
        ? makeRef(additionalProperties)
        : undefined,
      properties: modelPropertyDocs(
        program,
        type,
        polymorphic,
        memberships,
        makeRef,
      ),
      methods,
      ...polymorphism,
      derivedTypes: polymorphic
        ? polymorphic.variants.map((variant) => ({
            value: formatDiscriminatorValue(variant.value),
            type: makeRef(variant.type),
            summary:
              getSummary(program, variant.type) ??
              getDoc(program, variant.type),
            summaryOrFallback: describeSummary(program, variant.type),
          }))
        : [],
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
      ...polymorphism,
      variants: [...type.variants.values()].map((variant) => ({
        ...unionVariant(program, variant, makeRef),
        discriminatorValue: polymorphic
          ? typeof variant.name === "string"
            ? formatDiscriminatorValue(variant.name)
            : "(any other value)"
          : undefined,
      })),
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
      ...polymorphism,
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
    ...polymorphism,
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
 * Documents the payload properties of a model, with discriminators first.
 *
 * A discriminator without a `@doc` gets a generated summary. A `@discriminator`
 * base that does not declare its discriminator property (TypeSpec allows this:
 * only the derived models must) gets a row for it, typed as the union of the
 * derived types' values, because every payload of the base carries it.
 *
 * @param program - The TypeSpec program.
 * @param model - The model whose properties to document.
 * @param polymorphic - The model's own discriminator, if it has one.
 * @param memberships - The polymorphic types that select this model.
 * @param makeRef - A type-reference function for Markdown links.
 */
function modelPropertyDocs(
  program: Program,
  model: Model,
  polymorphic: PolymorphicInfo | undefined,
  memberships: DiscriminatorMembership[],
  makeRef: (type: import("@typespec/compiler").Type) => string,
): ParameterDoc[] {
  const properties = payloadProperties(program, model);
  const docs = propertyDocs(program, properties, makeRef);
  const discriminators = new Set([
    ...discriminatorPropertyNames(program, model),
    ...memberships.map((membership) => membership.info.propertyName),
  ]);

  properties.forEach((property, index) => {
    const value = discriminatorLiteral(property.type);
    if (
      value !== undefined &&
      discriminators.has(property.name) &&
      !docs[index].summary
    ) {
      docs[index].summaryOrFallback =
        `Discriminator. Always \`${formatDiscriminatorValue(value)}\` for this type.`;
    }
  });

  if (polymorphic && polymorphic.envelope === "none") {
    const summary =
      "Discriminator that selects the concrete type. See Derived types.";
    const doc = docs.find((d) => d.name === polymorphic.propertyName);
    if (!doc) {
      docs.unshift({
        name: polymorphic.propertyName,
        type:
          polymorphic.variants
            .map((variant) => formatDiscriminatorValue(variant.value))
            .join(" | ") || "string",
        requiredLabel: "Yes",
        summaryOrFallback: summary,
      });
    } else if (!doc.summary) {
      doc.summaryOrFallback = summary;
    }
  }

  // Readers write the JSON, so rows use each property's wire name.
  const wireNames = new Map(
    properties.map((property) => [
      property.name,
      jsonPropertyName(program, property),
    ]),
  );
  return withNamesFirst(
    docs,
    (doc) => doc.name,
    discriminatorPropertyNames(program, model),
  ).map((doc) => ({ ...doc, name: wireNames.get(doc.name) ?? doc.name }));
}

/**
 * Returns the fixed string value of a discriminator property type — a string
 * literal or a string-valued enum member — or `undefined` for any other type.
 *
 * @param type - The discriminator property's type.
 */
function discriminatorLiteral(
  type: import("@typespec/compiler").Type,
): string | undefined {
  if (type.kind === "String") return type.value;
  if (type.kind === "EnumMember" && typeof type.value !== "number") {
    return type.value ?? type.name;
  }
  return undefined;
}

/**
 * Converts a {@link PolymorphicInfo} into the {@link DiscriminatorDoc} shown
 * on the polymorphic type's own page.
 *
 * @param info - The polymorphic type.
 */
function discriminatorDoc(info: PolymorphicInfo): DiscriminatorDoc {
  return {
    propertyName: info.propertyName,
    envelope: info.envelope,
    envelopePropertyName: info.envelopePropertyName,
    description: describeWireShape(info),
  };
}

/**
 * Converts a {@link DiscriminatorMembership} into a {@link DiscriminatorValueDoc}.
 *
 * @param membership - The polymorphic type that selects the documented type.
 * @param makeRef - A type-reference function for Markdown links.
 */
function discriminatorValueDoc(
  membership: DiscriminatorMembership,
  makeRef: (type: import("@typespec/compiler").Type) => string,
): DiscriminatorValueDoc {
  return {
    propertyName: membership.info.propertyName,
    value: formatDiscriminatorValue(membership.value),
    polymorphicType: makeRef(membership.info.type),
  };
}

/**
 * Renders the JSON sent for each variant of a polymorphic type.
 *
 * @param program - The TypeSpec program.
 * @param info - The polymorphic type.
 */
function variantRepresentations(
  program: Program,
  info: PolymorphicInfo,
): JsonExampleDoc[] {
  return info.variants.map((variant) => ({
    title: typeReference(program, variant.type),
    description: `\`${info.propertyName}\`: \`${formatDiscriminatorValue(variant.value)}\``,
    json: JSON.stringify(
      jsonValueForPolymorphicVariant(
        program,
        info,
        variant,
        new Set([info.type]),
      ),
      null,
      2,
    ),
  }));
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
