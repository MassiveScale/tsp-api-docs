/**
 * @module payloads
 *
 * Decides which TypeSpec types are *data* (and therefore get a type page), and
 * which of a model's properties are documented, by asking `@typespec/http` how
 * each operation's request and response bodies resolve instead of documenting
 * every model declared in the namespace.
 *
 * Terminology (see https://typespec.io/docs/libraries/http/operations/):
 * - A **metadata** property is one marked `@statusCode`, `@header`, `@cookie`,
 *   `@query` or `@path`.
 * - A **metadata-only model** has only metadata properties (e.g. `OkResponse`,
 *   or `model ETagHeader { @header("ETag") etag: string; }`). It describes HTTP
 *   details, not a data shape, and never gets a type page.
 * - A **response model** is used as an operation response and carries
 *   metadata. With an explicit `@body` / `@bodyRoot` only the body type is
 *   data, so the response model gets no type page. Without one, its plain
 *   properties form an *implicit body* and the model gets a type page that
 *   lists only those properties.
 *
 * Metadata-only and explicit-body models are collectively *envelope models*.
 * This mirrors the rule used by `@massivescale/tsp-aspnetcore-api`.
 */

import {
  getDiscriminator,
  getTypeName,
  isArrayModelType,
  isRecordModelType,
  walkPropertiesInherited,
  type Enum,
  type Model,
  type ModelProperty,
  type Operation,
  type Program,
  type Scalar,
  type Type,
  type Union,
} from "@typespec/compiler";
import {
  isBody,
  isBodyRoot,
  isCookieParam,
  isHeader,
  isMetadata,
  isMultipartBodyProperty,
  isStatusCode,
  type HttpOperation,
  type HttpOperationResponse,
  type HttpOperationResponseContent,
  type HttpPayloadBody,
} from "@typespec/http";
import {
  getMergePatchSource,
  isMergePatch,
} from "@typespec/http/experimental/merge-patch";

/** A named type that is a candidate for its own documentation page. */
export type DocumentableType = Model | Enum | Union | Scalar;

/**
 * Returns `true` when every property of `model` (including inherited ones) is
 * HTTP metadata. A model with no properties is not metadata-only.
 *
 * @param program - The TypeSpec program.
 * @param model - The model to inspect.
 */
export function isMetadataOnlyModel(program: Program, model: Model): boolean {
  const properties = [...walkPropertiesInherited(model)];
  return (
    properties.length > 0 &&
    properties.every((property) => isMetadata(program, property))
  );
}

/**
 * Returns `true` when `model` (or a base model) declares an explicit
 * `@body`, `@bodyRoot` or `@multipartBody` property.
 *
 * @param program - The TypeSpec program.
 * @param model - The model to inspect.
 */
