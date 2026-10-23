/**
 * @module discriminators
 *
 * Describes polymorphic payloads: a model decorated with `@discriminator` and
 * its derived models, or a union decorated with `@discriminated`. Every page
 * that documents such a type (type pages, operation pages, examples, and the
 * relation diagram) reads the discriminator through this module.
 *
 * Variants come from the compiler's own helpers
 * (`getDiscriminatedUnionFromInheritance` and `getDiscriminatedUnion`), the
 * same ones `@massivescale/tsp-aspnetcore-api` uses, so the documented values
 * match what generated code serializes.
 */

import {
  getDiscriminatedUnion,
  getDiscriminatedUnionFromInheritance,
  getDiscriminator,
  resolveEncodedName,
  type Model,
  type ModelProperty,
  type Program,
  type Type,
  type Union,
} from "@typespec/compiler";
import {
  isCollectionModel,
  isHttpEnvelopeModel,
  isSameDeclaration,
} from "./payloads.js";

/** One concrete shape a polymorphic type can take on the wire. */
export interface PolymorphicVariant {
  /** Discriminator value that selects this variant, e.g. `"dog"`. */
  value: string;
  /** The type sent for this value. */
  type: Type;
}

/** How a polymorphic type tells its variants apart on the wire. */
export interface PolymorphicInfo {
  /** The polymorphic type: a `@discriminator` model or a `@discriminated` union. */
  type: Model | Union;
  /**
   * JSON wire name of the discriminator property, e.g. `"kind"`, or its
   * `@encodedName` for `application/json` when one is set.
   */
  propertyName: string;
  /**
   * TypeSpec name of the discriminator property, for looking the property up
   * on a model. Equal to {@link propertyName} unless it has an `@encodedName`.
   */
  logicalName: string;
  /**
   * `"none"` when the discriminator sits alongside the variant's own
   * properties (always the case for `@discriminator` models), or `"object"`
   * when a `@discriminated` union wraps the variant as
   * `{ "<propertyName>": "<value>", "<envelopePropertyName>": { ... } }`.
   */
  envelope: "object" | "none";
  /** Property that holds the wrapped variant when `envelope` is `"object"`. */
  envelopePropertyName?: string;
  /** Variants in declaration order. */
  variants: PolymorphicVariant[];
}

/**
 * A polymorphic type that selects `type` by one of its discriminator values.
 */
export interface DiscriminatorMembership {
  /** The polymorphic type and its discriminator. */
  info: PolymorphicInfo;
  /** The discriminator value that selects the member. */
  value: string;
  /**
   * The variant that carries {@link value}: the member itself, or for a
   * model, the ancestor on its branch that the polymorphic type lists (`Fish`
   * for `Shark extends Fish extends Pet`).
   */
  variant: Type;
}

/**
 * Returns how `type` is discriminated, or `undefined` when it is not a
 * `@discriminator` model or a `@discriminated` union.
 *
 * Derived models that are HTTP envelopes (e.g. a response model with an
 * explicit `@body`) are left out of the variants, because they have no data
 * shape of their own.
 *
 * @param program - The TypeSpec program.
 * @param type - The type to inspect.
 */
export function getPolymorphicInfo(
  program: Program,
  type: Type,
): PolymorphicInfo | undefined {
  if (type.kind === "Model") {
    const discriminator = getDiscriminator(program, type);
    if (!discriminator) return undefined;
    const [union] = getDiscriminatedUnionFromInheritance(type, discriminator);
    const variants = [...union.variants]
      .filter(([, model]) => !isHttpEnvelopeModel(program, model))
      .map(([value, model]) => ({ value, type: model }));
    return {
      type,
      propertyName: discriminatorWireName(
        program,
        type,
        variants,
        discriminator.propertyName,
      ),
      logicalName: discriminator.propertyName,
      envelope: "none",
      variants,
    };
  }

  if (type.kind === "Union") {
    const [union] = getDiscriminatedUnion(program, type);
    if (!union) return undefined;
    return {
      type,
      propertyName: union.options.discriminatorPropertyName,
      logicalName: union.options.discriminatorPropertyName,
      envelope: union.options.envelope,
      envelopePropertyName:
        union.options.envelope === "object"
          ? union.options.envelopePropertyName
          : undefined,
      variants: [...union.variants].map(([value, variantType]) => ({
        value,
        type: variantType,
      })),
    };
  }

  return undefined;
}

