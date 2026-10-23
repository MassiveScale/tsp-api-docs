import {
  getEncode,
  getFormat,
  getMaxItems,
  getMaxLength,
  getMaxValue,
  getMaxValueExclusive,
  getMinItems,
  getMinLength,
  getMinValue,
  getMinValueExclusive,
  getTypeName,
  isArrayModelType,
  isGlobalNamespace,
  resolveEncodedName,
  serializeValueAsJson,
  type EncodeData,
  type Enum,
  type Model,
  type ModelProperty,
  type Namespace,
  type Program,
  type Scalar,
  type Type,
  type Union,
} from "@typespec/compiler";
import { isVisible, type Visibility } from "@typespec/http";
import {
  discriminatorPropertyNames,
  getPolymorphicVariants,
  withNamesFirst,
  type PolymorphicInfo,
  type PolymorphicVariant,
} from "./discriminators.js";
import {
  additionalPropertiesType,
  isPlainRecordModel,
  payloadProperties,
} from "./payloads.js";
import { asRecord, namespaceName } from "./utils.js";

/**
 * Returns the name a property has in a JSON body: its `@encodedName` for
 * `application/json` when one is set, otherwise its TypeSpec name.
 *
 * @param program - The TypeSpec program.
 * @param property - The model property.
 */