export function hasExplicitBody(program: Program, model: Model): boolean {
  for (const property of walkPropertiesInherited(model)) {
    if (
      isBody(program, property) ||
      isBodyRoot(program, property) ||
      isMultipartBodyProperty(program, property)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns `true` for models that describe an HTTP envelope rather than data:
 * metadata-only models and response models with an explicit body. Envelope
 * models never get a type page.
 *
 * @param program - The TypeSpec program.
 * @param model - The model to inspect.
 */
export function isHttpEnvelopeModel(program: Program, model: Model): boolean {
  return isMetadataOnlyModel(program, model) || hasExplicitBody(program, model);
}

/**
 * Returns `true` for `@header`, `@cookie` and `@statusCode` properties. These
 * never appear in a JSON body. `@path` and `@query` properties are not
 * envelope properties: on a returned resource they are ordinary body data,
 * matching `@typespec/openapi3`.
 *
 * @param program - The TypeSpec program.
 * @param property - The property to inspect.
 */
export function isEnvelopeProperty(
  program: Program,
  property: ModelProperty,
): boolean {
  return (
    isHeader(program, property) ||
    isCookieParam(program, property) ||
    isStatusCode(program, property)
  );
}

/**
 * Returns `true` when `type` refers to a named envelope model, directly or
 * through an array, record, union or tuple. Such a type has no data shape.
 *
 * @param program - The TypeSpec program.
 * @param type - The property type to inspect.
 */
function referencesEnvelopeModel(program: Program, type: Type): boolean {
  switch (type.kind) {
    case "Model":
      if (isArrayModelType(program, type) || isRecordModelType(program, type)) {
        return type.indexer
          ? referencesEnvelopeModel(program, type.indexer.value)
          : false;
      }
      return Boolean(type.name) && isHttpEnvelopeModel(program, type);
    case "Union":
      return [...type.variants.values()].some((variant) =>
        referencesEnvelopeModel(program, variant.type),
      );
    case "UnionVariant":
      return referencesEnvelopeModel(program, type.type);
    case "Tuple":
      return type.values.some((value) =>
        referencesEnvelopeModel(program, value),
      );
    default:
      return false;
  }
}

/**
 * Returns `true` when `property` is part of a model's data shape and should
 * appear in property tables and JSON representations: it is not an envelope
 * property and its type does not reference an envelope model.
 *
 * @param program - The TypeSpec program.
 * @param property - The property to inspect.
 */
export function isPayloadProperty(
  program: Program,
  property: ModelProperty,
): boolean {
  return (
    !isEnvelopeProperty(program, property) &&
    !referencesEnvelopeModel(program, property.type)
  );
}

/**
 * Returns the documented properties of `model`, including inherited ones,
 * with every envelope property removed (see {@link isPayloadProperty}).
 *
 * @param program - The TypeSpec program.
 * @param model - The model whose properties to list.
 */
export function payloadProperties(
  program: Program,
  model: Model,
): ModelProperty[] {
  return [...walkPropertiesInherited(model)].filter((property) =>
    isPayloadProperty(program, property),
  );
}

/**
 * Returns the nearest base model that is not an envelope model. Envelope
 * ancestors have no type page, so the documented base skips over them.
 *
 * @param program - The TypeSpec program.
 * @param model - The model whose base chain to walk.
 */
export function payloadBaseModel(
  program: Program,
  model: Model,
): Model | undefined {
  let base = model.baseModel;
  while (base && isHttpEnvelopeModel(program, base)) base = base.baseModel;
  return base;
}

/**
 * Maps a resolved HTTP body type back to the named model it came from.
 *
 * For an implicit body (`model R { @header h: string; name: string; }`),
 * `@typespec/http` reports an anonymous model holding only the non-metadata
 * properties. This returns the named container model (`R`) instead, so the
 * documentation links to the type page that actually exists. Every other body
 * type is returned unchanged.
 *
 * @param bodyType - `HttpPayloadBody.type` as resolved by `@typespec/http`.
 * @param bodyProperty - The explicit `@body` / `@bodyRoot` property, if any.
 * @param container - The response (or request) type that holds the body.
 */
export function resolvePayloadType(
  bodyType: Type,
  bodyProperty: ModelProperty | undefined,
  container: Type | undefined,
): Type {
  if (
    bodyType.kind !== "Model" ||
    bodyType.name ||
    bodyProperty !== undefined ||
    container?.kind !== "Model" ||
    !container.name ||
    container === bodyType
  ) {
    return bodyType;
  }
  const containerProperties = new Set(
    [...walkPropertiesInherited(container)].map((property) => property.name),
  );
  const isSubset = [...bodyType.properties.keys()].every((name) =>
    containerProperties.has(name),
  );
  return isSubset ? container : bodyType;
}

/**
 * Returns the type a response content entry carries as data, with implicit
 * bodies mapped back to their named response model, or `undefined` when the
 * response has no body.
 *
 * @param response - The HTTP response (one status code) the content belongs to.
 * @param content - One content entry of that response.
 */
export function responsePayloadType(
  response: HttpOperationResponse,
  content: HttpOperationResponseContent,
): Type | undefined {
  const body = content.body;
  if (!body) return undefined;
  return resolvePayloadType(body.type, body.property, response.type);
}

/**
 * Returns the merge-patch source model (`T` in `MergePatchUpdate<T>`) when
 * `type` is a merge-patch model, otherwise `type` itself.
 *
 * In a versioned service the source is the original, unversioned model rather
 * than the version snapshot's copy of it, so compare the result with
 * {@link isSameDeclaration} rather than by identity.
 *
 * @param program - The TypeSpec program.
 * @param type - The type to unwrap.
 */
export function unwrapMergePatch(program: Program, type: Type): Type {
  if (type.kind === "Model" && isMergePatch(program, type)) {
    return getMergePatchSource(program, type) ?? type;
  }
  return type;
}

/**
 * Returns `true` when `left` and `right` are the same type, or the same
 * declaration seen through different versioning snapshots (same kind and
 * fully-qualified name).
 *
 * @param left - The first type.
 * @param right - The second type.
 */
export function isSameDeclaration(left: Type, right: Type): boolean {
  return (
    left === right ||
    (left.kind === right.kind && getTypeName(left) === getTypeName(right))
  );
}

/**
 * Returns the data types carried by an HTTP body. A multipart body yields the
 * type of each part instead of the multipart container model.
 *
 * @param body - The resolved HTTP body.
 */
function bodyTypes(body: HttpPayloadBody): Type[] {
  if (body.bodyKind === "multipart") {
    return body.parts.map((part) => part.body.type);
  }
  return [body.type];
}

/**
 * Selects the types that get a documentation page.
 *
 * When at least one operation resolves to an HTTP operation, a model, union or
 * scalar is documented only if it is reachable from an operation payload: a
 * request body, a response body (with implicit bodies mapped back to their
 * response model), or a parameter type — and transitively a payload property
 * type, documented base model, discriminated derived model, array/record
 * element, union variant, or `MergePatchUpdate<T>` source of one of those.
 * Enums are always documented, whether or not they are reachable.
 *
 * Operations that do not resolve to an HTTP operation are walked through their
 * TypeSpec return and parameter types instead, unwrapping explicit-body
 * response models to their body.
 *
 * When no operation resolves to an HTTP operation (e.g. a models-only
 * library), every candidate is documented except envelope models.
 *
 * Envelope models (metadata-only models and response models with an explicit
 * body) are never documented.
 *
 * @param program - The TypeSpec program.
 * @param candidates - Named types collected from the service namespace, keyed
 *   by entity ID (see `entityId` in `type-ref.ts`).
 * @param operations - The service's operations paired with their HTTP metadata.
 * @returns The subset of `candidates` to document, in the original order.
 */
export function selectDocumentedTypes<
  T extends { id: string; type: DocumentableType },
>(
  program: Program,
  candidates: T[],
  operations: Array<{
    operation: Operation;
    httpOperation: HttpOperation | undefined;
  }>,
): T[] {
  const isDocumentable = (type: DocumentableType) =>
    type.kind !== "Model" || !isHttpEnvelopeModel(program, type);

  if (operations.every((entry) => entry.httpOperation === undefined)) {
    return candidates.filter((entry) => isDocumentable(entry.type));
  }

  const reached = new Set<Type>();
  const visited = new Set<Type>();
  const candidatesById = new Map(
    candidates.map((entry) => [entry.id, entry.type]),
  );

  // A merge-patch source is the unversioned model; map it to this snapshot's copy.
  const snapshotType = (type: Model): Type => {
    const candidate = candidatesById.get(getTypeName(type));
    return candidate && isSameDeclaration(candidate, type) ? candidate : type;
  };

  const visitType = (type: Type): void => {
    if (visited.has(type)) return;
    visited.add(type);

    switch (type.kind) {
      case "Model":
        visitModel(type);
        return;
      case "Union":
        if (type.name) reached.add(type);
        for (const variant of type.variants.values()) visitType(variant.type);
        return;
      case "UnionVariant":
        visitType(type.type);
        return;
      case "Tuple":
        for (const value of type.values) visitType(value);
        return;
      case "Enum":
        reached.add(type);
        return;
      case "Scalar":
        reached.add(type);
        if (type.baseScalar) visitType(type.baseScalar);
        return;
      default:
        return;
    }
  };

  const visitModel = (model: Model): void => {
    if (isArrayModelType(program, model) || isRecordModelType(program, model)) {
      if (model.indexer) visitType(model.indexer.value);
      return;
    }
    if (isMergePatch(program, model)) {
      const source = getMergePatchSource(program, model);
      if (source) visitType(snapshotType(source));
      return;
    }
    if (!model.name) {
      for (const property of model.properties.values()) {
        visitType(property.type);
      }
      return;
    }
    if (isHttpEnvelopeModel(program, model)) return;

    reached.add(model);
    for (const property of payloadProperties(program, model)) {
      visitType(property.type);
    }
    const base = payloadBaseModel(program, model);
    if (base) visitType(base);
    if (isInDiscriminatedHierarchy(program, model)) {
      for (const derived of model.derivedModels) visitType(derived);
    }
  };

  // Walks a return type without HTTP metadata: a union of responses is not
  // itself data, and an explicit-body response model contributes only its body.
  const visitOperationType = (type: Type): void => {
    if (type.kind === "Union") {
      for (const variant of type.variants.values()) {
        visitOperationType(variant.type);
      }
      return;
    }
    if (type.kind === "Model" && type.name && hasExplicitBody(program, type)) {
      for (const property of walkPropertiesInherited(type)) {
        if (isBody(program, property) || isBodyRoot(program, property)) {
          visitType(property.type);
        }
      }
      return;
    }
    visitType(type);
  };

  for (const { operation, httpOperation } of operations) {
    if (!httpOperation) {
      visitOperationType(operation.returnType);
      for (const property of operation.parameters.properties.values()) {
        visitType(property.type);
      }
      continue;
    }

    for (const parameter of httpOperation.parameters.parameters) {
      visitType(parameter.param.type);
    }
    const requestBody = httpOperation.parameters.body;
    if (requestBody) {
      for (const type of bodyTypes(requestBody)) visitType(type);
    }

    for (const response of httpOperation.responses) {
      for (const content of response.responses) {
        if (!content.body) continue;
        if (content.body.bodyKind === "multipart") {
          for (const type of bodyTypes(content.body)) visitType(type);
          continue;
        }
        const payload = responsePayloadType(response, content);
        if (payload) visitType(payload);
      }
    }
  }

  return candidates.filter(
    (entry) =>
      isDocumentable(entry.type) &&
      (entry.type.kind === "Enum" || reached.has(entry.type)),
  );
}

/**
 * Returns `true` when `model` or one of its base models carries
 * `@discriminator`, meaning derived models are reachable through polymorphic
 * payloads.
 *
 * @param program - The TypeSpec program.
 * @param model - The model to inspect.
 */
function isInDiscriminatedHierarchy(program: Program, model: Model): boolean {
  for (
    let current: Model | undefined = model;
    current;
    current = current.baseModel
  ) {
    if (getDiscriminator(program, current)) return true;
  }
  return false;
}