/**
 * Returns the JSON wire name of a `@discriminator` property: the
 * `@encodedName` of the property where the base (or one of its ancestors)
 * declares it, otherwise where the first derived model declares it, otherwise
 * the TypeSpec name itself.
 *
 * @param program - The TypeSpec program.
 * @param base - The `@discriminator` model.
 * @param variants - Its derived models.
 * @param name - The discriminator's TypeSpec property name.
 */
function discriminatorWireName(
  program: Program,
  base: Model,
  variants: PolymorphicVariant[],
  name: string,
): string {
  const declared = [base, ...variants.map((variant) => variant.type)]
    .filter((candidate): candidate is Model => candidate.kind === "Model")
    .map((candidate) => findProperty(candidate, name))
    .find((property) => property !== undefined);
  return declared
    ? resolveEncodedName(program, declared, "application/json")
    : name;
}

/**
 * Returns the property `name` declared on `model` or one of its bases.
 *
 * @param model - The model to search.
 * @param name - The property's TypeSpec name.
 */
function findProperty(model: Model, name: string): ModelProperty | undefined {
  for (
    let current: Model | undefined = model;
    current;
    current = current.baseModel
  ) {
    const property = current.properties.get(name);
    if (property) return property;
  }
  return undefined;
}

/**
 * Returns {@link getPolymorphicInfo} only when the type has at least one
 * variant, i.e. when a payload of this type can take more than its declared
 * shape.
 *
 * @param program - The TypeSpec program.
 * @param type - The type to inspect.
 */
export function getPolymorphicVariants(
  program: Program,
  type: Type,
): PolymorphicInfo | undefined {
  const info = getPolymorphicInfo(program, type);
  return info && info.variants.length > 0 ? info : undefined;
}

/**
 * Returns the polymorphic types (with at least one variant) a body of type
 * `type` carries at its top level: the type itself, the items of an array or
 * record, or the variants of a plain union, in the order they appear. Model
 * properties are not searched; their types are documented on their own pages.
 *
 * @param program - The TypeSpec program.
 * @param type - The body type.
 * @param visited - Types already inspected. Guards against recursive unions.
 */
export function polymorphicTypesIn(
  program: Program,
  type: Type,
  visited: Set<Type> = new Set(),
): PolymorphicInfo[] {
  if (visited.has(type)) return [];
  visited.add(type);

  const info = getPolymorphicVariants(program, type);
  if (info) return [info];

  if (
    type.kind === "Model" &&
    isCollectionModel(program, type) &&
    type.indexer
  ) {
    return polymorphicTypesIn(program, type.indexer.value, visited);
  }
  if (type.kind === "Union") {
    return [...type.variants.values()].flatMap((variant) =>
      polymorphicTypesIn(program, variant.type, visited),
    );
  }
  return [];
}

/**
 * Returns the discriminated base models that select `model` by a
 * discriminator value, nearest base first. Each base matches the variant on
 * `model`'s own inheritance branch, so a model nested two levels deep
 * (`Shark extends Fish extends Pet`, where both bases carry `@discriminator`)
 * has one membership per level: `fishKind` = `"shark"` in `Fish`, and
 * `kind` = `"fish"` in `Pet` through `Fish`.
 *
 * @param program - The TypeSpec program.
 * @param model - The derived model.
 */
export function inheritanceMemberships(
  program: Program,
  model: Model,
): DiscriminatorMembership[] {
  const memberships: DiscriminatorMembership[] = [];
  // The models from `model` up to (not including) the base being checked.
  const branch: Model[] = [model];
  for (let base = model.baseModel; base; base = base.baseModel) {
    const info = getPolymorphicInfo(program, base);
    const variant = info?.variants.find((candidate) =>
      branch.some((member) => isSameDeclaration(candidate.type, member)),
    );
    if (info && variant) {
      memberships.push({ info, value: variant.value, variant: variant.type });
    }
    branch.push(base);
  }
  return memberships;
}