export function jsonPropertyName(
  program: Program,
  property: ModelProperty,
): string {
  return resolveEncodedName(program, property, "application/json");
}

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
      if (isPlainRecordModel(program, type)) {
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
    case "EnumMember":
      return `${type.enum.name}.${type.name}`;
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
        if (isPlainRecordModel(program, type)) {
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
      case "EnumMember":
        return `${linkedRef(type.enum)}.${type.name}`;
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

  if (isPlainRecordModel(program, model)) {
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
 * `@header`, `@cookie` and `@statusCode` properties are never included, because
 * they never travel in a JSON body (see {@link payloadProperties}).
 *
 * @param program - The TypeSpec program.
 * @param type - A named type (Model, Enum, Union, or Scalar) to represent.
 * @param visited - Accumulator for cycle detection; pass `new Set()` at the call site.
 * @param visibilityFilter - Optional HTTP visibility to filter model properties.
 * @param property - The model property this type occurrence came from, if any.
 *   Used to resolve `@encode` applied directly on the property (as opposed to
 *   on the scalar's declaration) — see {@link scalarPlaceholder}.
 * @returns A JSON-serializable value (object, string, number, boolean, or array).
 */
export function jsonRepresentationForType(
  program: Program,
  type: Model | Enum | Union | Scalar,
  visited = new Set<Type>(),
  visibilityFilter?: Visibility,
  property?: ModelProperty,
): unknown {
  if (visited.has(type)) {
    // Cycle detected — substitute the type name to break the recursion.
    return typeReference(program, type);
  }

  visited.add(type);

  switch (type.kind) {
    case "Model": {
      // A polymorphic base is never sent as itself: show its first variant.
      const polymorphic = getPolymorphicVariants(program, type);
      if (polymorphic) {
        return jsonValueForPolymorphicVariant(
          program,
          polymorphic,
          polymorphic.variants[0],
          visited,
          visibilityFilter,
        );
      }

      const jsonObject: Record<string, unknown> = {};
      for (const property of withNamesFirst(
        payloadProperties(program, type),
        (property) => property.name,
        discriminatorPropertyNames(program, type),
      )) {
        if (
          visibilityFilter !== undefined &&
          !isVisible(program, property, visibilityFilter)
        ) {
          continue;
        }
        // A declared default (including `null`) wins over a generated sample.
        const declaredDefault = defaultValueJson(program, property);
        jsonObject[jsonPropertyName(program, property)] =
          declaredDefault !== undefined
            ? declaredDefault
            : jsonValueForType(
                program,
                property.type,
                visited,
                visibilityFilter,
                property,
              );
      }
      const additional = additionalPropertiesType(program, type);
      if (additional) {
        jsonObject[additionalPropertyKey(program, type)] = jsonValueForType(
          program,
          additional,
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
      const polymorphic = getPolymorphicVariants(program, type);
      if (polymorphic) {
        return jsonValueForPolymorphicVariant(
          program,
          polymorphic,
          polymorphic.variants[0],
          visited,
          visibilityFilter,
        );
      }
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
      return scalarPlaceholder(program, type, property);
  }
}

/**
 * Produces a representative JSON-serializable value for any TypeSpec type,
 * including literals, tuples, unions, arrays, records, and named types.
 *
 * Delegates to {@link jsonRepresentationForType} for named structural types and
 * to {@link scalarPlaceholder} for scalars. Passes a *copy* of `visited` when
 * recursing into named types to avoid false cycle detection across sibling properties.
 * Arrays, records and unions are tracked too, so a recursive type such as
 * `union Node { Node[], string }` renders as an empty array (or the union's
 * name) at the point it repeats instead of recursing forever.
 *
 * @param program - The TypeSpec program.
 * @param type - Any TypeSpec type.
 * @param visited - Accumulator for cycle detection.
 * @param visibilityFilter - Optional HTTP visibility to filter model properties.
 * @param property - The model property this type occurrence came from, if any.
 *   Used to resolve `@encode(string)` on boolean properties so the placeholder
 *   value reflects the actual wire representation.
 * @returns A JSON-serializable value.
 */
export function jsonValueForType(
  program: Program,
  type: Type,
  visited: Set<Type>,
  visibilityFilter?: Visibility,
  property?: ModelProperty,
): unknown {
  switch (type.kind) {
    case "String":
      return type.value;
    case "Number":
      return type.value;
    case "Boolean":
      return isBooleanEncodedAsString(program, property)
        ? String(type.value)
        : type.value;
    case "Tuple":
      return type.values.map((value) =>
        jsonValueForType(program, value, visited, visibilityFilter),
      );
    case "EnumMember":
      return type.value ?? type.name;
    case "Model":
      if (isArrayModelType(program, type)) {
        if (visited.has(type)) return [];
        const itemType = arrayElementType(type);
        const { minItems, maxItems } = itemBounds(program, type, property);
        // A polymorphic array shows one item of every variant that fits.
        const polymorphic = itemType
          ? getPolymorphicVariants(program, itemType)
          : undefined;
        if (polymorphic && itemType && !visited.has(itemType)) {
          const count = itemCount(
            polymorphic.variants.length,
            minItems,
            maxItems,
          );
          return Array.from({ length: count }, (_, index) =>
            jsonValueForPolymorphicVariant(
              program,
              polymorphic,
              polymorphic.variants[index % polymorphic.variants.length],
              new Set(visited).add(type).add(itemType),
              visibilityFilter,
            ),
          );
        }
        const item = itemType
          ? jsonValueForType(
              program,
              itemType,
              new Set(visited).add(type),
              visibilityFilter,
            )
          : "unknown";
        return Array.from(
          { length: itemCount(1, minItems, maxItems) },
          () => item,
        );
      }
      if (isPlainRecordModel(program, type)) {
        if (visited.has(type)) return {};
        const valueType = type.indexer?.value;
        return {
          property: valueType
            ? jsonValueForType(
                program,
                valueType,
                new Set(visited).add(type),
                visibilityFilter,
              )
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
      if (visited.has(type)) return typeReference(program, type);
      if (getPolymorphicVariants(program, type)) {
        return jsonRepresentationForType(
          program,
          type,
          new Set(visited),
          visibilityFilter,
        );
      }
      const firstVariant = [...type.variants.values()][0];
      return firstVariant
        ? jsonValueForType(
            program,
            firstVariant.type,
            new Set(visited).add(type),
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
        property,
      );
    default:
      return typeReference(program, type);
  }
}

/**
 * Produces the JSON value sent for one variant of a polymorphic type, with the
 * discriminator set to the variant's value and listed first.
 *
 * - `@discriminator` models and `@discriminated` unions without an envelope
 *   put the discriminator beside the variant's own properties:
 *   `{ "kind": "dog", "barkVolume": 0 }`.
 * - `@discriminated` unions with `envelope: "object"` (the default) wrap the
 *   variant: `{ "kind": "circle", "value": { "radius": 0 } }`.
 *
 * @param program - The TypeSpec program.
 * @param info - The polymorphic type.
 * @param variant - The variant to render.
 * @param visited - Accumulator for cycle detection. Include `info.type`, so a
 *   variant that refers back to its polymorphic type does not recurse.
 * @param visibilityFilter - Optional HTTP visibility to filter model properties.
 * @returns A JSON-serializable value.
 */
export function jsonValueForPolymorphicVariant(
  program: Program,
  info: PolymorphicInfo,
  variant: PolymorphicVariant,
  visited: Set<Type>,
  visibilityFilter?: Visibility,
): unknown {
  const value = jsonValueForType(
    program,
    variant.type,
    new Set(visited),
    visibilityFilter,
  );
  if (info.envelope === "object") {
    return {
      [info.propertyName]: variant.value,
      [info.envelopePropertyName ?? "value"]: value,
    };
  }
  const record = asRecord(value);
  if (!record) return value;
  // A declared discriminator is already in place (root discriminators first);
  // an undeclared one (a `@discriminated` union variant) goes in front.
  return info.propertyName in record
    ? { ...record, [info.propertyName]: variant.value }
    : { [info.propertyName]: variant.value, ...record };
}

/**
 * Resolves the effective `@encode` data for a boolean-typed property or scalar.
 *
 * Checks the property itself first (`@encode(string) active: boolean;`), then
 * falls back to the property's scalar type declaration
 * (`@encode(string) scalar MyBool extends boolean;`).
 *
 * @param program - The TypeSpec program.
 * @param property - The model property to inspect, if available.
 */
function resolveBooleanEncode(
  program: Program,
  property?: ModelProperty,
): EncodeData | undefined {
  if (!property) {
    return undefined;
  }
  return (
    getEncode(program, property) ??
    (property.type.kind === "Scalar"
      ? getEncode(program, property.type)
      : undefined)
  );
}

/**
 * Returns `true` when the resolved `@encode` data represents a boolean
 * encoded as a string (`@encode(string)` on a `boolean`).
 *
 * `@encode(string)` on a boolean produces `EncodeData` whose `type` is the
 * `string` scalar and whose `encoding` is left `undefined` — so this checks
 * both `encoding === "string"` and whether `encode.type` resolves to `string`.
 *
 * @param program - The TypeSpec program.
 * @param property - The model property to inspect, if available.
 */
function isBooleanEncodedAsString(
  program: Program,
  property?: ModelProperty,
): boolean {
  return encodesAsString(resolveBooleanEncode(program, property));
}

/**
 * Determines whether an {@link EncodeData} resolution represents a
 * string-encoded value, either via an explicit `encoding: "string"` or by the
 * `type` field resolving to the built-in `string` scalar.
 *
 * @param encode - The resolved encode data, or `undefined` when no `@encode` applies.
 */
function encodesAsString(encode: EncodeData | undefined): boolean {
  if (!encode) {
    return false;
  }
  if (encode.encoding === "string") {
    return true;
  }
  let current: Scalar | undefined = encode.type;
  while (current) {
    if (current.name === "string") {
      return true;
    }
    current = current.baseScalar;
  }
  return false;
}

/**
 * Returns the `@minItems` / `@maxItems` bounds of an array occurrence: the
 * property's own first, then the array model's (`model Tags is string[]`).
 *
 * @param program - The TypeSpec program.
 * @param array - The array model.
 * @param property - The property the array came from, if any.
 */
function itemBounds(
  program: Program,
  array: Model,
  property: ModelProperty | undefined,
): { minItems?: number; maxItems?: number } {
  return {
    minItems:
      (property && getMinItems(program, property)) ??
      getMinItems(program, array),
    maxItems:
      (property && getMaxItems(program, property)) ??
      getMaxItems(program, array),
  };
}

/**
 * Returns how many items a sample array holds: `preferred`, raised to
 * `minItems` and capped at `maxItems`.
 *
 * @param preferred - The number of items the sample would like to show.
 * @param minItems - The array's `@minItems`, if any.
 * @param maxItems - The array's `@maxItems`, if any.
 */
function itemCount(
  preferred: number,
  minItems: number | undefined,
  maxItems: number | undefined,
): number {
  let count = Math.max(preferred, minItems ?? 0);
  if (maxItems !== undefined) count = Math.min(count, maxItems);
  return Math.max(count, 0);
}

/**
 * Returns the key that shows an additional property in a sample: the first of
 * `additionalProperty`, `additionalProperty2`, ... that is not the JSON wire
 * name of a declared property. Every declared property counts, including ones
 * a visibility filter leaves out, so the sample never overwrites or
 * reintroduces a declared field.
 *
 * @param program - The TypeSpec program.
 * @param model - The model that accepts additional properties.
 */
function additionalPropertyKey(program: Program, model: Model): string {
  const declared = new Set(
    payloadProperties(program, model).map((property) =>
      jsonPropertyName(program, property),
    ),
  );
  let key = "additionalProperty";
  for (let suffix = 2; declared.has(key); suffix++) {
    key = `additionalProperty${suffix}`;
  }
  return key;
}

/**
 * Returns a property's declared default (`name: string = "Unnamed"`) as JSON,
 * or `undefined` when it has none or the default cannot be serialized. A
 * declared `null` default is returned as `null`. A declared default is always
 * a value the server accepts, so it makes a better sample than a generic
 * placeholder.
 *
 * The default is serialized with the property's effective encoding: `@encode`
 * on the property or its scalar applies, and a value whose encoding targets
 * `string` (e.g. `@encode(string) active?: boolean = true`) becomes a string.
 *
 * @param program - The TypeSpec program.
 * @param property - The model property.
 */
export function defaultValueJson(
  program: Program,
  property: ModelProperty,
): unknown {
  if (!property.defaultValue) return undefined;
  try {
    // Passing the property applies its own `@encode` to scalar values.
    const value = serializeValueAsJson(
      program,
      property.defaultValue,
      property,
    );
    const encode =
      property.type.kind === "Scalar"
        ? resolveEncode(program, property.type, property)
        : getEncode(program, property);
    return (typeof value === "boolean" || typeof value === "number") &&
      encodesAsString(encode)
      ? String(value)
      : value;
  } catch {
    return undefined;
  }
}

/**
 * Where a sample value travels. It decides the default wire encoding of
 * `utcDateTime` and `offsetDateTime`: RFC 7231 in a header, RFC 3339 elsewhere,
 * matching `@typespec/http`.
 */
export type SampleLocation = "body" | "query" | "header";

/** The instant every date and time sample shows: 2024-01-15 09:30:00 UTC. */
const SAMPLE_INSTANT = {
  rfc3339: "2024-01-15T09:30:00Z",
  rfc3339Offset: "2024-01-15T10:30:00+01:00",
  rfc7231: "Mon, 15 Jan 2024 09:30:00 GMT",
  unixTimestamp: 1705311000,
};

/** Sample values for string `@format`s that a placeholder `"string"` would fail. */
const SAMPLE_FORMATS: Record<string, string> = {
  uuid: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  email: "user@example.com",
  uri: "https://example.com",
  url: "https://example.com",
  "date-time": SAMPLE_INSTANT.rfc3339,
  date: "2024-01-15",
  time: "09:30:00",
  hostname: "example.com",
  ipv4: "192.0.2.1",
  ipv6: "2001:db8::1",
};

/**
 * Returns a representative value for a TypeSpec scalar, as it appears on the
 * wire, so examples are payloads a server would accept.
 *
 * Walks the scalar's inheritance chain to the nearest built-in scalar:
 * - `utcDateTime` / `offsetDateTime` → RFC 3339, or RFC 7231 in a header, or
 *   per `@encode` (`rfc3339`, `rfc7231`, `unixTimestamp`)
 * - `plainDate` → `"2024-01-15"`, `plainTime` → `"09:30:00"`
 * - `duration` → ISO 8601 (`"PT1H30M"`), or per `@encode` (`seconds`,
 *   `milliseconds`)
 * - `bytes` → base64 (or base64url per `@encode`)
 * - `url` → `"https://example.com"`
 * - `string` → a value for its `@format` (`uuid`, `email`, ...), or
 *   `"string"` adjusted to `@minLength` / `@maxLength`
 * - `boolean` → `true`
 * - numeric scalars → `0`, moved inside `@minValue` / `@maxValue` (and their
 *   exclusive forms)
 *
 * `@encode` and constraints are read from `property` first, then from each
 * scalar in the chain. A value whose encoding targets `string` (e.g.
 * `@encode(string)` on a `boolean`) is rendered as a string. Falls back to the
 * scalar's own name when no built-in is found.
 *
 * @param program - The TypeSpec program.
 * @param type - The scalar type to generate a placeholder for.
 * @param property - The model property (or parameter) this scalar occurrence
 *   came from, if any.
 * @param location - Where the value travels; see {@link SampleLocation}.
 */
export function scalarPlaceholder(
  program: Program,
  type: Scalar,
  property?: ModelProperty,
  location: SampleLocation = "body",
): unknown {
  const encode = resolveEncode(program, type, property);
  const value = builtInPlaceholder(program, type, property, encode, location);
  return encodesAsString(encode) && typeof value !== "string"
    ? String(value)
    : value;
}

/**
 * Returns the placeholder for the nearest built-in scalar in `type`'s chain,
 * before any encode-as-string conversion. See {@link scalarPlaceholder}.
 *
 * @param program - The TypeSpec program.
 * @param type - The scalar type.
 * @param property - The property the scalar came from, if any.
 * @param encode - The resolved `@encode` data, if any.
 * @param location - Where the value travels.
 */
function builtInPlaceholder(
  program: Program,
  type: Scalar,
  property: ModelProperty | undefined,
  encode: EncodeData | undefined,
  location: SampleLocation,
): unknown {
  const defaultDateTimeEncoding = location === "header" ? "rfc7231" : "rfc3339";
  for (
    let current: Scalar | undefined = type;
    current;
    current = current.baseScalar
  ) {
    switch (current.name) {
      case "url":
        return "https://example.com";
      case "utcDateTime":
      case "offsetDateTime":
        switch (encode?.encoding ?? defaultDateTimeEncoding) {
          case "rfc7231":
            return SAMPLE_INSTANT.rfc7231;
          case "unixTimestamp":
            return SAMPLE_INSTANT.unixTimestamp;
          default:
            return current.name === "offsetDateTime"
              ? SAMPLE_INSTANT.rfc3339Offset
              : SAMPLE_INSTANT.rfc3339;
        }
      case "plainDate":
        return "2024-01-15";
      case "plainTime":
        return "09:30:00";
      case "duration":
        switch (encode?.encoding) {
          case "seconds":
            return 5400;
          case "milliseconds":
            return 5400000;
          default:
            return "PT1H30M";
        }
      case "bytes":
        return encode?.encoding === "base64url"
          ? "aGVsbG8gd29ybGQ"
          : "aGVsbG8gd29ybGQ=";
      case "string":
        return stringPlaceholder(program, type, property);
      case "boolean":
        return true;
    }
    if (
      current.name.startsWith("int") ||
      current.name.startsWith("uint") ||
      current.name.startsWith("float") ||
      current.name.startsWith("numeric")
    ) {
      return numericPlaceholder(program, type, property);
    }
  }
  return type.name;
}

/**
 * Returns a string sample honouring `@format`, `@minLength` and `@maxLength`.
 *
 * @param program - The TypeSpec program.
 * @param type - The string scalar (or a scalar derived from it).
 * @param property - The property the scalar came from, if any.
 */
function stringPlaceholder(
  program: Program,
  type: Scalar,
  property: ModelProperty | undefined,
): string {
  const minLength = constraint(program, type, property, getMinLength);
  const maxLength = constraint(program, type, property, getMaxLength);
  const format = constraint(program, type, property, getFormat);
  const formatted = format
    ? formatSample(format.toLowerCase(), minLength, maxLength)
    : undefined;
  if (formatted !== undefined) return formatted;

  let value = "string";
  if (minLength !== undefined && value.length < minLength) {
    value = value.padEnd(minLength, "s");
  }
  if (maxLength !== undefined && value.length > maxLength) {
    value = value.slice(0, maxLength);
  }
  return value;
}

/**
 * Returns a sample for a string `@format` whose length is within
 * `minLength`..`maxLength`, or `undefined` for a format with no known sample.
 *
 * The fixed sample (e.g. `user@example.com`) is used when it fits. Otherwise
 * `email`, `uri` / `url` and `hostname` samples are built to the nearest
 * fitting length, keeping the format valid; padding or cutting the fixed
 * sample would not. Fixed-shape formats (`uuid`, dates, IP addresses) keep
 * their sample, since no value of that format can meet a conflicting length.
 *
 * @param format - The `@format` value, lower-cased.
 * @param minLength - The string's `@minLength`, if any.
 * @param maxLength - The string's `@maxLength`, if any.
 */
function formatSample(
  format: string,
  minLength: number | undefined,
  maxLength: number | undefined,
): string | undefined {
  const fixed = SAMPLE_FORMATS[format];
  if (fixed === undefined) return undefined;
  const fits = (value: string) =>
    (minLength === undefined || value.length >= minLength) &&
    (maxLength === undefined || value.length <= maxLength);
  if (fits(fixed)) return fixed;

  const target = Math.min(
    Math.max(fixed.length, minLength ?? 0),
    maxLength ?? Number.POSITIVE_INFINITY,
  );
  let built: string | undefined;
  switch (format) {
    case "email": {
      const domain = "@ex.co";
      const local = target - domain.length;
      if (local >= 1) built = `${"u".repeat(local)}${domain}`;
      break;
    }
    case "uri":
    case "url": {
      const origin = "https://ex.co";
      if (target === origin.length) built = origin;
      else if (target > origin.length) {
        built = `${origin}/${"a".repeat(target - origin.length - 1)}`;
      }
      break;
    }
    case "hostname":
      if (target >= 4) built = hostnameOfLength(target);
      break;
  }
  return built !== undefined && fits(built) ? built : fixed;
}

/**
 * Builds a valid host name of exactly `length` characters (at least 4),
 * splitting it into DNS labels of at most 63 characters.
 *
 * @param length - The total length, including the `.co` suffix.
 */
function hostnameOfLength(length: number): string {
  const labels: string[] = [];
  let remaining = length - ".co".length;
  while (remaining > 63) {
    // Leave at least one character for the label after the dot.
    const size = remaining === 64 ? 62 : 63;
    labels.push("a".repeat(size));
    remaining -= size + 1;
  }
  labels.push("a".repeat(remaining));
  return `${labels.join(".")}.co`;
}

/**
 * Returns a number inside every `@minValue` / `@maxValue` (and exclusive)
 * bound that applies: `0` when it qualifies, otherwise the value nearest the
 * lower bound (or upper bound, when there is no lower one). Integer scalars
 * get an integer; when both ends are exclusive and close together, a
 * non-integer scalar gets the midpoint.
 *
 * @param program - The TypeSpec program.
 * @param type - The numeric scalar (or a scalar derived from it).
 * @param property - The property the scalar came from, if any.
 */
function numericPlaceholder(
  program: Program,
  type: Scalar,
  property: ModelProperty | undefined,
): number {
  const lower = tighterBound(
    constraint(program, type, property, getMinValue),
    constraint(program, type, property, getMinValueExclusive),
    "lower",
  );
  const upper = tighterBound(
    constraint(program, type, property, getMaxValue),
    constraint(program, type, property, getMaxValueExclusive),
    "upper",
  );
  const inside = (value: number) =>
    (!lower ||
      (lower.exclusive ? value > lower.value : value >= lower.value)) &&
    (!upper || (upper.exclusive ? value < upper.value : value <= upper.value));
  const integer = isIntegerScalar(type);

  const candidates: number[] = [0];
  if (lower) {
    candidates.push(
      integer
        ? lower.exclusive
          ? Math.floor(lower.value) + 1
          : Math.ceil(lower.value)
        : lower.exclusive
          ? lower.value + 1
          : lower.value,
    );
  }
  if (upper) {
    candidates.push(
      integer
        ? upper.exclusive
          ? Math.ceil(upper.value) - 1
          : Math.floor(upper.value)
        : upper.exclusive
          ? upper.value - 1
          : upper.value,
    );
  }
  if (lower && upper) {
    const middle = (lower.value + upper.value) / 2;
    candidates.push(integer ? Math.round(middle) : middle);
  }
  // No candidate fits only when the bounds conflict; show the lower bound.
  return candidates.find(inside) ?? lower?.value ?? upper?.value ?? 0;
}

/**
 * Combines an inclusive and an exclusive bound on the same side into the
 * tighter one. On a tie, the exclusive bound is tighter.
 *
 * @param inclusive - The `@minValue` / `@maxValue`, if any.
 * @param exclusive - The `@minValueExclusive` / `@maxValueExclusive`, if any.
 * @param side - Whether these are lower or upper bounds.
 */
function tighterBound(
  inclusive: number | undefined,
  exclusive: number | undefined,
  side: "lower" | "upper",
): { value: number; exclusive: boolean } | undefined {
  if (inclusive === undefined && exclusive === undefined) return undefined;
  if (inclusive === undefined) return { value: exclusive!, exclusive: true };
  if (exclusive === undefined) return { value: inclusive, exclusive: false };
  const exclusiveIsTighter =
    side === "lower" ? exclusive >= inclusive : exclusive <= inclusive;
  return exclusiveIsTighter
    ? { value: exclusive, exclusive: true }
    : { value: inclusive, exclusive: false };
}

/**
 * Returns `true` when `type` is, or derives from, an integer scalar
 * (`integer`, `int*`, `uint*`, `safeint`).
 *
 * @param type - The numeric scalar.
 */
function isIntegerScalar(type: Scalar): boolean {
  for (
    let current: Scalar | undefined = type;
    current;
    current = current.baseScalar
  ) {
    if (
      current.name === "integer" ||
      current.name === "safeint" ||
      /^u?int(8|16|32|64)?$/u.test(current.name)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Reads a constraint from `property` first, then from each scalar in `type`'s
 * chain, returning the first one set.
 *
 * @param program - The TypeSpec program.
 * @param type - The scalar type.
 * @param property - The property the scalar came from, if any.
 * @param read - The compiler accessor for the constraint (e.g. `getMinValue`).
 */
export function constraint<T>(
  program: Program,
  type: Scalar,
  property: ModelProperty | undefined,
  read: (program: Program, target: Type) => T | undefined,
): T | undefined {
  const own = property ? read(program, property) : undefined;
  if (own !== undefined) return own;
  for (
    let current: Scalar | undefined = type;
    current;
    current = current.baseScalar
  ) {
    const value = read(program, current);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Resolves the `@encode` data that applies to a scalar occurrence: the
 * property's own `@encode` first, then the nearest one in the scalar chain.
 *
 * @param program - The TypeSpec program.
 * @param type - The scalar type.
 * @param property - The property the scalar came from, if any.
 */
export function resolveEncode(
  program: Program,
  type: Scalar,
  property: ModelProperty | undefined,
): EncodeData | undefined {
  return constraint(program, type, property, (p, target) =>
    target.kind === "Scalar" || target.kind === "ModelProperty"
      ? getEncode(p, target)
      : undefined,
  );
}