/**
 * Returns the `@discriminated` unions among `unions` that list `type` as a
 * named variant.
 *
 * @param program - The TypeSpec program.
 * @param type - The variant type.
 * @param unions - Candidate unions, typically the service's documented unions.
 */
export function unionMemberships(
  program: Program,
  type: Type,
  unions: Iterable<Union>,
): DiscriminatorMembership[] {
  const memberships: DiscriminatorMembership[] = [];
  for (const union of unions) {
    const info = getPolymorphicInfo(program, union);
    const variant = info?.variants.find((candidate) =>
      isSameDeclaration(candidate.type, type),
    );
    if (info && variant) {
      memberships.push({ info, value: variant.value, variant: variant.type });
    }
  }
  return memberships;
}

/**
 * Returns the discriminator property names that apply to `model`, from the
 * root of its hierarchy down to `model` itself. Serializers such as
 * `System.Text.Json` expect discriminators before other properties, so JSON
 * examples and property tables list these first.
 *
 * @param program - The TypeSpec program.
 * @param model - The model to inspect.
 */
export function discriminatorPropertyNames(
  program: Program,
  model: Model,
): string[] {
  const names: string[] = [];
  for (
    let current: Model | undefined = model;
    current;
    current = current.baseModel
  ) {
    const discriminator = getDiscriminator(program, current);
    if (discriminator && !names.includes(discriminator.propertyName)) {
      names.unshift(discriminator.propertyName);
    }
  }
  return names;
}

/**
 * Returns `items` with the entries named in `names` moved to the front, in
 * the order of `names`. Every other entry keeps its relative order.
 *
 * @param items - The items to reorder.
 * @param nameOf - Returns the name of an item.
 * @param names - The names to move to the front.
 */
export function withNamesFirst<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  names: readonly string[],
): T[] {
  if (names.length === 0) return [...items];
  const first = names.flatMap((name) =>
    items.filter((item) => nameOf(item) === name),
  );
  return [...first, ...items.filter((item) => !names.includes(nameOf(item)))];
}

/**
 * Formats a discriminator value as it appears in JSON, e.g. `"dog"`.
 *
 * @param value - The raw discriminator value.
 */
export function formatDiscriminatorValue(value: string): string {
  return JSON.stringify(value);
}

/**
 * Describes the variants of a polymorphic type as a sentence fragment, e.g.
 * `` `"dog"` for [Dog](Dog.md), `"cat"` for [Cat](Cat.md) ``.
 *
 * @param info - The polymorphic type.
 * @param makeRef - Renders a (possibly linked) type reference.
 */
export function describeVariants(
  info: PolymorphicInfo,
  makeRef: (type: Type) => string,
): string {
  return info.variants
    .map(
      (variant) =>
        `\`${formatDiscriminatorValue(variant.value)}\` for ${makeRef(variant.type)}`,
    )
    .join(", ");
}

/**
 * Describes where the discriminator sits in the JSON payload.
 *
 * @param info - The polymorphic type.
 */
export function describeWireShape(info: PolymorphicInfo): string {
  if (info.envelope === "object") {
    return `The \`${info.propertyName}\` property names the variant and \`${info.envelopePropertyName}\` holds it: \`{ "${info.propertyName}": "…", "${info.envelopePropertyName}": { … } }\`.`;
  }
  return `The \`${info.propertyName}\` property names the concrete type and sits alongside that type's own properties.`;
}

/**
 * Describes a polymorphic type for a request or response body, e.g.
 * `` [Pet](Pet.md) is polymorphic: `kind` selects `"dog"` for [Dog](Dog.md)… ``.
 *
 * @param info - The polymorphic type.
 * @param makeRef - Renders a (possibly linked) type reference.
 */
export function describePolymorphism(
  info: PolymorphicInfo,
  makeRef: (type: Type) => string,
): string {
  return `${makeRef(info.type)} is polymorphic: \`${info.propertyName}\` selects ${describeVariants(info, makeRef)}.`;
}
